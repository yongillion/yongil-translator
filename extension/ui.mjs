import {t,configureLanguage,localizeDocument} from './lib/i18n.mjs';
import {LANGUAGES,languageLabel,shortcutLabel,sanitizeSettings,defaults} from './lib/settings.mjs';
import {displayLanguage as languageDisplay,targetLanguageValue} from './lib/languages.mjs';
import {paintIcons} from './icons.mjs';
paintIcons();
const $=id=>document.getElementById(id),isOptions=document.body.classList.contains('options');
let state,account,tab,modelResult,recording=null,polling=false,sitePermission=null,permissionRevision=0,requestingAccess=false;
const rpc=async(type,data={})=>{const r=await chrome.runtime.sendMessage({type,...data});if(!r?.ok)throw new Error(r?.error?.message||t('connectionCheck'));return r.data;};
function feedback(message,success=false){
 const target=!isOptions&&account?.state==='connected'&&sitePermission!=='granted'?'permission-feedback':'feedback';
 for(const id of ['feedback','permission-feedback']){const el=$(id);if(!el)continue;el.hidden=!message||id!==target;el.textContent=id===target?message:'';el.classList.toggle('success',success);}
}
const action=(id,fn)=>{if($(id))$(id).addEventListener('click',()=>Promise.resolve().then(fn).catch(e=>feedback(e.message)));};
async function save(patch){state=await rpc('settings.update',{patch});document.documentElement.dataset.theme=state.theme;return state;}
function permissionCardView(){
 if(isOptions)return;
 const connected=account?.state==='connected',ready=connected&&sitePermission==='granted';
 document.body.dataset.siteAccess=sitePermission||'checking';
 for(const el of document.querySelectorAll('[data-connected-only]'))el.hidden=!ready;
 $('account-card').hidden=connected&&!ready;
 $('permission-card').hidden=!connected||ready;
 for(const id of ['allow-site','allow-all-sites']){$(id).hidden=sitePermission!=='missing';$(id).disabled=!connected||sitePermission!=='missing'||requestingAccess;}
 const unsupported=sitePermission==='unsupported',checking=!sitePermission;
 $('site-access-title').textContent=t(unsupported?'siteUnsupportedTitle':checking?'siteAccessChecking':'siteAccessTitle');
 $('site-state').textContent=t(unsupported?'siteUnsupportedNote':checking?'siteAccessCheckingNote':'siteAccessNote');
 $('site-host').textContent=/^https?:\/\//.test(tab?.url||'')?new URL(tab.url).hostname:'';
 $('site-host').hidden=!$('site-host').textContent;
 $('translate').disabled=!ready||!state?.modelId;
 for(const id of ['select-block','restore','stop','retry'])$(id).disabled=!ready;
 if(!ready){closeLanguage();if(connected)$('feedback').hidden=true;}
 else $('permission-feedback').hidden=true;
}
function setAccount(next){
 const changed=next.state!==account?.state||next.connectionId!==account?.connectionId;
 account=next;
 if(changed){sitePermission=null;permissionRevision++;feedback('');}
 accountView();return changed;
}
function accountView(){
 const connected=account?.state==='connected',busy=account?.state==='signing_in';
 document.body.dataset.connected=String(connected);
 if(isOptions)for(const el of document.querySelectorAll('[data-connected-only]'))el.hidden=!connected;
 if(!connected){closeLanguage();if(recording){$(recording.id).classList.remove('recording');recording=null;}}
 permissionCardView();
 $('account-title').textContent=connected?t('chatGPTConnected'):busy?t('signingIn'):t('connectChatGPT');
 $('account-email').textContent=connected?(account.email||t('connectedSubscription')):busy?t('finishSignIn'):account?.message||t('subscriptionPrompt');
 $('account-dot').classList.toggle('connected',connected);
 $('login').hidden=connected||busy;$('cancel-login').hidden=!busy;$('logout').hidden=!connected;
 $('refresh-models').disabled=!connected||(!isOptions&&sitePermission!=='granted');
}
async function loadModels(force=false){
 if(account?.state!=='connected'||(!isOptions&&sitePermission!=='granted'))return;
 $('refresh-models').disabled=true;
 const connectionId=account.connectionId;
 try{
  const result=await rpc('models.list',{force});
  if(account?.state!=='connected'||account.connectionId!==connectionId)return;
  modelResult=result;
  if(!state.modelId&&modelResult.items.length){
   await save({modelId:modelResult.items[0].id});
   if(account?.state!=='connected'||account.connectionId!==connectionId)return;
  }
  $('model').replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent=t('chooseModel');$('model').append(empty);
  for(const m of modelResult.items){const el=document.createElement('option');el.value=m.id;el.textContent=m.name;$('model').append(el);}
  if(state.modelId&&!modelResult.items.some(m=>m.id===state.modelId)){const unavailable=document.createElement('option');unavailable.value=state.modelId;unavailable.textContent=t('modelUnavailable',[state.modelId]);$('model').append(unavailable);}
  $('model').value=state.modelId;$('model-note').textContent=modelResult.stale?t('cachedModelList',[modelResult.warning||'']):'';
 }finally{$('refresh-models').disabled=false;accountView();}
}
function displayLanguage(value){return languageDisplay(value,t('uiLocale'));}
function targetValue(value){return targetLanguageValue(value,t('uiLocale'));}
let choices=[],active=-1;
function languageItems(query=''){
 const initial=displayLanguage(languageLabel(state.defaultLocale));
 const codes=new Map(LANGUAGES.map(([code,name])=>[displayLanguage(name),code]));
 const labels=[initial,...codes.keys()].filter((x,i,a)=>a.indexOf(x)===i),needle=query.trim().toLowerCase();
 choices=labels.filter(label=>!needle||label.toLowerCase().includes(needle)||codes.get(label)?.toLowerCase().includes(needle.replaceAll('_','-')));
 if(query.trim()&&!labels.includes(displayLanguage(targetValue(query))))choices.unshift(query.trim());
 $('language-list').replaceChildren();active=-1;
 choices.forEach((name,index)=>{
  const li=document.createElement('li');li.id='language-'+index;li.role='option';li.setAttribute('aria-selected','false');
  const text=document.createElement('span');text.textContent=name;li.append(text);
  if(name===initial){const badge=document.createElement('small');badge.textContent=t('browserLanguage');li.append(badge);}
  li.addEventListener('mousedown',e=>e.preventDefault());li.addEventListener('click',()=>chooseLanguage(name));$('language-list').append(li);
 });
}
function openLanguage(filter=false){languageItems(filter?$('target-language').value:'');$('language-list').hidden=false;$('target-language').setAttribute('aria-expanded','true');}
function closeLanguage(){$('language-list').hidden=true;$('target-language').setAttribute('aria-expanded','false');$('target-language').removeAttribute('aria-activedescendant');}
async function chooseLanguage(value){try{await save({targetLanguage:targetValue(value)});$('target-language').value=displayLanguage(state.targetLanguage);closeLanguage();return true;}catch(e){feedback(e.message);$('target-language').value=displayLanguage(state.targetLanguage);return false;}}
$('target-language').addEventListener('input',()=>openLanguage(true));
$('target-language').addEventListener('keydown',e=>{
 if(e.key==='Escape'){closeLanguage();e.preventDefault();}
 if(['ArrowDown','ArrowUp'].includes(e.key)){
  e.preventDefault();if($('language-list').hidden)openLanguage();
  if(!choices.length)return;active=(active+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length;
  [...$('language-list').children].forEach((el,i)=>el.setAttribute('aria-selected',String(i===active)));
  $('target-language').setAttribute('aria-activedescendant','language-'+active);$('language-list').children[active].scrollIntoView({block:'nearest'});
 }
 if(e.key==='Enter'){e.preventDefault();void chooseLanguage(active>=0?choices[active]:$('target-language').value);}
});
$('target-language').addEventListener('blur',()=>{closeLanguage();if($('target-language').value!==displayLanguage(state?.targetLanguage))void chooseLanguage($('target-language').value);});
action('language-toggle',()=>{if($('language-list').hidden)openLanguage();else closeLanguage();$('target-language').focus();});
$('model').addEventListener('change',()=>save({modelId:$('model').value}).then(accountView).catch(e=>feedback(e.message)));
action('refresh-models',()=>loadModels(true));
action('login',async()=>{await rpc('auth.start');setAccount(await rpc('auth.status'));await connectedView();});
action('cancel-login',async()=>{await rpc('auth.cancel');setAccount(await rpc('auth.status'));});
action('logout',async()=>{await rpc('auth.signOut');setAccount(await rpc('auth.status'));$('model').replaceChildren(new Option(t('connectFirst'),''));feedback(t('disconnectedMessage'),true);});
action('open-options',()=>rpc('options.open'));
action('edit-instructions',async()=>{await chrome.tabs.create({url:chrome.runtime.getURL('options.html#instructions')});});
async function page(type){
 if(!tab?.id)throw new Error(t('noWebpage'));
 if(!isOptions&&sitePermission!=='granted')throw new Error(t('siteNotAllowed'));
 if(!await chooseLanguage($('target-language').value))return;
 await rpc(type,{tabId:tab.id});await refreshProgress();
}
action('translate',()=>page('page.translate'));action('restore',()=>page('page.restore'));
action('select-block',async()=>{await page('page.select');window.close();});
action('stop',()=>page('page.stop'));action('retry',()=>page('page.retry'));
async function refreshProgress(){
 if(isOptions||!tab?.id||account?.state!=='connected'||sitePermission!=='granted')return;
 try{const s=await rpc('page.status',{tabId:tab.id});
  if(account?.state!=='connected'||sitePermission!=='granted')return;
  $('progress').hidden=!s.total&&!s.running;$('progress').textContent=s.running?t('progressRunning',[s.translated]):t('progressTranslated',[s.translated])+(s.failed?' · '+t('progressFailed',[s.failed]):'');
  $('stop').hidden=!s.running;$('retry').hidden=!s.failed;
  const message=s.frames?.map(f=>f.error).filter(Boolean)[0];if(message)feedback(message);
 }catch{}
}
async function permissionsView(){
 const revision=++permissionRevision;
 if(!isOptions){
  if(account?.state!=='connected'){sitePermission=null;permissionCardView();return;}
  const web=/^https?:\/\//.test(tab?.url||'');
  if(!web){sitePermission='unsupported';permissionCardView();return;}
  const origin=new URL(tab.url).origin+'/*';
  const has=await chrome.permissions.contains({origins:[origin]});
  if(revision!==permissionRevision||account?.state!=='connected')return;
  sitePermission=has?'granted':'missing';permissionCardView();
  return;
 }
 if(account?.state!=='connected')return;
 const granted=await chrome.permissions.getAll();
 if(revision!==permissionRevision||account?.state!=='connected')return;
 $('site-list').replaceChildren();
 const optional=granted.origins.filter(x=>!['https://auth.openai.com/*','https://chatgpt.com/*'].includes(x));
 for(const origin of optional){const row=document.createElement('div');row.className='row';const name=document.createElement('span');name.textContent=origin;
  const remove=document.createElement('button');remove.className='text-button';remove.textContent=t('clear');remove.addEventListener('click',()=>chrome.permissions.remove({origins:[origin]}).then(permissionsView).catch(e=>feedback(e.message)));row.append(name,remove);$('site-list').append(row);}
 if(!optional.length){const p=document.createElement('small');p.textContent=t('noSitesAllowed');$('site-list').append(p);}
}
for(const [id,allSites] of [['allow-site',false],['allow-all-sites',true]])$(id)?.addEventListener('click',()=>{
 if(requestingAccess||account?.state!=='connected'||sitePermission!=='missing'||!/^https?:\/\//.test(tab?.url||''))return;
 // Keep the permission request in the click gesture for either chosen scope.
 const connectionId=account.connectionId,origins=allSites?['http://*/*','https://*/*']:[new URL(tab.url).origin+'/*'];
 requestingAccess=true;permissionCardView();
 chrome.permissions.request({origins}).then(async granted=>{
  if(account?.state!=='connected'||account.connectionId!==connectionId)return;
  if(!granted){feedback(t('siteAccessDenied'));return;}
  feedback('');await connectedView();
  if(account?.state==='connected'&&account.connectionId===connectionId&&sitePermission==='granted')await rpc('page.activate',{tabId:tab.id});
 }).catch(e=>{if(account?.state==='connected'&&account.connectionId===connectionId)feedback(e.message);})
 .finally(()=>{requestingAccess=false;permissionCardView();});
});
if($('allow-all'))$('allow-all').addEventListener('click',()=>{
 chrome.permissions.request({origins:['http://*/*','https://*/*']}).then(granted=>{if(!granted)feedback(t('siteAccessDenied'));return permissionsView();}).catch(e=>feedback(e.message));
});
function shortcutFromEvent(e){return {alt:e.altKey,shift:e.shiftKey,ctrl:e.ctrlKey,meta:e.metaKey,code:/^(Alt|Shift|Control|Meta)(Left|Right)$/.test(e.code)?'':e.code};}
function shortcutsView(){
 if(!isOptions){
  for(const [id,key] of [['translate-key','pageShortcut'],['block-key','blockShortcut'],['restore-key','restoreShortcut']]){
   const value=state[key],label=value?shortcutLabel(value):'';
   $(id).textContent=value&&key==='blockShortcut'?t('blockShortcutClick',[label]):label;
   $(id).hidden=!value;
  }
  return;
 }
 $('record-page').textContent=shortcutLabel(state.pageShortcut);$('record-restore').textContent=shortcutLabel(state.restoreShortcut);$('record-block').textContent=shortcutLabel(state.blockShortcut);$('record-cancel').textContent=shortcutLabel(state.cancelShortcut);
}
function record(id,key){
 action(id,()=>{if(recording){$(recording.id).classList.remove('recording');}recording={id,key};$(id).classList.add('recording');$(id).textContent=t('recordKeys');});
 $(id)?.addEventListener('keydown',e=>{
  if(recording?.id!==id)return;e.preventDefault();e.stopPropagation();recording.value=shortcutFromEvent(e);
 });
 $(id)?.addEventListener('keyup',async e=>{
  if(recording?.id!==id||!recording.value)return;e.preventDefault();const current=recording;recording=null;
  try{await save({[current.key]:current.value});feedback(t('shortcutSaved'),true);}catch(err){feedback(err.message);}
  $(id).classList.remove('recording');shortcutsView();
 });
 $(id)?.addEventListener('blur',()=>{if(recording?.id===id){recording=null;$(id).classList.remove('recording');shortcutsView();}});
}
record('record-page','pageShortcut');record('record-restore','restoreShortcut');record('record-block','blockShortcut');record('record-cancel','cancelShortcut');
action('clear-page',async()=>{await save({pageShortcut:null});shortcutsView();});
action('clear-restore',async()=>{await save({restoreShortcut:null});shortcutsView();});
action('clear-block',async()=>{await save({blockShortcut:null});shortcutsView();});
action('clear-cancel',async()=>{await save({cancelShortcut:null});shortcutsView();});
$('shortcut-test')?.addEventListener('keydown',e=>{e.preventDefault();$('shortcut-test').value=shortcutLabel(shortcutFromEvent(e));});
function localizedSettingsView(){
 shortcutsView();
 if(!isOptions){$('instruction-status').textContent=state.instructionsEnabled?t('instructionsActive'):t('configureInstructions');return;}
 $('ui-language').value=state.uiLanguage||'auto';
 $('locale-note').textContent=t('localeSuggestion',[displayLanguage(languageLabel(state.defaultLocale))]);shortcutsView();
}
function settingsView(){
 $('target-language').value=displayLanguage(state.targetLanguage);document.documentElement.dataset.theme=state.theme;
 localizedSettingsView();if(!isOptions)return;
 $('max-concurrent-batches').value=state.maxConcurrentBatches;
 $('instructions-enabled').checked=state.instructionsEnabled;$('instructions-text').value=state.instructions;
 $('instruction-count').textContent=state.instructions.length+' / 4,000';$('excluded-sites').value=state.excludedSites.join('\n');$('theme').value=state.theme;shortcutsView();
}
$('instructions-text')?.addEventListener('input',()=>{$('instruction-count').textContent=$('instructions-text').value.length+' / 4,000';});
action('save-instructions',async()=>{await save({instructions:$('instructions-text').value,instructionsEnabled:$('instructions-enabled').checked});feedback(t('instructionsSaved'),true);});
action('save-sites',async()=>{await save({excludedSites:$('excluded-sites').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)});feedback(t('excludedSitesSaved'),true);});
$('max-concurrent-batches')?.addEventListener('change',async()=>{
 const input=$('max-concurrent-batches');
 try{await save({maxConcurrentBatches:input.valueAsNumber});feedback(t('concurrencySaved'),true);}
 catch(e){input.value=state.maxConcurrentBatches;feedback(e.message);}
});
$('theme')?.addEventListener('change',()=>save({theme:$('theme').value}).catch(e=>feedback(e.message)));
action('clear-cache',async()=>{await rpc('cache.clear');feedback(t('cacheCleared'),true);});
action('export-settings',()=>{
 const clean=sanitizeSettings(state,defaults(state.defaultLocale)),blob=new Blob([JSON.stringify(clean,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='yongil-translator-settings.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('import-settings')?.addEventListener('change',async()=>{
 try{const file=$('import-settings').files[0];if(!file)return;if(file.size>50000)throw new Error(t('settingsTooLarge'));
  const clean=sanitizeSettings(JSON.parse(await file.text()),defaults(state.defaultLocale));await save(clean);await configureLanguage(state.uiLanguage);localizeDocument();settingsView();await loadModels();feedback(t('settingsImported'),true);
 }catch(e){feedback(e.message);}finally{$('import-settings').value='';}
});
action('reset-settings',async()=>{if(!confirm(t('resetConfirm')))return;
 state=await rpc('settings.reset');await configureLanguage(state.uiLanguage);localizeDocument();settingsView();await loadModels();feedback(t('settingsReset'),true);});
async function connectedView(){
 if(account?.state!=='connected')return;
 await permissionsView();
 if(account?.state!=='connected'||(!isOptions&&sitePermission!=='granted'))return;
 const results=await Promise.allSettled([loadModels(),refreshProgress()]);
 if(account?.state==='connected')for(const r of results)if(r.status==='rejected')feedback(r.reason.message);
}
async function init(){
 const [settings,status]=await Promise.all([rpc('settings.get'),rpc('auth.status')]);
 state=settings;await configureLanguage(state.uiLanguage);localizeDocument();
 if(!isOptions)[tab]=await chrome.tabs.query({active:true,currentWindow:true});
 settingsView();setAccount(status);await connectedView();
}
async function refreshLanguage(){
 await configureLanguage(state.uiLanguage);localizeDocument();closeLanguage();
 $('target-language').value=displayLanguage(state.targetLanguage);localizedSettingsView();feedback('');accountView();await connectedView();
}
$('ui-language')?.addEventListener('change',async()=>{
 try{await save({uiLanguage:$('ui-language').value});await refreshLanguage();}catch(e){feedback(e.message);}
});
chrome.storage?.onChanged.addListener((changes,area)=>{
 const next=changes.settings?.newValue;
 if(area==='local'&&state&&next&&next.uiLanguage!==state.uiLanguage){state.uiLanguage=next.uiLanguage;void refreshLanguage().catch(e=>feedback(e.message));}
});
const refreshPermissions=()=>{
 if(!isOptions){sitePermission=null;permissionRevision++;permissionCardView();}
 void connectedView().catch(e=>feedback(e.message));
};
chrome.permissions.onAdded.addListener(refreshPermissions);
chrome.permissions.onRemoved.addListener(refreshPermissions);
await init().catch(e=>feedback(e.message));
setInterval(async()=>{
 if(polling||document.hidden)return;polling=true;
 try{
  const changed=setAccount(await rpc('auth.status'));
  if(changed)await connectedView();else await refreshProgress();
 }catch{}finally{polling=false;}
},1500);
