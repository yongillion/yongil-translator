import {configureLanguage,localizeDocument,t} from './lib/i18n.mjs';
import {experimentalAIEnabled} from './lib/settings.mjs';
import {discoverChromeAI,chromeAILanguage,chromeAIOptions,chromeAIError,promptChromeAI} from './lib/chrome-ai.mjs';

let background=false,capability=false,enabled=false,setupRevision=0,prepareOptions=chromeAIOptions();
const $=id=>document.getElementById(id),controllers=new Map();
let port,connected=false,ready=false,preparing=null,tail=Promise.resolve(),closing=false,statusKey='chromeAISetupRequired',statusValues=[];
function status(key,values=[]){statusKey=key;statusValues=values;$('local-status').textContent=t(key,values);}
function controls(){
 $('prepare-local').hidden=ready||!!preparing||!capability;
 $('prepare-local').disabled=!connected;
 $('cancel-local').hidden=!ready&&!preparing;
}
function post(message){try{port?.postMessage(message);}catch{}}
function stop(explicit=false){
 background=false;
 ready=false;preparing?.abort();
 for(const controller of controllers.values())controller.abort();
 $('download-progress').hidden=true;controls();status(enabled?'chromeAISetupRequired':'chromeAIExperimentalRequired');post({type:'stopped',explicit});
}
function connect(){
 if(closing||!capability)return;
 port=chrome.runtime.connect({name:'chrome-ai-runner'});
 port.onMessage.addListener(message=>{
  if(message.type==='connected'){connected=true;controls();post({type:'inspect'});if(ready&&!background)post({type:'ready',options:prepareOptions});}
  if(message.type==='accepted'&&ready){background=message.background===true;status(background?'nativeBackgroundReady':'nativeTabRequired');}
  if(message.type==='background-state'&&message.background&&enabled){
   background=true;ready=true;
   if(message.pendingSetup){prepareOptions=message.pendingSetup;ready=false;status('chromeAISetupRequired');}
   else status('nativeBackgroundReady');controls();
  }
  if(message.type==='stop')stop();
  if(message.type==='cancel')controllers.get(message.id)?.abort();
  if(message.type!=='translate')return;
  if(!enabled||!ready){post({type:'error',id:message.id,code:'LOCAL_NOT_READY'});return;}
  const controller=new AbortController();controllers.set(message.id,controller);
  tail=tail.catch(()=>{}).then(async()=>{
   try{
    if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
    status('chromeAITranslating');
    // Include English instructions and reliably detected source languages in the probe.
    let sourceLanguages=[];
    if(chrome.i18n.detectLanguage){
     try{
      const source=message.blocks.flatMap(b=>b.nodes.map(n=>n.text)).join(' '),detected=await chrome.i18n.detectLanguage(source);
      if(detected.isReliable)sourceLanguages=detected.languages.filter(x=>x.percentage>=20&&x.language!=='und').map(x=>x.language.split('-')[0]);
     }catch{} // Detection is optional; the model can still reject unsupported input.
    }
    if(message.sourceLanguage)sourceLanguages=[chromeAILanguage(message.sourceLanguage)];
    prepareOptions=chromeAIOptions(chromeAILanguage(message.targetLanguage),sourceLanguages);
    const text=await promptChromeAI({...message,sourceLanguages},controller.signal,chunk=>post({type:'chunk',id:message.id,text:chunk}));
    post({type:'result',id:message.id,text});
   }catch(cause){
    const error=chromeAIError(cause);post({type:'error',id:message.id,code:error.name==='AbortError'?'CANCELLED':error.code});
    if(error.code==='LOCAL_NOT_READY'){ready=false;controls();status('chromeAISetupRequired');post({type:'stopped'});}
   }
   finally{controllers.delete(message.id);if(ready)status(background?'nativeBackgroundReady':'nativeTabRequired');}
  });
 });
 port.onDisconnect.addListener(()=>{
  // Reading lastError prevents an unchecked runtime error when the worker restarts.
  void chrome.runtime.lastError;connected=false;
  for(const controller of controllers.values())controller.abort();
  controls();if(!closing)setTimeout(connect,1500);
 });
}
$('prepare-local').addEventListener('click',()=>{
 if(!enabled||!connected||preparing||!capability)return;
 preparing=new AbortController();const controller=preparing;
 controls();status('chromeAIPreparing');$('download-progress').hidden=true;
 // create() is called directly in the click handler to retain user activation.
 let operation;try{operation=LanguageModel.create({...prepareOptions,signal:controller.signal,monitor(m){m.addEventListener('downloadprogress',event=>{
  $('download-progress').hidden=false;$('download-progress').value=event.loaded;
  status('chromeAIDownloadPercent',[Math.round(event.loaded*100)]);
 });}});}catch(error){operation=Promise.reject(error);}
 void operation.then(session=>{const compatible=typeof session.promptStreaming==='function'&&typeof session.destroy==='function';session.destroy?.();if(!compatible)throw new Error('Incompatible Prompt API session');if(controller.signal.aborted)return;ready=true;post({type:'ready',options:prepareOptions});status('nativeBackgroundChecking');})
  .catch(cause=>{ready=false;const error=chromeAIError(cause);status(!enabled?'chromeAIExperimentalRequired':error.name==='AbortError'?'jobCancelled':error.messageKey);})
  .finally(()=>{preparing=null;$('download-progress').hidden=true;controls();});
});
$('cancel-local').addEventListener('click',()=>stop(true));
window.addEventListener('pagehide',()=>{closing=true;stop();port?.disconnect();});
const {settings={}}=await chrome.storage.local.get('settings');
await configureLanguage(settings.uiLanguage);localizeDocument();document.documentElement.dataset.theme=settings.theme||'system';
async function initializeModel(settings){
 const revision=++setupRevision;enabled=experimentalAIEnabled(settings);capability=false;
 if(!enabled){stop(true);status('chromeAIExperimentalRequired');controls();return;}
 const support=await discoverChromeAI();if(revision!==setupRevision)return;
 capability=support.state!=='unavailable';
 if(!capability)status('chromeAIUnavailable');
 else{
  let target;try{target=chromeAILanguage(settings.targetLanguage);}catch{}
  prepareOptions=chromeAIOptions(support.languages.includes(target)?target:support.languages[0]);
  status('chromeAISetupRequired');if(!connected)connect();
 }
 controls();
}
await initializeModel(settings);
// A live document sends traffic to keep the bridge available during long inference.
setInterval(()=>{if(connected){post({type:'heartbeat'});post({type:'inspect'});}},20000);

chrome.storage.onChanged.addListener((changes,area)=>{
 const next=changes.settings?.newValue;if(area!=='local'||!next)return;
 if(enabled!==experimentalAIEnabled(next))void initializeModel(next);
 document.documentElement.dataset.theme=next.theme||'system';
 void configureLanguage(next.uiLanguage).then(()=>{localizeDocument();status(statusKey,statusValues);});
});
