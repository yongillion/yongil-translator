import {LANGUAGES} from './languages.mjs';
import {AppError,validateBlocks} from './protocol.mjs';
import {translationFormat} from './api.mjs';

// Keep the stored identifier stable across upgrades; the browser chooses the model.
export const CHROME_AI_MODEL='chrome-gemini-nano';
export function hasChromeAI(model=globalThis.LanguageModel){
 try{return typeof model?.availability==='function'&&typeof model?.create==='function';}catch{return false;}
}
export function chromeAILanguage(value){
 const match=LANGUAGES.find(([code,name])=>code.toLowerCase()===String(value).toLowerCase()||name===value);
 if(!match)throw new AppError('LANGUAGE','chromeAILanguages');
 return match[0].split('-')[0];
}
export function chromeAIOptions(language,sourceLanguages=[]){
 return {expectedInputs:[{type:'text',languages:[...new Set(['en',...sourceLanguages])]}],expectedOutputs:[{type:'text',...(language?{languages:[language]}:{})}]};
}
// Discovery never creates sessions or triggers model downloads. Unknown states fail closed.
export async function chromeAIAvailability(options=chromeAIOptions(),model=globalThis.LanguageModel,timeoutMs=3000){
 if(!hasChromeAI(model))return 'unavailable';
 let timeout;
 try{
  const state=await Promise.race([Promise.resolve().then(()=>model.availability(options)),new Promise(resolve=>{timeout=setTimeout(()=>resolve('unavailable'),timeoutMs);})]);
  return ['available','downloadable','downloading'].includes(state)?state:'unavailable';
 }catch{return 'unavailable';}finally{clearTimeout(timeout);}
}
export async function discoverChromeAI(model=globalThis.LanguageModel){
 const state=await chromeAIAvailability(chromeAIOptions(),model);
 if(state==='unavailable')return {state,languages:[]};
 const candidates=[...new Set(LANGUAGES.map(([code])=>code.split('-')[0]))];
 const languages=(await Promise.all(candidates.map(async language=>await chromeAIAvailability(chromeAIOptions(language),model)!=='unavailable'?language:null))).filter(Boolean);
 return {state:languages.length?state:'unavailable',languages};
}
export function chromeAIError(error){
 if(error instanceof AppError||error?.name==='AbortError')return error;
 if(error?.name==='NotSupportedError')return new AppError('LANGUAGE','chromeAILanguages');
 if(error?.name==='QuotaExceededError')return new AppError('CONTEXT','chromeAIContext');
 if(error?.name==='NotAllowedError')return new AppError('LOCAL_NOT_READY','chromeAISetupRequired');
 return new AppError('LOCAL_MODEL','chromeAIFailed');
}
export async function promptChromeAI({instructions,blocks,targetLanguage,sourceLanguages=[]},signal,onChunk,model=globalThis.LanguageModel){
 validateBlocks(blocks);
 const options=chromeAIOptions(chromeAILanguage(targetLanguage),sourceLanguages);
 let session;
 try{
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  if(!hasChromeAI(model))throw new AppError('LOCAL_UNAVAILABLE','chromeAIUnavailable');
  const availability=await model.availability(options);
  if(availability==='unavailable')throw new AppError('LANGUAGE','chromeAILanguages');
  if(availability!=='available')throw new AppError('LOCAL_NOT_READY','chromeAISetupRequired');
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  session=await model.create({...options,initialPrompts:[{role:'system',content:instructions}],signal});
  let text='';
  for await(const chunk of session.promptStreaming(JSON.stringify({blocks}),{responseConstraint:translationFormat.schema,signal})){
   if(signal.aborted)throw new DOMException('Aborted','AbortError');
   if(typeof chunk!=='string')throw new AppError('RESULT','resultFormat');
   text+=chunk;if(text.length>2000000)throw new AppError('RESULT','resultFormat');
   onChunk?.(chunk);
  }
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  return text;
 }catch(error){throw chromeAIError(error);}
 finally{session?.destroy();}
}
