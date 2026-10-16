import {t,configureLanguage,localeData} from './lib/i18n.mjs';
import {defaults,sanitizeSettings,migrateSettings,fingerprint} from './lib/settings.mjs';
import {AppError,RequestQueue,validateBlocks} from './lib/protocol.mjs';
import {storageReady,authStatus,startLogin,cancelLogin,signOut,observeLogin,watchLogin} from './lib/auth.mjs';
import {models,translate} from './lib/provider.mjs';

const queue=new RequestQueue(8),jobs=new Map();
const contentFiles=['document-core.js','selection-ui.js','content.js'];
const settingsReady=storageReady.then(async()=>{
 const {settings:stored}=await chrome.storage.local.get('settings');
 if(stored&&stored.blockShortcutDefaultVersion!==2)await chrome.storage.local.set({settings:migrateSettings(stored,defaults(chrome.i18n.getUILanguage()))});
});
async function settings(){await settingsReady;const {settings:s}=await chrome.storage.local.get('settings');return sanitizeSettings(s||{},defaults(chrome.i18n.getUILanguage()));}
const languageReady=settings().then(s=>configureLanguage(s.uiLanguage));
const isWeb=url=>/^https?:\/\//.test(url||'');
// Extension pages can be opened in tabs; trust their exact URL and extension ID.
const isUI=sender=>sender.id===chrome.runtime.id&&[chrome.runtime.getURL('popup.html'),chrome.runtime.getURL('options.html')].includes(sender.url?.split(/[?#]/)[0]);
function frameKey(sender){return sender.tab.id+':'+(sender.documentId||sender.frameId)+':';}
async function broadcast(type,data={}){
 const tabs=await chrome.tabs.query({});
 await Promise.allSettled(tabs.filter(t=>isWeb(t.url)).map(t=>chrome.tabs.sendMessage(t.id,{type,...data})));
}
async function saveSettings(patch){
 const next=sanitizeSettings(patch,await settings());await configureLanguage(next.uiLanguage);await chrome.storage.local.set({settings:next});
 await broadcast('settings.changed',{settings:next,locale:localeData()});return next;
}
async function registerScripts(){
 const {origins=[]}=await chrome.permissions.getAll();
 const matches=origins.filter(x=>/^https?:\/\//.test(x)&&!['https://auth.openai.com/*','https://chatgpt.com/*'].includes(x));
 await chrome.scripting.unregisterContentScripts({ids:['translator']}).catch(()=>{});
 if(matches.length)await chrome.scripting.registerContentScripts([{id:'translator',matches,js:contentFiles,runAt:'document_idle',allFrames:true,persistAcrossSessions:true}]);
}
async function requireSiteAccess(url){
 if(!isWeb(url))throw new AppError('PAGE','webpagesOnly');
 if(!await chrome.permissions.contains({origins:[new URL(url).origin+'/*']}))throw new AppError('PERMISSION','siteNotAllowed');
}
async function frames(tabId,inject=false){
 const tab=await chrome.tabs.get(tabId);await requireSiteAccess(tab.url);
 let injected=null;
 if(inject){
  try{injected=await chrome.scripting.executeScript({target:{tabId,allFrames:true},files:contentFiles});}
  catch{injected=await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},files:contentFiles});}
 }
 const all=await chrome.webNavigation.getAllFrames({tabId})||[{frameId:0,url:tab.url}];
 return injected?all.filter(f=>injected.some(result=>result.frameId===f.frameId)):all;
}
async function pageAction(tabId,action){
 await languageReady;
 if(!Number.isInteger(tabId))throw new AppError('PAGE','noTranslationTab');
 const all=await frames(tabId,action!=='page.status');
 const currentSettings=await settings();
 if(action!=='page.status'){for(const f of all){await chrome.tabs.sendMessage(tabId,{type:'content.enable',settings:currentSettings,locale:localeData()},{frameId:f.frameId}).catch(()=>{});}}
 if(action==='page.activate')action='page.status';
 let active;
 if(action==='page.select'){
  const statuses=await Promise.allSettled(all.map(f=>chrome.tabs.sendMessage(tabId,{type:'page.status'},{frameId:f.frameId})));
  active=!statuses.some(result=>result.status==='fulfilled'&&result.value?.picking);
 }
 const outcomes=await Promise.allSettled(all.map(f=>chrome.tabs.sendMessage(tabId,{type:action,...(active===undefined?{}:{active})},{frameId:f.frameId})));
 const data=outcomes.filter(x=>x.status==='fulfilled'&&x.value).map(x=>x.value);
 if(!data.length&&action!=='page.status')throw new AppError('PERMISSION','pageAccess');
 return {frames:data,translated:data.reduce((n,x)=>n+(x.translated||0),0),running:data.some(x=>x.running),total:data.reduce((n,x)=>n+(x.total||0),0),failed:data.reduce((n,x)=>n+(x.failed||0),0)};
}
async function contentAllowed(sender){
 if(!sender.tab||!isWeb(sender.url))throw new AppError('SENDER','documentUnsupported');
 await requireSiteAccess(sender.url);
 const tab=await chrome.tabs.get(sender.tab.id);if(new URL(tab.url).origin!==new URL(sender.url).origin)await requireSiteAccess(tab.url);
 const s=await settings();if(s.excludedSites.includes(new URL(sender.url).hostname))throw new AppError('EXCLUDED','siteExcluded');
 return s;
}
async function route(message,sender){
 await languageReady;
 if(!message||typeof message.type!=='string')throw new AppError('MESSAGE','requestInvalid');
 const ui=isUI(sender),content=!!sender.tab&&sender.id===chrome.runtime.id&&isWeb(sender.url);
 if(!ui&&!content)throw new AppError('SENDER','requestDenied');
 switch(message.type){
  case 'settings.get':return settings();
  case 'content.init':if(!content)throw new AppError('SENDER','notDocument');return {settings:await settings(),locale:localeData()};
  case 'job.begin':{
   if(!content)throw new AppError('SENDER','notDocument');
   const s=await contentAllowed(sender),auth=await authStatus();
   if(auth.state!=='connected')throw new AppError('AUTH_REQUIRED','connectAccountFirst');
   if(!s.modelId)throw new AppError('MODEL_REQUIRED','selectModelPopup');
    queue.setLimit(s.maxConcurrentBatches);
   const id=crypto.randomUUID(),key=frameKey(sender)+id;
   jobs.set(key,{settings:s,connectionId:auth.connectionId,created:Date.now(),tabId:sender.tab.id,frameId:sender.frameId});
   return {id,fingerprint:fingerprint(s)+'|'+auth.connectionId,target:s.targetLanguage,maxConcurrentBatches:s.maxConcurrentBatches};
  }
  case 'job.batch':{
   if(!content)throw new AppError('SENDER','notDocument');
   await contentAllowed(sender);
   const key=frameKey(sender)+String(message.jobId),job=jobs.get(key);
   if(!job)throw new AppError('INTERRUPTED','backgroundRestarted');
   validateBlocks(message.blocks);
   job.created=Date.now();
   return queue.run(key+':'+crypto.randomUUID(),async signal=>{
    if(!jobs.has(key))throw new DOMException('Aborted','AbortError');
    const timeout=AbortSignal.timeout(120000);
    const controller=new AbortController(),abort=()=>controller.abort();
    signal.addEventListener('abort',abort,{once:true});timeout.addEventListener('abort',abort,{once:true});
    if(signal.aborted)abort();
    try{return await translate(message.blocks,job.settings,job.connectionId,controller.signal);}
    finally{signal.removeEventListener('abort',abort);timeout.removeEventListener('abort',abort);}
   });
  }
  case 'job.cancel':case 'job.end':{
   if(!content)throw new AppError('SENDER','notDocument');
   const key=frameKey(sender)+String(message.jobId);queue.cancel(key+':');jobs.delete(key);return {};
  }
  case 'selection.finished':if(content)await chrome.tabs.sendMessage(sender.tab.id,{type:'selection.cancel'}).catch(()=>{});return {};
  case 'job.ping':return {alive:true};
  case 'page.translate':case 'page.restore':
   if(content&&!ui){await contentAllowed(sender);return pageAction(sender.tab.id,message.type);}
   break;
 }
 if(!ui)throw new AppError('SENDER','extensionOnly');
 switch(message.type){
  case 'settings.update':return saveSettings(message.patch);
  case 'settings.reset':return saveSettings(defaults(chrome.i18n.getUILanguage()));
  case 'auth.status':return authStatus();
  case 'auth.start':queue.cancel('');jobs.clear();return startLogin();
  case 'auth.cancel':await cancelLogin();return authStatus();
  case 'auth.signOut':queue.cancel('');jobs.clear();await signOut();await broadcast('job.stop');return {};
  case 'models.list':return models(!!message.force);
  case 'options.open':await chrome.runtime.openOptionsPage();return {};
  case 'cache.clear':await broadcast('cache.clear');return {};
  case 'page.activate':case 'page.translate':case 'page.restore':case 'page.select':case 'page.stop':case 'page.retry':case 'page.status':
   return pageAction(message.tabId,message.type);
  default:throw new AppError('MESSAGE','requestUnknown');
 }
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 route(message,sender).then(data=>reply({ok:true,data})).catch(e=>reply({ok:false,error:{code:e.name==='AbortError'?'CANCELLED':e.code||'UNEXPECTED',messageKey:e instanceof AppError?e.messageKey:undefined,substitutions:e instanceof AppError?e.substitutions:undefined,message:e instanceof AppError?e.message:e.name==='AbortError'?t('jobCancelled'):t('unexpectedError')}}));return true;
});
chrome.tabs.onUpdated.addListener((id,change,tab)=>{if(change.url||tab.pendingUrl)void observeLogin(id,tab.pendingUrl||change.url).catch(()=>{});});
chrome.tabs.onRemoved.addListener(id=>{
 queue.cancel(id+':');for(const key of jobs.keys())if(key.startsWith(id+':'))jobs.delete(key);
 void watchLogin();
});
chrome.webNavigation.onCommitted.addListener(details=>{
 for(const [key,job] of jobs)if(job.tabId===details.tabId&&job.frameId===details.frameId){queue.cancel(key+':');jobs.delete(key);}
 if(details.frameId===0){queue.cancel(details.tabId+':');for(const key of jobs.keys())if(key.startsWith(details.tabId+':'))jobs.delete(key);}
});
chrome.webNavigation.onBeforeNavigate.addListener(details=>{void observeLogin(details.tabId,details.url).catch(()=>{});},{url:[{hostEquals:'localhost',ports:[1455],pathEquals:'/auth/callback'}]});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='login-watch')void watchLogin();});
chrome.permissions.onAdded.addListener(()=>void registerScripts());
chrome.permissions.onRemoved.addListener(()=>{queue.cancel('');jobs.clear();void registerScripts();void broadcast('permissions.changed');});
chrome.runtime.onInstalled.addListener(()=>{void storageReady.then(()=>registerScripts());});
chrome.runtime.onStartup.addListener(()=>{void storageReady.then(()=>registerScripts());});
setInterval(()=>{for(const [key,job] of jobs)if(job.created<Date.now()-300000){queue.cancel(key+':');jobs.delete(key);}},60000);
