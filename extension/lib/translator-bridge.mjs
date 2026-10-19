import {attachNativeBackground,nativeStatus,enableNative,stopNative,requestNative} from './native-background.mjs';
import {AppError} from './protocol.mjs';

let runner=null,opening=null;
const pending=new Map();
const notReady=()=>new AppError('LOCAL_NOT_READY','translatorSetupRequired');
export async function translatorStatus(){
 const hidden=await nativeStatus('translator');if(hidden)return hidden;
 return {provider:'translator',state:runner?.ready?'connected':'signed_out',...(runner?.ready?{connectionId:runner.connectionId}:{})};
}
export async function stopTranslator(){
 await stopNative('translator');
 if(runner){runner.revision++;runner.ready=false;runner.port.postMessage({type:'stop'});}
 for(const task of [...pending.values()])task.reject(notReady());
}
export function attachTranslator(){
 attachNativeBackground();
 chrome.runtime.onConnect?.addListener(port=>{
  if(port.name!=='translator-runner')return;
  const sender=port.sender;
  if(sender?.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('translator.html')||!Number.isInteger(sender.tab?.id)||runner){port.disconnect();return;}
  const current={port,tabId:sender.tab.id,ready:false,revision:0,connectionId:'translator:'+crypto.randomUUID()};runner=current;
  port.onMessage.addListener(message=>{
   if(runner!==current)return;
   if(message?.type==='inspect'){void nativeStatus('translator').then(state=>{if(runner===current)port.postMessage({type:'background-state',...state});});return;}
   if(message?.type==='ready'){
    const revision=++current.revision;
    if(!current.ready)current.connectionId='translator:'+crypto.randomUUID();
    const accept=background=>{if(runner===current&&revision===current.revision){current.ready=true;port.postMessage({type:'accepted',background});}};
    if(message.options)void enableNative('translator',message.options,current.connectionId).then(accept).catch(async()=>{
     if(runner!==current||revision!==current.revision)return;
     await stopNative('translator');accept(false);
    });
    else accept(false);
    return;
   }
   if(message?.type==='stopped'){current.revision++;current.ready=false;if(message.explicit)void stopNative('translator');return;}
   const task=pending.get(message?.id);if(!task)return;
   if(message.type==='chunk'&&typeof message.text==='string')task.onChunk?.(message.text);
   if(message.type==='result'&&typeof message.text==='string')task.resolve(message.text);
   if(message.type==='error'){
    const errors={SOURCE_LANGUAGE:'translatorSourceUnknown',RESULT:'resultFormat',LANGUAGE:'translatorLanguages',CONTEXT:'translatorContext',LOCAL_NOT_READY:'translatorSetupRequired',LOCAL_MODEL:'translatorFailed'};
    task.reject(message.code==='CANCELLED'?new DOMException('Aborted','AbortError'):new AppError(errors[message.code]?message.code:'LOCAL_MODEL',errors[message.code]||'translatorFailed'));
   }
  });
  port.onDisconnect.addListener(()=>{
   if(runner!==current)return;runner=null;
   for(const task of [...pending.values()])task.reject(notReady());
  });
  port.postMessage({type:'connected'});
 });
}
export async function openTranslator(){
 if(opening)return opening;
 opening=(async()=>{
  const url=chrome.runtime.getURL('translator.html'),tabs=await chrome.tabs.query({url});
  const existing=tabs.find(tab=>tab.url===url);
  if(existing)await chrome.tabs.update(existing.id,{active:true});
  else await chrome.tabs.create({url,active:true});
  return {};
 })();try{return await opening;}finally{opening=null;}
}
export async function requestTranslator(payload,connectionId,signal,onChunk){
 if(await nativeStatus('translator'))return requestNative('translator',payload,connectionId,signal,onChunk);
 if(!runner?.ready)throw notReady();
 if(runner.connectionId!==connectionId)throw new AppError('ACCOUNT_CHANGED','accountChangedJob');
 const port=runner.port,id=crypto.randomUUID();
 return new Promise((resolve,reject)=>{
  const finish=fn=>value=>{pending.delete(id);signal?.removeEventListener('abort',abort);fn(value);};
  const abort=()=>{try{port.postMessage({type:'cancel',id});}catch{}task.reject(new DOMException('Aborted','AbortError'));};
  const task={resolve:finish(resolve),reject:finish(reject),onChunk};
  pending.set(id,task);signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted){abort();return;}
  try{port.postMessage({type:'translate',id,...payload});}catch{task.reject(notReady());}
 });
}
