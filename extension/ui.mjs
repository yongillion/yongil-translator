import {t,configureLanguage,localizeDocument} from './lib/i18n.mjs';
import {LANGUAGES,languageLabel,shortcutLabel,sanitizeSettings,defaults,experimentalAIEnabled} from './lib/settings.mjs';
import {displayLanguage as languageDisplay,targetLanguageValue} from './lib/languages.mjs';
import {paintIcons} from './icons.mjs';
import {discoverChromeAI,chromeAILanguage} from './lib/chrome-ai.mjs';
import {discoverTranslator,translatorLanguage,translatorAvailability} from './lib/translator.mjs';
import {nativeSourceLanguages} from './lib/native-languages.mjs';
let sourceInitialization;
let sourceDocument='',sourceLanguage='',sourceLoaded=false,sourceChoices=[],sourceActive=-1,languageControlsKey='',languageControlsRevision=0;
let capabilitiesReady=false;
let translatorAvailable=false,translatorLanguages=new Set();
const translatorDiscovery=discoverTranslator();
function supportedTranslatorLanguage(value){try{return translatorLanguages.has(translatorLanguage(value));}catch{return false;}}
function nativeProvider(){return ['chrome','translator'].includes(account?.provider);}
function supportedTarget(value){return account?.provider==='translator'?supportedTranslatorLanguage(value):supportedLocalLanguage(value);}
let chromeAIAvailable=false,localLanguages=new Set();
let localDiscoveryKey,localDiscoveryRevision=0,localDiscovery=Promise.resolve();
function refreshChromeAI(){
 const enabled=experimentalAIEnabled(state);if(localDiscoveryKey===enabled)return localDiscovery;
 localDiscoveryKey=enabled;const revision=++localDiscoveryRevision;chromeAIAvailable=false;localLanguages=new Set();languageControlsKey='';
 localDiscovery=(async()=>{
  if(!enabled)return;
  const capability=await discoverChromeAI();if(revision!==localDiscoveryRevision)return;
  chromeAIAvailable=capability.state!=='unavailable';localLanguages=new Set(capability.languages);languageControlsKey='';
 })();return localDiscovery;
}
function experimentsView(){
 if(!isOptions)return;
 $('experimental-features').checked=!!state?.experimentalFeatures;
 $('on-device-ai-enabled').checked=!!state?.onDeviceAIEnabled;
 $('experimental-options').hidden=!state?.experimentalFeatures;
}
async function refreshExperiments(){
 experimentsView();const pending=refreshChromeAI();accountView();await pending;
 setAccount(await rpc('auth.status'));await connectedView();
}
function supportedLocalLanguage(value){try{return localLanguages.has(chromeAILanguage(value));}catch{return false;}}
paintIcons();
const $=id=>document.getElementById(id),isOptions=document.body.classList.contains('options');
let state,account,tab,windowId,modelResult,recording=null,polling=false,sitePermission=null,permissionRevision=0,requestingAccess=false;
let connectionBusy=false,editingAPIKey=false;
const rpc=async(type,data={})=>{const r=await chrome.runtime.sendMessage({type,...data});if(!r?.ok)throw new Error(r?.error?.message||t('connectionCheck'));return r.data;};
function feedback(message,success=false){
 const target=!isOptions&&account?.state==='connected'&&sitePermission!=='granted'?'permission-feedback':'feedback';
 for(const id of ['feedback','permission-feedback']){const el=$(id);if(!el)continue;el.hidden=!message||id!==target;el.textContent=id===target?message:'';el.classList.toggle('success',success);}
}
const action=(id,fn)=>{if($(id))$(id).addEventListener('click',()=>Promise.resolve().then(fn).catch(e=>feedback(e.message)));};
async function save(patch){state=await rpc('settings.update',{patch,connectionId:account?.connectionId});document.documentElement.dataset.theme=state.theme;return state;}
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
 $('translate').disabled=!ready||!sourceLoaded||!state?.modelId||nativeProvider()&&!supportedTarget(state?.targetLanguage);
 for(const id of ['select-block','restore','stop','retry'])$(id).disabled=!ready||(['select-block','retry'].includes(id)&&!sourceLoaded);
 if(!ready){closeLanguage();closeSource();if(connected)$('feedback').hidden=true;}
 else $('permission-feedback').hidden=true;
}
function setAccount(next){
 const changed=next.state!==account?.state||next.connectionId!==account?.connectionId||next.provider!==account?.provider;
 account=(next.provider==='chrome'&&!chromeAIAvailable||next.provider==='translator'&&!translatorAvailable)?{...next,state:'signed_out'}:next;
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
 const translator=account?.provider==='translator'&&translatorAvailable,localAI=account?.provider==='chrome'&&chromeAIAvailable,claude=account?.provider==='claude',api=account?.provider==='api'||claude;
 $('use-chrome').hidden=!chromeAIAvailable;
 $('use-translator').hidden=!translatorAvailable;
 $('open-translator').hidden=!translator;$('open-translator').disabled=connectionBusy;
 $('open-chrome-ai').hidden=!localAI;$('open-chrome-ai').disabled=connectionBusy;
 for(const [id,selected]of [['use-subscription',!api&&!localAI&&!translator],['use-api',api&&!claude],['use-claude',claude],['use-chrome',localAI],['use-translator',translator]]){$(id).setAttribute('aria-pressed',String(selected));$(id).disabled=connectionBusy;}
 $('login').hidden||=api||localAI||translator;$('login').disabled=connectionBusy;$('logout').disabled=connectionBusy;
 $('api-key-form').hidden=!api||connected&&!editingAPIKey;
 $('api-key').disabled=connectionBusy;$('connect-api').disabled=connectionBusy;
 $('connect-api').textContent=t(connectionBusy?'apiConnecting':claude?'connectClaude':'connectAPI');
 $('replace-api-key').hidden=!api||!connected||editingAPIKey;$('replace-api-key').disabled=connectionBusy;
 $('connection-note').textContent=t(claude?'claudeBillingNote':api?'apiBillingNote':'subscriptionConnectionNote');
 $('usage-link').href=claude?'https://platform.claude.com/usage':api?'https://platform.openai.com/usage':'https://chatgpt.com/codex/settings/usage';
 if($('usage-note'))$('usage-note').textContent=t(claude?'claudeUsage':api?'apiUsage':'subscriptionUse');
 $('api-key').placeholder=claude?'sk-ant-…':'sk-…';
 if(api){$('account-title').textContent=t(claude?(connected?'claudeConnected':'connectClaude'):(connected?'apiConnected':'connectAPI'));$('account-email').textContent=t(connected?'apiKeySaved':'apiKeyPrompt');}
 if(localAI){
  $('account-title').textContent=t(connected?'chromeAIConnected':'chromeAITitle');
  $('account-email').textContent=t(connected?'chromeAIReady':'chromeAISetupRequired');
  $('connection-note').textContent=t('chromeAINote')+' '+t('chromeAILanguages');
  if($('usage-note'))$('usage-note').textContent=t('chromeAIUsage');
  $('model-note').textContent=t(supportedLocalLanguage(state?.targetLanguage)?'chromeAIExecutionNote':'chromeAILanguages');
 }
 if(translator){
  $('account-title').textContent=t(connected?'translatorConnected':'translatorTitle');
  $('account-email').textContent=t(connected?'translatorReady':'translatorSetupRequired');
  $('connection-note').textContent=t('translatorNote');
  if($('usage-note'))$('usage-note').textContent=t('translatorTitle');
  $('model-note').textContent=t(supportedTranslatorLanguage(state?.targetLanguage)?'translatorExecutionNote':'translatorLanguages');
 }
 for(const id of ['edit-instructions','instructions','instructions-nav'])if($(id))$(id).hidden=account?.provider==='translator'||!connected;
 $('usage-link').hidden=localAI||translator||!connected;
 for(const id of ['language-packs','language-packs-nav'])if($(id))$(id).hidden=!connected||!translatorAvailable;
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
  for(const m of modelResult.items){const el=document.createElement('option');el.value=m.id;el.textContent=account?.provider==='translator'?t('translatorModel'):account?.provider==='chrome'?t('chromeAIModel'):m.name;$('model').append(el);}
  if(state.modelId&&!modelResult.items.some(m=>m.id===state.modelId)){const unavailable=document.createElement('option');unavailable.value=state.modelId;unavailable.textContent=t('modelUnavailable',[state.modelId]);$('model').append(unavailable);}
  $('model').value=state.modelId;$('model-note').textContent=modelResult.stale?t('cachedModelList',[modelResult.warning||'']):'';
 }finally{$('refresh-models').disabled=false;accountView();}
}
function displayLanguage(value){return languageDisplay(value,t('uiLocale'));}
function targetValue(value){return targetLanguageValue(value,t('uiLocale'));}
function nativeCode(value){return account?.provider==='translator'?translatorLanguage(value):chromeAILanguage(value);}
function languageName(code){return LANGUAGES.find(([value])=>{try{return translatorLanguage(value)===code;}catch{return false;}})?.[1]||languageLabel(code);}
function selectOptions(id,values,value,auto=false){
 const select=$(id);if(!select)return;
 const options=values.map(code=>{const option=document.createElement('option');option.value=code;option.textContent=displayLanguage(languageName(code));return option;});
 if(auto){const option=document.createElement('option');option.value='';option.textContent=t('sourceAuto');options.unshift(option);}
 if(!auto&&!values.includes(value)){const option=document.createElement('option');option.value='';option.textContent=t('chooseLanguage');option.disabled=true;options.unshift(option);}
 select.replaceChildren(...options);select.value=values.includes(value)||auto?value:'';
}
let availableSources=[];
async function refreshLanguageControls(){
 if(!state||!account)return;
 const native=nativeProvider(),key=JSON.stringify([capabilitiesReady,account.provider,state.targetLanguage,sourceLanguage,t('uiLocale')]);
 $('target-combobox').hidden=native;$('target-language-select').hidden=!native;
 $('target-language-label').htmlFor=native?'target-language-select':'target-language';
 if($('source-language')){
  $('source-language').disabled=!sourceLoaded;$('source-language-toggle').disabled=!sourceLoaded;
  $('source-combobox').hidden=native;$('source-language-select').hidden=!native;
  $('source-language-label').htmlFor=native?'source-language-select':'source-language';
  $('source-language').value=sourceLanguage?displayLanguage(sourceLanguage):t('sourceAuto');
 }
 if(key===languageControlsKey)return;
 languageControlsKey=key;const revision=++languageControlsRevision;
 if(!native){closeSource();return;}
 closeLanguage();closeSource();
 let target;try{target=nativeCode(state.targetLanguage);}catch{}
 const targets=[...new Set(LANGUAGES.filter(([,name])=>supportedTarget(name)).map(([,name])=>nativeCode(name)))];
 selectOptions('target-language-select',targets,target);
 if(!$('source-language-select'))return;
 $('source-language-select').disabled=true;
 const sources=account.provider==='chrome'&&!experimentalAIEnabled(state)?[]:await nativeSourceLanguages(account.provider,state.targetLanguage);
 if(revision!==languageControlsRevision)return;
 if(account.provider==='translator'&&supportedTarget(state.targetLanguage)&&!sources.includes(target))sources.unshift(target);
 availableSources=sources;
 let source;try{source=sourceLanguage?nativeCode(sourceLanguage):'';}catch{source='';}
 if(sourceLanguage&&!sources.includes(source)){
  sourceLanguage='';source='';
  if(sourceLoaded&&sitePermission==='granted')await persistSource();
 }
 selectOptions('source-language-select',sources,source,true);$('source-language-select').disabled=!sourceLoaded;
 $('source-language').value=sourceLanguage?displayLanguage(sourceLanguage):t('sourceAuto');
}
async function persistSource(){
 if(!tab?.id||sitePermission!=='granted')return;
 await rpc('page.language.set',{tabId:tab.id,url:tab.url,documentId:sourceDocument,sourceLanguage});
}
function initializePageLanguage(){
 if(!sourceInitialization)sourceInitialization=initializeSource().finally(()=>{sourceInitialization=null;});return sourceInitialization;
}
async function initializeSource(){
 if(isOptions||sourceLoaded||!tab?.id||sitePermission!=='granted')return;
 const saved=await rpc('page.language.get',{tabId:tab.id,url:tab.url});
 sourceDocument=saved?.documentId||'';
 if(typeof saved?.sourceLanguage==='string')sourceLanguage=saved.sourceLanguage;
 else if(translatorAvailable&&chrome.tabs.detectLanguage){
  let timer;
  try{
   const code=await Promise.race([chrome.tabs.detectLanguage(tab.id),new Promise(resolve=>{timer=setTimeout(()=>resolve('und'),2000);})]);
   if(code&&code!=='und')sourceLanguage=targetValue(languageLabel(translatorLanguage(code)));
  }catch{}finally{clearTimeout(timer);}
 }
 sourceLoaded=true;languageControlsKey='';await refreshLanguageControls();await persistSource();permissionCardView();
}
function closeSource(){
 if(!$('source-language-list'))return;
 $('source-language-list').hidden=true;$('source-language').setAttribute('aria-expanded','false');$('source-language').removeAttribute('aria-activedescendant');sourceActive=-1;
}
function openSource(filter=false){
 if(nativeProvider())return;
 const query=filter?$('source-language').value.trim():'',needle=query.toLowerCase();
 sourceChoices=[t('sourceAuto'),...LANGUAGES.map(([,name])=>displayLanguage(name))].filter(name=>!needle||name.toLowerCase().includes(needle)||LANGUAGES.some(([code,native])=>displayLanguage(native)===name&&code.toLowerCase().includes(needle)));
 if(query&&query!==t('sourceAuto')&&!LANGUAGES.some(([,name])=>name===targetValue(query)))sourceChoices.unshift(query);
 $('source-language-list').replaceChildren();sourceActive=-1;
 sourceChoices.forEach((name,index)=>{
  const item=document.createElement('li');item.id='source-choice-'+index;item.role='option';item.textContent=name;item.setAttribute('aria-selected','false');
  item.addEventListener('mousedown',event=>event.preventDefault());item.addEventListener('click',()=>chooseSource(name));$('source-language-list').append(item);
 });
 $('source-language-list').hidden=false;$('source-language').setAttribute('aria-expanded','true');
}
async function chooseSource(value){
 const previous=sourceLanguage;
 try{
  const automatic=!value||value===t('sourceAuto')||value.toLowerCase()==='auto';
  const next=automatic?'':targetValue(value);
  if(nativeProvider()&&next&&!availableSources.includes(nativeCode(next)))throw new Error(t(account.provider==='translator'?'translatorLanguages':'chromeAILanguages'));
  sourceLanguage=next;await persistSource();sourceLoaded=true;closeSource();await refreshLanguageControls();return true;
 }catch(error){sourceLanguage=previous;languageControlsKey='';await refreshLanguageControls();feedback(error.message);return false;}
}
$('target-language-select').addEventListener('change',()=>chooseLanguage($('target-language-select').value));
$('source-language-select')?.addEventListener('change',()=>chooseSource($('source-language-select').value));
$('source-language')?.addEventListener('input',()=>openSource(true));
$('source-language')?.addEventListener('blur',()=>{closeSource();if($('source-language').value!==(sourceLanguage?displayLanguage(sourceLanguage):t('sourceAuto')))void chooseSource($('source-language').value);});
$('source-language')?.addEventListener('keydown',event=>{
 if(event.key==='Escape'){closeSource();event.preventDefault();}
 if(['ArrowDown','ArrowUp'].includes(event.key)){
  event.preventDefault();if($('source-language-list').hidden)openSource();if(!sourceChoices.length)return;
  sourceActive=(sourceActive+(event.key==='ArrowDown'?1:-1)+sourceChoices.length)%sourceChoices.length;
  [...$('source-language-list').children].forEach((item,index)=>item.setAttribute('aria-selected',String(index===sourceActive)));
  $('source-language').setAttribute('aria-activedescendant','source-choice-'+sourceActive);$('source-language-list').children[sourceActive].scrollIntoView({block:'nearest'});
 }
 if(event.key==='Enter'){event.preventDefault();void chooseSource(sourceActive>=0?sourceChoices[sourceActive]:$('source-language').value);}
});
action('source-language-toggle',()=>{if($('source-language-list').hidden)openSource();else closeSource();$('source-language').focus();});
let packsRevision=0;
async function refreshPacks(){
 if(!isOptions||!translatorAvailable||account?.state!=='connected')return;
 const revision=++packsRevision,pairs=await rpc('translator.packs.list');
 const states=await Promise.all((Array.isArray(pairs)?pairs:[]).map(async pair=>({...pair,state:await translatorAvailability(pair)})));
 if(revision!==packsRevision)return;
 const list=$('language-pack-list');list.replaceChildren();
 if(!states.length){list.textContent=t('languagePacksEmpty');return;}list.textContent='';
 for(const pair of states){
  const row=document.createElement('div');row.className='pack-row';
  const label=document.createElement('span');label.textContent=displayLanguage(languageName(pair.sourceLanguage))+' → '+displayLanguage(languageName(pair.targetLanguage));
  const status=document.createElement('small');status.textContent=t(pair.state==='available'?'translatorPairAvailable':pair.state==='downloading'?'translatorPairDownloading':pair.state==='downloadable'?'translatorPairDownload':'translatorPairUnavailable');
  const remove=document.createElement('button');remove.className='text-button danger';remove.textContent=t('removeLanguagePair');remove.setAttribute('aria-label',t('removeLanguagePair')+': '+label.textContent);
  remove.addEventListener('click',async()=>{try{remove.disabled=true;await rpc('translator.packs.remove',{pair:{sourceLanguage:pair.sourceLanguage,targetLanguage:pair.targetLanguage}});await refreshPacks();}catch(error){remove.disabled=false;feedback(error.message);}});
  row.append(label,status,remove);list.append(row);
 }
}
action('add-language-pack',()=>rpc('translator.packs.add'));
action('refresh-language-packs',refreshPacks);
let choices=[],active=-1;
function languageItems(query=''){
 const initial=displayLanguage(languageLabel(state.defaultLocale));
 const codes=new Map(LANGUAGES.map(([code,name])=>[displayLanguage(name),code]));
 const labels=[initial,...codes.keys()].filter((x,i,a)=>a.indexOf(x)===i&&(!nativeProvider()||supportedTarget(targetValue(x)))),needle=query.trim().toLowerCase();
 choices=labels.filter(label=>!needle||label.toLowerCase().includes(needle)||codes.get(label)?.toLowerCase().includes(needle.replaceAll('_','-')));
 if(query.trim()&&!nativeProvider()&&!labels.includes(displayLanguage(targetValue(query))))choices.unshift(query.trim());
 $('language-list').replaceChildren();active=-1;
 choices.forEach((name,index)=>{
  const li=document.createElement('li');li.id='language-'+index;li.role='option';li.setAttribute('aria-selected','false');
  const text=document.createElement('span');text.textContent=name;li.append(text);
  if(name===initial){const badge=document.createElement('small');badge.textContent=t('browserLanguage');li.append(badge);}
  li.addEventListener('mousedown',e=>e.preventDefault());li.addEventListener('click',()=>chooseLanguage(name));$('language-list').append(li);
 });
}
function openLanguage(filter=false){if(nativeProvider())return;languageItems(filter?$('target-language').value:'');$('language-list').hidden=false;$('target-language').setAttribute('aria-expanded','true');}
function closeLanguage(){$('language-list').hidden=true;$('target-language').setAttribute('aria-expanded','false');$('target-language').removeAttribute('aria-activedescendant');}
async function chooseLanguage(value){try{if(nativeProvider()&&!supportedTarget(targetValue(value)))throw new Error(t(account.provider==='translator'?'translatorLanguages':'chromeAILanguages'));await save({targetLanguage:targetValue(value)});accountView();$('target-language').value=displayLanguage(state.targetLanguage);closeLanguage();await refreshLanguageControls();return true;}catch(e){feedback(e.message);$('target-language').value=displayLanguage(state.targetLanguage);return false;}}
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
action('login',async()=>{if(account?.provider==='chrome'&&!chromeAIAvailable||account?.provider==='translator'&&!translatorAvailable)await connectionAction('auth.provider',{provider:'subscription'});await rpc('auth.start');setAccount(await rpc('auth.status'));await connectedView();});
action('cancel-login',async()=>{await rpc('auth.cancel');setAccount(await rpc('auth.status'));});
action('logout',async()=>{await rpc('auth.signOut');setAccount(await rpc('auth.status'));$('model').replaceChildren(new Option(t('connectFirst'),''));feedback(t('disconnectedMessage'),true);});
async function connectionAction(type,data={}){
 if(connectionBusy)return;
 connectionBusy=true;feedback('');accountView();
 try{
  await rpc(type,data);editingAPIKey=false;
  state=await rpc('settings.get');setAccount(await rpc('auth.status'));settingsView();await connectedView();
 }catch(e){feedback(e.message);}
 finally{connectionBusy=false;accountView();}
}
for(const [id,provider]of [['use-subscription','subscription'],['use-api','api'],['use-claude','claude'],['use-chrome','chrome'],['use-translator','translator']])action(id,async()=>{
 if(connectionBusy||provider==='chrome'&&!chromeAIAvailable||provider==='translator'&&!translatorAvailable||(account?.provider||'subscription')===provider)return;
 $('api-key').value='';await connectionAction('auth.provider',{provider});
});
action('open-translator',()=>rpc('translator.open'));
action('open-chrome-ai',()=>rpc('chromeAI.open'));
action('replace-api-key',()=>{editingAPIKey=true;accountView();$('api-key').focus();});
$('api-key-form').addEventListener('submit',event=>{
 event.preventDefault();if(connectionBusy)return;
 const apiKey=$('api-key').value.trim();$('api-key').value='';
 return connectionAction('auth.apiKey',{apiKey,provider:account?.provider});
});
action('open-options',()=>rpc('options.open'));
let logsOpen=false,logsReady=false,logsBusy=false,logsRevision=0;
function logsButtonView(){
 const button=$('open-logs');if(!button)return;
 const key=logsOpen?'closeLogs':'openLogs';
 button.hidden=!state?.developerMode;button.disabled=!logsReady||logsBusy;
 button.dataset.i18nTitle=key;button.dataset.i18nAriaLabel=key;
 button.setAttribute('title',t(key));button.setAttribute('aria-label',t(key));button.setAttribute('aria-pressed',String(logsOpen));
}
async function refreshLogsPanel(){
 if(logsBusy||!Number.isInteger(windowId)||!chrome.runtime.getContexts)return;
 const revision=logsRevision;
 try{
  // Chromium reports -1 as a side-panel context's windowId. Ask live panel
  // documents which window they belong to instead of filtering that metadata.
  const contexts=await chrome.runtime.getContexts({contextTypes:['SIDE_PANEL'],documentUrls:[chrome.runtime.getURL('logs.html')]});
  const response=contexts.length?await chrome.runtime.sendMessage({type:'logs.panel.status',windowId}):null;
  if(revision!==logsRevision||logsBusy)return;
  logsOpen=response?.ok===true&&response.windowId===windowId&&response.open===true;logsReady=true;logsButtonView();
 }catch{if(revision===logsRevision){logsReady=false;logsButtonView();}}
}
// Keep opening inside the click gesture; fetching state here can lose user activation.
// State is discovered before the button is enabled and refreshed by events/polling.
$('open-logs')?.addEventListener('click',()=>{
 if(!state?.developerMode||!logsReady||logsBusy)return;
 if(!chrome.sidePanel?.open||!Number.isInteger(windowId)){feedback(t('sidePanelUnavailable'));return;}
 const opening=!logsOpen;logsBusy=true;logsRevision++;logsButtonView();
 let operation;
 try{
  operation=opening?chrome.sidePanel.open({windowId}):chrome.sidePanel.close?chrome.sidePanel.close({windowId}):
   chrome.runtime.sendMessage({type:'logs.panel.close',windowId}).then(response=>{if(!response?.ok)throw Error(t('sidePanelUnavailable'));});
 }catch(e){operation=Promise.reject(e);}
 return operation.then(()=>{logsOpen=opening;}).catch(e=>{feedback(e.message);}).finally(()=>{
  logsBusy=false;logsRevision++;logsButtonView();void refreshLogsPanel();
 });
});
for(const [event,open]of [[chrome.sidePanel?.onOpened,true],[chrome.sidePanel?.onClosed,false]])event?.addListener(info=>{
 if(info.windowId!==windowId||info.path!=='logs.html'||Number.isInteger(info.tabId)&&info.tabId>=0)return;
 logsRevision++;logsOpen=open;logsReady=true;logsButtonView();
});
action('edit-instructions',async()=>{await chrome.tabs.create({url:chrome.runtime.getURL('options.html#instructions')});});
async function page(type){
 if(!tab?.id)throw new Error(t('noWebpage'));
 if(!isOptions&&sitePermission!=='granted')throw new Error(t('siteNotAllowed'));
 if(['page.translate','page.retry','page.select'].includes(type)){
  if(!await chooseLanguage($('target-language').value)||!await chooseSource(nativeProvider()?$('source-language-select').value:$('source-language').value))return;
  if(account.provider==='translator'&&sourceLanguage&&type!=='page.select'){
   const pair={sourceLanguage:translatorLanguage(sourceLanguage),targetLanguage:translatorLanguage(state.targetLanguage)},availability=await translatorAvailability(pair);
   if(availability==='unavailable')throw new Error(t('translatorLanguages'));
   if(availability!=='available'){await rpc('translator.open',{pair});feedback(t('translatorSetupRequired'));return;}
  }
 }
 await rpc(type,{tabId:tab.id});await refreshProgress();return true;
}
action('translate',()=>page('page.translate'));action('restore',()=>page('page.restore'));
action('select-block',async()=>{if(await page('page.select'))window.close();});
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
 const optional=granted.origins.filter(x=>!['https://auth.openai.com/*','https://chatgpt.com/*','https://api.openai.com/*','https://api.anthropic.com/*'].includes(x));
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
  // Attach gestures to the already-loaded document before model discovery or other network work.
  feedback('');await rpc('page.activate',{tabId:tab.id});
  if(account?.state==='connected'&&account.connectionId===connectionId)await connectedView();
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
 experimentsView();
 logsButtonView();
 if(!isOptions){$('instruction-status').textContent=state.instructionsEnabled?t('instructionsActive'):t('configureInstructions');return;}
 $('developer-options').hidden=!state.developerMode;
 $('ui-language').value=state.uiLanguage||'auto';
 $('locale-note').textContent=t('localeSuggestion',[displayLanguage(languageLabel(state.defaultLocale))]);shortcutsView();
}
function settingsView(){
 $('target-language').value=displayLanguage(state.targetLanguage);document.documentElement.dataset.theme=state.theme;
 localizedSettingsView();if(!isOptions)return;
 $('max-concurrent-batches').value=state.maxConcurrentBatches;
 $('max-retries').value=state.maxRetries??4;$('developer-mode').checked=!!state.developerMode;
 $('max-log-entries').value=state.maxLogEntries??4000;
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
$('max-retries')?.addEventListener('change',async()=>{
 const input=$('max-retries');
 try{await save({maxRetries:input.valueAsNumber});feedback(t('retriesSaved'),true);}
 catch(e){input.value=state.maxRetries??4;feedback(e.message);}
});
$('developer-mode')?.addEventListener('change',async()=>{
 try{await save({developerMode:$('developer-mode').checked});localizedSettingsView();feedback(t('developerModeSaved'),true);}
 catch(e){$('developer-mode').checked=!!state.developerMode;feedback(e.message);}
});
for(const [id,key]of [['experimental-features','experimentalFeatures'],['on-device-ai-enabled','onDeviceAIEnabled']])$(id)?.addEventListener('change',async()=>{
 const input=$(id);input.disabled=true;
 try{await save({[key]:input.checked});await refreshExperiments();feedback(t('experimentalSettingsSaved'),true);}
 catch(e){experimentsView();feedback(e.message);}finally{input.disabled=false;}
});
$('max-log-entries')?.addEventListener('change',async()=>{
 const input=$('max-log-entries');
 try{await save({maxLogEntries:input.valueAsNumber});feedback(t('maxLogEntriesSaved'),true);}
 catch(e){input.value=state.maxLogEntries??4000;feedback(e.message);}
});
$('theme')?.addEventListener('change',()=>save({theme:$('theme').value}).catch(e=>feedback(e.message)));
action('clear-cache',async()=>{await rpc('cache.clear');feedback(t('cacheCleared'),true);});
action('export-settings',()=>{
 const clean=sanitizeSettings(state,defaults(state.defaultLocale)),blob=new Blob([JSON.stringify(clean,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='yongil-translator-settings.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('import-settings')?.addEventListener('change',async()=>{
 try{const file=$('import-settings').files[0];if(!file)return;if(file.size>50000)throw new Error(t('settingsTooLarge'));
  const clean=sanitizeSettings(JSON.parse(await file.text()),defaults(state.defaultLocale));await save(clean);await configureLanguage(state.uiLanguage);localizeDocument();settingsView();await refreshExperiments();feedback(t('settingsImported'),true);
 }catch(e){feedback(e.message);}finally{$('import-settings').value='';}
});
action('reset-settings',async()=>{if(!confirm(t('resetConfirm')))return;
 state=await rpc('settings.reset');await configureLanguage(state.uiLanguage);localizeDocument();settingsView();await refreshExperiments();feedback(t('settingsReset'),true);});
async function connectedView(){
 await refreshLanguageControls();
 if(account?.state!=='connected')return;
 await permissionsView();
 if(account?.state!=='connected'||(!isOptions&&sitePermission!=='granted'))return;
 await refreshLanguageControls();if(capabilitiesReady)await initializePageLanguage();
 const results=await Promise.allSettled([loadModels(),refreshProgress(),refreshPacks()]);
 if(account?.state==='connected')for(const r of results)if(r.status==='rejected')feedback(r.reason.message);
}
async function init(){
 const [settings,status]=await Promise.all([rpc('settings.get'),rpc('auth.status')]);
 state=settings;await configureLanguage(state.uiLanguage);localizeDocument();
 if(chrome.windows?.getCurrent)windowId=(await chrome.windows.getCurrent()).id;
 await refreshLogsPanel();
 if(!isOptions)[tab]=await chrome.tabs.query({active:true,currentWindow:true});
 settingsView();setAccount(status);await connectedView();
 const [,translatorSupport]=await Promise.all([refreshChromeAI(),translatorDiscovery]);
 translatorAvailable=translatorSupport.state!=='unavailable';translatorLanguages=new Set(translatorSupport.pairs.map(pair=>pair.targetLanguage));capabilitiesReady=true;
 if(nativeProvider()){setAccount(await rpc('auth.status'));await connectedView();}else{accountView();await initializePageLanguage();await refreshPacks();}
}
async function refreshLanguage(){
 await configureLanguage(state.uiLanguage);localizeDocument();closeLanguage();
 $('target-language').value=displayLanguage(state.targetLanguage);localizedSettingsView();feedback('');accountView();await connectedView();
}
$('ui-language')?.addEventListener('change',async()=>{
 try{await save({uiLanguage:$('ui-language').value});await refreshLanguage();}catch(e){feedback(e.message);}
});
chrome.storage?.onChanged.addListener((changes,area)=>{
 if(area==='local'&&changes.translatorPreparedPairs)void refreshPacks().catch(e=>feedback(e.message));
 const next=changes.settings?.newValue;
 if(area==='local'&&state&&next){
  const experimentsChanged=state.experimentalFeatures!==next.experimentalFeatures||state.onDeviceAIEnabled!==next.onDeviceAIEnabled;
  state.experimentalFeatures=!!next.experimentalFeatures;state.onDeviceAIEnabled=!!next.onDeviceAIEnabled;
  if(experimentsChanged)void refreshExperiments().catch(e=>feedback(e.message));
  state.developerMode=!!next.developerMode;
  if($('developer-mode'))$('developer-mode').checked=state.developerMode;
  logsButtonView();void refreshLogsPanel();
  if($('developer-options'))$('developer-options').hidden=!state.developerMode;
  if(next.maxLogEntries!==undefined&&next.maxLogEntries!==state.maxLogEntries){state.maxLogEntries=next.maxLogEntries;if($('max-log-entries'))$('max-log-entries').value=state.maxLogEntries;}
 }
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
  await refreshLogsPanel();
  const changed=setAccount(await rpc('auth.status'));
  if(changed){state=await rpc('settings.get');settingsView();await connectedView();}else await refreshProgress();
 }catch{}finally{polling=false;}
},1500);
