import {AppError} from './protocol.mjs';
import {chromeAILanguage,chromeAIOptions} from './chrome-ai.mjs';
const page='browser-ai.html',pending=new Map(),epochs=new Map();
let host=null,creating=null,attached=false,writes=Promise.resolve();
function updateRecord(provider,change){
 const operation=writes.catch(()=>{}).then(async()=>{const name=key(provider),previous=(await chrome.storage.local.get(name))[name],next=change(previous);if(next===undefined)return;if(next===null)await chrome.storage.local.remove(name);else await chrome.storage.local.set({[name]:next});});
 writes=operation;return operation;
}
const key=provider=>'nativeConnection_'+provider;
export const canRunHidden=()=>typeof chrome.offscreen?.createDocument==='function'&&typeof chrome.runtime.getContexts==='function';
const notReady=provider=>new AppError('LOCAL_NOT_READY',provider==='translator'?'translatorSetupRequired':'chromeAISetupRequired');
function failure(provider,code){
 const prefix=provider==='translator'?'translator':'chromeAI';
 const keys={SOURCE_LANGUAGE:'translatorSourceUnknown',RESULT:'resultFormat',LANGUAGE:prefix+'Languages',CONTEXT:prefix+'Context',LOCAL_NOT_READY:prefix+'SetupRequired',LOCAL_MODEL:prefix+'Failed'};
 return code==='CANCELLED'?new DOMException('Aborted','AbortError'):new AppError(keys[code]?code:'LOCAL_MODEL',keys[code]||prefix+'Failed');
}
export function attachNativeBackground(){
 if(attached)return;attached=true;
 chrome.runtime.onConnect?.addListener(port=>{
  if(port.name!=='browser-ai-background')return;
  if(port.sender?.id!==chrome.runtime.id||port.sender.url!==chrome.runtime.getURL(page)||port.sender.tab||host){port.disconnect();return;}
  host=port;
  port.onMessage.addListener(message=>{
   if(host!==port)return;
   const task=pending.get(message?.id);if(!task)return;
   if(message.type==='chunk'&&typeof message.text==='string')task.onChunk?.(message.text);
   if(message.type==='result'&&typeof message.text==='string')task.resolve(message.text);
   if(message.type==='error'){const error=failure(task.provider,message.code);error.setup=message.setup;task.reject(error);}
  });
  port.onDisconnect.addListener(()=>{if(host!==port)return;host=null;for(const task of [...pending.values()])task.reject(notReady(task.provider));});
 });
}
async function ensureHost(){
 if(host)return;
 if(!canRunHidden())throw notReady('chrome');
 if(!creating)creating=(async()=>{
  const contexts=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[chrome.runtime.getURL(page)]});
  if(!contexts.length)await chrome.offscreen.createDocument({url:page,reasons:['IFRAME_SCRIPTING'],justification:'Host and script a bundled same-origin iframe for window-only browser AI APIs after the preparation tab closes.'});
  const deadline=Date.now()+5000;
  while(!host&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
  if(!host)throw notReady('chrome');
 })().finally(()=>{creating=null;});
 await creating;
}
async function call(provider,payload,signal,onChunk){
 const epoch=epochs.get(provider)||0;
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 await ensureHost();
 if((epochs.get(provider)||0)!==epoch)throw notReady(provider);
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 const port=host,id=crypto.randomUUID();
 return new Promise((resolve,reject)=>{
  let timer;
  const finish=fn=>value=>{clearTimeout(timer);pending.delete(id);signal?.removeEventListener('abort',abort);fn(value);};
  const abort=()=>{try{port.postMessage({type:'cancel',id});}catch{}task.reject(new DOMException('Aborted','AbortError'));};
  const task={provider,resolve:finish(resolve),reject:finish(reject),onChunk};pending.set(id,task);
  signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>{try{port.postMessage({type:'cancel',id});}catch{}task.reject(notReady(provider));},payload.type==='prepare'?30000:120000);
  try{port.postMessage({...payload,id,provider});}catch{task.reject(notReady(provider));}
 });
}
export async function nativeStatus(provider){
 if(!canRunHidden())return null;
 const saved=(await chrome.storage.local.get(key(provider)))[key(provider)];
 return saved?.connectionId?{provider,state:'connected',connectionId:saved.connectionId,background:true,pendingSetup:saved.pendingSetup}:null;
}
export async function enableNative(provider,options,connectionId){
 if(!canRunHidden())return false;
 const epoch=epochs.get(provider)||0;
 await call(provider,{type:'prepare',options});
 if((epochs.get(provider)||0)!==epoch)throw notReady(provider);
 await updateRecord(provider,saved=>{if((epochs.get(provider)||0)!==epoch)throw notReady(provider);return {connectionId:saved?.connectionId||connectionId};});
 return true;
}
export async function stopNative(provider){
 epochs.set(provider,(epochs.get(provider)||0)+1);
 await updateRecord(provider,()=>null);
 try{host?.postMessage({type:'stop',provider});}catch{}
 for(const task of [...pending.values()])if(task.provider===provider)task.reject(notReady(provider));
}
export async function requestNative(provider,payload,connectionId,signal,onChunk){
 const epoch=epochs.get(provider)||0;
 const saved=await nativeStatus(provider);if(!saved)throw notReady(provider);
 if(saved.connectionId!==connectionId)throw new AppError('ACCOUNT_CHANGED','accountChangedJob');
 const detections={};
 for(const block of payload.sourceLanguage?[]:payload.blocks){try{detections[block.id]=await chrome.i18n.detectLanguage(block.nodes.map(n=>n.text).join(' '));}catch{}}
 const sourceLanguages=provider==='translator'?[]:payload.sourceLanguage?[chromeAILanguage(payload.sourceLanguage)]:[...new Set(Object.values(detections).filter(d=>d.isReliable).flatMap(d=>d.languages.filter(x=>x.percentage>=20&&x.language!=='und').map(x=>x.language.split('-')[0])))];
 const options=provider==='chrome'?chromeAIOptions(chromeAILanguage(payload.targetLanguage),sourceLanguages):undefined;
 if((epochs.get(provider)||0)!==epoch)throw notReady(provider);
 try{return await call(provider,{...payload,type:'translate',detections,sourceLanguages,options},signal,onChunk);}
 catch(error){
  if(error.code==='LOCAL_NOT_READY'&&error.setup)
   await updateRecord(provider,current=>current?.connectionId===connectionId?{connectionId,pendingSetup:error.setup}:undefined);
  throw error;
 }
}
