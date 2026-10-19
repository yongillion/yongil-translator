import {LANGUAGES} from './languages.mjs';
import {AppError,validateBlocks} from './protocol.mjs';

export const TRANSLATOR_MODEL='browser-translator';
export const hasTranslator=(api=globalThis.Translator)=>typeof api?.availability==='function'&&typeof api?.create==='function';
export function translatorLanguage(value){
 const code=LANGUAGES.find(([code,name])=>code===value||name===value)?.[0]||value;
 try{
  const locale=new Intl.Locale(code);
  if(locale.language==='und')throw Error();
  if(locale.language==='zh')return locale.script==='Hant'||['TW','HK','MO'].includes(locale.region)?'zh-Hant':'zh';
  return locale.baseName;
 }catch{throw new AppError('LANGUAGE','translatorLanguages');}
}
export async function translatorAvailability(pair,api=globalThis.Translator,timeoutMs=3000){
 if(!hasTranslator(api))return 'unavailable';let timer;
 try{
  const state=await Promise.race([api.availability(pair),new Promise(resolve=>{timer=setTimeout(()=>resolve('unavailable'),timeoutMs);})]);
  return ['available','downloadable','downloading'].includes(state)?state:'unavailable';
 }catch{return 'unavailable';}finally{clearTimeout(timer);}
}
// Read-only probes: no model creation/downloads and no browser-name assumptions.
export async function discoverTranslator(api=globalThis.Translator){
 if(!hasTranslator(api))return {state:'unavailable',pairs:[]};
 const targets=[...new Set(LANGUAGES.map(([code])=>translatorLanguage(code)))];
 const sources=[...new Set(['en',...targets.map(code=>code.startsWith('zh')?code:code.split('-')[0])])];
 const pairs=[],deadline=Date.now()+3000;let index=0;
 await Promise.all(Array.from({length:8},async()=>{
  while(index<targets.length&&Date.now()<deadline){
   const targetLanguage=targets[index++];
   for(const sourceLanguage of sources){
    if(sourceLanguage===targetLanguage)continue;
    const remaining=deadline-Date.now();if(remaining<=0)break;
    const pair={sourceLanguage,targetLanguage},state=await translatorAvailability(pair,api,remaining);
    if(state!=='unavailable'){pairs.push({...pair,state});break;}
   }
  }
 }));
 return {state:pairs.length?'available':'unavailable',pairs};
}
export function translatorError(cause){
 if(cause instanceof AppError||cause?.name==='AbortError')return cause;
 if(cause?.name==='NotSupportedError')return new AppError('LANGUAGE','translatorLanguages');
 if(cause?.name==='NotAllowedError')return new AppError('LOCAL_NOT_READY','translatorSetupRequired');
 if(cause?.name==='QuotaExceededError')return new AppError('CONTEXT','translatorContext');
 return new AppError('LOCAL_MODEL','translatorFailed');
}
export async function detectSource(text,hint,detect){
 let detected;
 try{detected=await detect?.(text);}catch{}
 const candidates=(detected?.languages||[]).filter(x=>x.language!=='und'&&x.percentage>0).sort((a,b)=>b.percentage-a.percentage);
 // Prefer reliable detection; short headings use the page's declared language.
 let declared;try{if(hint)declared=translatorLanguage(hint);}catch{}
 const value=detected?.isReliable&&candidates[0]?.language||declared||candidates[0]?.language;
 if(!value)throw new AppError('SOURCE_LANGUAGE','translatorSourceUnknown');
 const code=translatorLanguage(value);
 return code.startsWith('zh')?code:code.split('-')[0];
}
const pairKey=pair=>pair.sourceLanguage+'>'+pair.targetLanguage;
export class BrowserTranslator {
 constructor(api=globalThis.Translator){this.api=api;this.sessions=new Map();this.pending=new Map();this.generation=0;}
 destroy(){this.generation++;for(const session of this.sessions.values())session.destroy();this.sessions.clear();this.pending.clear();}
 // Call from a click handler for downloadable pairs. create() runs synchronously.
 prepare(pair,signal,monitor){
  const generation=this.generation,key=pairKey(pair);
  let operation;try{operation=this.api.create({...pair,signal,monitor});}catch(cause){operation=Promise.reject(cause);}
  return Promise.resolve(operation).then(session=>{
   if(signal?.aborted||generation!==this.generation){session.destroy?.();throw new DOMException('Aborted','AbortError');}
   if(typeof session.translate!=='function'||typeof session.destroy!=='function'){session.destroy?.();throw new AppError('LOCAL_MODEL','translatorFailed');}
   this.sessions.get(key)?.destroy();this.sessions.set(key,session);this.pending.delete(key);return session;
  }).catch(cause=>{throw translatorError(cause);});
 }
 async session(pair,signal){
  const key=pairKey(pair),existing=this.sessions.get(key);if(existing)return existing;
  const state=await translatorAvailability(pair,this.api);
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  if(state==='unavailable')throw new AppError('LANGUAGE','translatorLanguages');
  if(state!=='available'){this.pending.set(key,pair);throw new AppError('LOCAL_NOT_READY','translatorSetupRequired');}
  try{return await this.prepare(pair,signal);}catch(cause){if(cause.code==='LOCAL_NOT_READY')this.pending.set(key,pair);throw cause;}
 }
 async translate({blocks,targetLanguage},signal,detect,onNode){
  validateBlocks(blocks);const target=translatorLanguage(targetLanguage),result=[];let size=0;
  const check=()=>{if(signal?.aborted)throw new DOMException('Aborted','AbortError');};
  for(const block of blocks){
   check();const sourceText=block.nodes.map(node=>node.text).join(' ');
   const source=/\p{L}/u.test(sourceText)?await detectSource(sourceText,block.sourceLanguage,detect):null;
   check();const nodes=[];
   for(const node of block.nodes){
    check();let text=node.text;
    const same=source===target||source===target.split('-')[0]&&!target.startsWith('zh');
    if(source&&!same&&/\p{L}/u.test(text)){
     const pair={sourceLanguage:source,targetLanguage:target},session=await this.session(pair,signal);
     check();let translated;
     try{translated=await session.translate(text.trim(),{signal});}catch(cause){
      this.sessions.delete(pairKey(pair));session.destroy();throw translatorError(cause);
     }
     check();if(typeof translated!=='string'||!translated.trim())throw new AppError('RESULT','resultTextMissing');
     text=text.match(/^\s*/)[0]+translated.trim()+text.match(/\s*$/)[0];
     onNode?.({...pair,blockId:block.id,nodeId:node.id,input:node.text,output:text});
    }
    size+=text.length;if(size>150000)throw new AppError('RESULT','resultTooLarge');
    nodes.push({id:node.id,text});
   }
   result.push({id:block.id,nodes});
  }
  check();return JSON.stringify({blocks:result});
 }
}
