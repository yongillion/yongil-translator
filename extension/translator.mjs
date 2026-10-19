import {configureLanguage,localizeDocument,t} from './lib/i18n.mjs';
import {BrowserTranslator,discoverTranslator,translatorLanguage,translatorError} from './lib/translator.mjs';

const $=id=>document.getElementById(id),engine=new BrowserTranslator(),controllers=new Map();
let port,connected=false,ready=false,capability=false,closing=false,preparing=null,initialPair,tail=Promise.resolve();
let statusKey='translatorSetupRequired',statusValues=[];
function status(key,values=[]){statusKey=key;statusValues=values;$('local-status').textContent=t(key,values);}
function post(message){try{port?.postMessage(message);}catch{}}
function nextPair(){return engine.pending.values().next().value||(!ready?initialPair:null);}
function controls(){
 const pair=nextPair();
 $('prepare-local').hidden=!capability||!pair||!!preparing;$('prepare-local').disabled=!connected;
 $('cancel-local').hidden=!ready&&!preparing;
 $('language-pair').textContent=pair?pair.sourceLanguage+' → '+pair.targetLanguage:'';
}
function idle(){status(engine.pending.size?'translatorSetupRequired':ready?'translatorReady':'translatorSetupRequired');controls();}
function stop(){
 ready=false;preparing?.abort();for(const controller of controllers.values())controller.abort();engine.destroy();
 $('download-progress').hidden=true;idle();post({type:'stopped'});
}
function connect(){
 if(closing||!capability)return;
 port=chrome.runtime.connect({name:'translator-runner'});
 port.onMessage.addListener(message=>{
  if(message.type==='connected'){connected=true;controls();if(ready)post({type:'ready'});}
  if(message.type==='accepted')idle();
  if(message.type==='stop')stop();
  if(message.type==='cancel')controllers.get(message.id)?.abort();
  if(message.type!=='translate')return;
  if(!ready){post({type:'error',id:message.id,code:'LOCAL_NOT_READY'});return;}
  const controller=new AbortController();controllers.set(message.id,controller);
  tail=tail.catch(()=>{}).then(async()=>{
   try{
    status('translatorTranslating');
    const text=await engine.translate(message,controller.signal,source=>chrome.i18n.detectLanguage(source),node=>post({type:'chunk',id:message.id,text:JSON.stringify(node)+'\n'}));
    post({type:'result',id:message.id,text});
   }catch(cause){const error=translatorError(cause);post({type:'error',id:message.id,code:error.name==='AbortError'?'CANCELLED':error.code});}
   finally{controllers.delete(message.id);idle();}
  });
 });
 port.onDisconnect.addListener(()=>{
  void chrome.runtime.lastError;connected=false;for(const controller of controllers.values())controller.abort();controls();
  if(!closing)setTimeout(connect,1500);
 });
}
$('prepare-local').addEventListener('click',()=>{
 const pair=nextPair();if(!connected||preparing||!pair)return;
 const controller=new AbortController();preparing=controller;controls();status('translatorPreparing');
 // Preserve user activation. Each click prepares only the displayed language pair.
 const operation=engine.prepare(pair,controller.signal,monitor=>monitor.addEventListener('downloadprogress',event=>{
  $('download-progress').hidden=false;$('download-progress').value=event.loaded;
  status('translatorDownloadPercent',[Math.round(event.loaded*100)]);
 }));
 return operation.then(()=>{ready=true;post({type:'ready'});idle();})
  .catch(cause=>{const error=translatorError(cause);status(error.name==='AbortError'?'jobCancelled':error.messageKey);})
  .finally(()=>{preparing=null;$('download-progress').hidden=true;controls();});
});
$('cancel-local').addEventListener('click',stop);
window.addEventListener('pagehide',()=>{closing=true;stop();port?.disconnect();});
const {settings={}}=await chrome.storage.local.get('settings');
await configureLanguage(settings.uiLanguage);localizeDocument();document.documentElement.dataset.theme=settings.theme||'system';
const support=await discoverTranslator();capability=support.state!=='unavailable';
if(capability){
 let target;try{target=translatorLanguage(settings.targetLanguage);}catch{}
 initialPair=support.pairs.find(pair=>pair.targetLanguage===target)||support.pairs[0];
 initialPair={sourceLanguage:initialPair.sourceLanguage,targetLanguage:initialPair.targetLanguage};
 idle();connect();
}else status('translatorUnavailable');
controls();
setInterval(()=>{if(connected)post({type:'heartbeat'});},20000);
chrome.storage.onChanged.addListener((changes,area)=>{
 const next=changes.settings?.newValue;if(area!=='local'||!next)return;
 document.documentElement.dataset.theme=next.theme||'system';
 if(!ready&&!preparing){let target;try{target=translatorLanguage(next.targetLanguage);}catch{}const pair=support.pairs.find(p=>p.targetLanguage===target);if(pair)initialPair={sourceLanguage:pair.sourceLanguage,targetLanguage:pair.targetLanguage};}
 void configureLanguage(next.uiLanguage).then(()=>{localizeDocument();status(statusKey,statusValues);controls();});
});
