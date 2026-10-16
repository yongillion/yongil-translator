import {t,configureLanguage,localizeDocument} from './lib/i18n.mjs';
const $=id=>document.getElementById(id),rows=new Map();
let snapshot={entries:[],enabled:false,dropped:0},loading=false,again=false,language=null;
const rpc=async(type)=>{const response=await chrome.runtime.sendMessage({type});if(!response?.ok)throw Error(response?.error?.message||t('connectionCheck'));return response.data;};
function render(){
 const query=$('log-search').value.toLowerCase(),level=$('log-level').value||'all';
 const visible=snapshot.entries.filter(entry=>(level==='all'||entry.level===level)&&(!query||JSON.stringify(entry).toLowerCase().includes(query)));
 const ids=new Set(visible.map(entry=>entry.id));
 for(const [id,row]of rows)if(!ids.has(id)){row.remove();rows.delete(id);}
 for(const [index,entry]of visible.entries()){
  let row=rows.get(entry.id);
  if(!row){
   row=document.createElement('details');row.className='log-entry';row.dataset.level=entry.level;
   const summary=document.createElement('summary'),time=document.createElement('time'),badge=document.createElement('span'),event=document.createElement('span'),context=document.createElement('span'),pre=document.createElement('pre');
   badge.className='log-level';event.className='log-event';context.className='log-context';summary.append(time,badge,event,context);row.append(summary,pre);
   row.parts={time,badge,event,context,pre};row.addEventListener('toggle',()=>{if(row.open)pre.textContent=JSON.stringify(row.entry.details,null,2);});
   rows.set(entry.id,row);
  }
  const list=$('log-list');if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);
  row.entry=entry;const {time,badge,event,context,pre}=row.parts;
  time.dateTime=entry.time;time.textContent=new Date(entry.time).toLocaleTimeString(t('uiLocale'),{hour12:false});time.title=entry.time;
  badge.textContent=t(entry.level==='error'?'logError':entry.level==='warn'?'logWarn':'logInfo');event.textContent=entry.event;
  const info=entry.details||{};context.textContent=[info.model,info.attempt?t('logAttempt',[info.attempt,info.maxAttempts]):'',info.requestId?.slice(0,8),info.code,info.tabId!==undefined?'tab '+info.tabId:''].filter(Boolean).join(' · ');
  if(row.open)pre.textContent=JSON.stringify(info,null,2);
 }
 $('recording-state').textContent=t(snapshot.enabled?'logsRecording':'logsStopped');$('recording-state').dataset.recording=String(snapshot.enabled);
 $('log-count').textContent=t('logCount',[visible.length,snapshot.entries.length,snapshot.dropped]);$('log-empty').hidden=visible.length>0;
 if($('log-follow').checked)$('log-list').scrollTop=$('log-list').scrollHeight;
}
async function refresh(){
 if(loading){again=true;return;}loading=true;
 try{
  do{
   again=false;const [settings,data]=await Promise.all([rpc('settings.get'),rpc('logs.get')]);
   if(language!==settings.uiLanguage){await configureLanguage(settings.uiLanguage);localizeDocument();document.title='Yongil Translator · '+t('logsHeading');language=settings.uiLanguage;}
   document.documentElement.dataset.theme=settings.theme;snapshot=data;render();
   $('log-error').hidden=!snapshot.storageError;$('log-error').textContent=snapshot.storageError?t('logStorageError'):'';
  }while(again);
 }catch(e){$('log-error').hidden=false;$('log-error').textContent=e.message;}
 finally{loading=false;}
}
$('log-search').addEventListener('input',render);$('log-level').addEventListener('change',render);$('log-follow').addEventListener('change',render);
// Chromium closes this panel's own view without changing recording or other windows.
$('close-logs').addEventListener('click',()=>window.close());
$('clear-logs').addEventListener('click',async()=>{try{await rpc('logs.clear');await refresh();}catch(e){$('log-error').hidden=false;$('log-error').textContent=e.message;}});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(changes.developerLogs||changes.settings))void refresh();});
await refresh();
