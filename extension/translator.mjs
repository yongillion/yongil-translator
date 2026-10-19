import {LANGUAGES,displayLanguage} from './lib/languages.mjs';
import {configureLanguage,localizeDocument,t,localeData} from './lib/i18n.mjs';
import {BrowserTranslator,discoverTranslator,translatorLanguage,translatorAvailability,translatorError} from './lib/translator.mjs';

const $=id=>document.getElementById(id),engine=new BrowserTranslator(),controllers=new Map();
let port,connected=false,ready=false,capability=false,closing=false,preparing=null,initialPair,tail=Promise.resolve();
let background=false,pairState='unavailable',pairRevision=0,lastPending='';
let statusKey='translatorSetupRequired',statusValues=[];
function status(key,values=[]){statusKey=key;statusValues=values;$('local-status').textContent=t(key,values);}
function post(message){try{port?.postMessage(message);}catch{}}
function nextPair(){return initialPair;}
function selectPair(pair){initialPair={sourceLanguage:pair.sourceLanguage,targetLanguage:pair.targetLanguage};$('source-language').value=pair.sourceLanguage;$('target-language').value=pair.targetLanguage;return checkPair();}
function languageOptions(){
 for(const id of ['source-language','target-language']){
  const options=[],seen=new Set();
  for(const [code,label] of LANGUAGES){const value=translatorLanguage(code);if(seen.has(value))continue;seen.add(value);const option=document.createElement('option');option.value=value;option.textContent=displayLanguage(label,localeData().language);options.push(option);}
  $(id).replaceChildren(...options);
 }
 if(initialPair){$('source-language').value=initialPair.sourceLanguage;$('target-language').value=initialPair.targetLanguage;}
}
async function checkPair(){
 const revision=++pairRevision;pairState='checking';controls();
 const pair=nextPair(),state=pair.sourceLanguage===pair.targetLanguage?'same':engine.sessions.has(pair.sourceLanguage+'>'+pair.targetLanguage)?'available':await translatorAvailability(pair);
 if(revision!==pairRevision)return;
 pairState=state;controls();
}
for(const id of ['source-language','target-language'])$(id).addEventListener('change',()=>{
 initialPair={sourceLanguage:$('source-language').value,targetLanguage:$('target-language').value};void checkPair();
});
function controls(){
 const pair=nextPair();
 $('prepare-local').hidden=!capability||!pair||!!preparing;$('prepare-local').disabled=!connected||!['available','downloadable','downloading'].includes(pairState);
 for(const id of ['source-language','target-language'])$(id).disabled=!!preparing||!capability;
 $('cancel-local').hidden=!ready&&!preparing;
 $('language-pair').textContent=pair?t(({checking:'translatorPairChecking',same:'translatorPairSame',unavailable:'translatorPairUnavailable',available:'translatorPairAvailable',downloadable:'translatorPairDownload',downloading:'translatorPairDownloading'})[pairState]):'';
}
function idle(){status(engine.pending.size?'translatorSetupRequired':ready?(background?'nativeBackgroundReady':'nativeTabRequired'):'translatorSetupRequired');controls();}
function stop(explicit=false){
 background=false;
 ready=false;preparing?.abort();for(const controller of controllers.values())controller.abort();engine.destroy();
 $('download-progress').hidden=true;idle();post({type:'stopped',explicit});
}
function connect(){
 if(closing||!capability)return;
 port=chrome.runtime.connect({name:'translator-runner'});
 port.onMessage.addListener(message=>{
  if(message.type==='connected'){connected=true;controls();post({type:'inspect'});if(ready&&!background)post({type:'ready',options:initialPair});}
  if(message.type==='accepted'){background=message.background===true;idle();}
  if(message.type==='background-state'&&message.background){
   background=true;ready=true;
   if(message.pendingSetup){const value=JSON.stringify(message.pendingSetup);if(value!==lastPending){lastPending=value;void selectPair(message.pendingSetup);}status('translatorSetupRequired');controls();}
   else idle();
  }
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
   finally{controllers.delete(message.id);const needed=engine.pending.values().next().value;if(needed)void selectPair(needed);idle();}
  });
 });
 port.onDisconnect.addListener(()=>{
  void chrome.runtime.lastError;connected=false;for(const controller of controllers.values())controller.abort();controls();
  if(!closing)setTimeout(connect,1500);
 });
}
$('prepare-local').addEventListener('click',()=>{
 const pair=nextPair();if(!connected||preparing||!pair||!['available','downloadable','downloading'].includes(pairState))return;
 const controller=new AbortController();preparing=controller;controls();status('translatorPreparing');
 // Preserve user activation. Each click prepares only the displayed language pair.
 const operation=engine.prepare(pair,controller.signal,monitor=>monitor.addEventListener('downloadprogress',event=>{
  $('download-progress').hidden=false;$('download-progress').value=event.loaded;
  status('translatorDownloadPercent',[Math.round(event.loaded*100)]);
 }));
 return operation.then(()=>{ready=true;post({type:'ready',options:pair});status('nativeBackgroundChecking');void checkPair();})
  .catch(cause=>{const error=translatorError(cause);status(error.name==='AbortError'?'jobCancelled':error.messageKey);})
  .finally(()=>{preparing=null;$('download-progress').hidden=true;controls();});
});
$('cancel-local').addEventListener('click',()=>stop(true));
window.addEventListener('pagehide',()=>{closing=true;stop();port?.disconnect();});
const {settings={}}=await chrome.storage.local.get('settings');
await configureLanguage(settings.uiLanguage);localizeDocument();document.documentElement.dataset.theme=settings.theme||'system';
const support=await discoverTranslator();capability=support.state!=='unavailable';
if(capability){
 let target;try{target=translatorLanguage(settings.targetLanguage);}catch{}
 initialPair=support.pairs.find(pair=>pair.targetLanguage===target)||support.pairs[0];
 initialPair={sourceLanguage:initialPair.sourceLanguage,targetLanguage:initialPair.targetLanguage};
 languageOptions();await selectPair(initialPair);idle();connect();
}else status('translatorUnavailable');
controls();
setInterval(()=>{if(connected){post({type:'heartbeat'});post({type:'inspect'});}},20000);
chrome.storage.onChanged.addListener((changes,area)=>{
 const next=changes.settings?.newValue;if(area!=='local'||!next)return;
 document.documentElement.dataset.theme=next.theme||'system';
 if(!ready&&!preparing){let target;try{target=translatorLanguage(next.targetLanguage);}catch{}const pair=support.pairs.find(p=>p.targetLanguage===target);if(pair)void selectPair(pair);}
 void configureLanguage(next.uiLanguage).then(()=>{localizeDocument();languageOptions();status(statusKey,statusValues);controls();});
});
