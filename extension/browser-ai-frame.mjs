import {BrowserTranslator,translatorError} from './lib/translator.mjs';
import {chromeAIAvailability,chromeAIError,promptChromeAI} from './lib/chrome-ai.mjs';
import {AppError} from './lib/protocol.mjs';
const engine=new BrowserTranslator(),controllers=new Map();
let tail=Promise.resolve();
function stop(provider){for(const task of controllers.values())if(task.provider===provider)task.controller.abort();if(provider==='translator')engine.destroy();}
async function execute(message,signal,emit){
 const {provider,options}=message;
 if(message.type==='prepare'){
  if(provider==='translator')await engine.session(options,signal);
  else {
   if(await chromeAIAvailability(options)!=='available')throw new AppError('LOCAL_NOT_READY','chromeAISetupRequired');
   const session=await LanguageModel.create({...options,signal});
   try{if(typeof session.promptStreaming!=='function'||typeof session.destroy!=='function')throw new AppError('LOCAL_MODEL','chromeAIFailed');}
   finally{session.destroy?.();}
  }
  return '';
 }
 if(provider==='translator'){
  const detections=new Map(message.blocks.map(b=>[b.nodes.map(n=>n.text).join(' '),message.detections?.[b.id]]));
  return engine.translate(message,signal,text=>detections.get(text),node=>emit({type:'chunk',id:message.id,text:JSON.stringify(node)+'\n'}));
 }
 return promptChromeAI(message,signal,text=>emit({type:'chunk',id:message.id,text}));
}
// The offscreen parent scripts this same-origin iframe. It owns all extension APIs;
// this document owns only window-scoped AI sessions and their lifetime.
window.runBrowserAI=(message,emit)=>{
 if(message.type==='cancel'){controllers.get(message.id)?.controller.abort();return;}
 if(message.type==='stop'){stop(message.provider);return;}
 if(!['prepare','translate'].includes(message.type)||!['chrome','translator'].includes(message.provider))return;
 const controller=new AbortController();controllers.set(message.id,{controller,provider:message.provider});
 tail=tail.catch(()=>{}).then(async()=>{
  try{
   if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
   document.getElementById('state').textContent=message.type;
   const text=await execute(message,controller.signal,emit);
   if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
   emit({type:'result',id:message.id,text});
  }catch(cause){
   const error=(message.provider==='translator'?translatorError:chromeAIError)(cause);
   emit({type:'error',id:message.id,code:error.name==='AbortError'?'CANCELLED':error.code,
    ...(error.code==='LOCAL_NOT_READY'?{setup:message.provider==='translator'?engine.pending.values().next().value:message.options}: {})});
  }finally{controllers.delete(message.id);document.getElementById('state').textContent='Idle';}
 });
};
window.addEventListener('pagehide',()=>{stop('chrome');stop('translator');});
window.parent.postMessage({type:'browser-ai-frame-ready'},location.origin);
