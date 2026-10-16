import {t} from './i18n.mjs';
import {languageLabel} from './languages.mjs';
export {LANGUAGES,languageLabel} from './languages.mjs';
export function defaults(locale='en') {
 return {schemaVersion:1,targetLanguage:languageLabel(locale),modelId:'',
 instructions:'',instructionsEnabled:false,maxConcurrentBatches:16,maxRetries:4,developerMode:false,maxLogEntries:4000,uiLanguage:'auto',
 pageShortcut:{alt:true,shift:false,ctrl:false,meta:false,code:'KeyT'},
 restoreShortcut:{alt:true,shift:false,ctrl:false,meta:false,code:'KeyR'},
 blockShortcutDefaultVersion:3,blockShortcut:{alt:true,shift:false,ctrl:false,meta:false,code:''},
 cancelShortcut:{alt:false,shift:false,ctrl:false,meta:false,code:'Escape'},
 excludedSites:[],theme:'system',defaultLocale:locale};
}
const isRecord=x=>!!x && typeof x==='object'&&!Array.isArray(x);
function text(x,max,name,empty=true) {
 if(typeof x!=='string'||x.length>max||(!empty&&!x.trim())) throw new Error(t('invalidSetting',[name]));
 return x.trim();
}
export function shortcut(value) {
 if(value===null)return null;
 if(!isRecord(value)||!['alt','shift','ctrl','meta'].every(k=>typeof value[k]==='boolean')
 ||typeof value.code!=='string'||value.code.length>32)throw new Error(t('shortcutInvalid'));
 if(!value.code&&!['alt','shift','ctrl','meta'].some(k=>value[k])) throw new Error(t('shortcutEmpty'));
 if(value.code&&!/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2])|Escape|Space|Enter|Backspace|Delete|Arrow(Up|Down|Left|Right))$/.test(value.code))throw new Error(t('shortcutUnsupported'));
 return Object.fromEntries(['alt','shift','ctrl','meta','code'].map(k=>[k,value[k]]));
}
export function sanitizeSettings(input,base=defaults()) {
 if(!isRecord(input))throw new Error(t('settingsInvalid'));
 if(Object.keys(input).some(k=>!Object.keys(base).includes(k)))throw new Error(t('settingsUnknown'));
 const result={...base};
 for(const [key,value] of Object.entries(input)) {
  switch(key) {
   case 'schemaVersion': if(value!==1)throw new Error(t('settingsVersion')); break;
   case 'targetLanguage': result[key]=text(value,100,t('languageField'),false);break;
   case 'modelId':result[key]=text(value,160,t('model'));break;
   case 'instructions': result[key]=text(value,4000,t('instructionsNav'));break;
   case 'maxConcurrentBatches':
     if(!Number.isInteger(value)||value<1||value>64)throw new Error(t('concurrencyInvalid'));
     result[key]=value;break;
   case 'maxRetries':
     if(!Number.isInteger(value)||value<0||value>10)throw new Error(t('retriesInvalid'));
     result[key]=value;break;
   case 'maxLogEntries':
     if(!Number.isInteger(value)||value<1||value>1000000)throw new Error(t('maxLogEntriesInvalid'));
     result[key]=value;break;
   case 'developerMode':if(typeof value!=='boolean')throw new Error(t('developerModeInvalid'));result[key]=value;break;
    case 'instructionsEnabled':if(typeof value!=='boolean')throw new Error(t('instructionsInvalid'));result[key]=value;break;
   case 'blockShortcutDefaultVersion':if(![1,2,3].includes(value))throw new Error(t('settingsVersion'));result[key]=value;break;
   case 'pageShortcut':case 'restoreShortcut':
     result[key]=shortcut(value);if(result[key]&&!result[key].code)throw new Error(t('pageShortcutKeyRequired'));break;
   case 'blockShortcut':case 'cancelShortcut':result[key]=shortcut(value);break;
   case 'uiLanguage':if(!['auto','en','ko'].includes(value))throw new Error(t('uiLanguageInvalid'));result[key]=value;break;
   case 'theme':if(!['system','light','dark'].includes(value))throw new Error(t('themeInvalid'));result[key]=value;break;
   case 'defaultLocale':result[key]=text(value,80,t('defaultLanguageField'),false);break;
   case 'excludedSites':
    if(!Array.isArray(value)||value.length>200||value.some(s=>typeof s!=='string'||!/^[a-z0-9.-]+$/i.test(s)||s.length>253))throw new Error(t('excludedSitesInvalid'));
    result[key]=[...new Set(value.map(s=>s.toLowerCase()))];break;
  }
 }
 return result;
}
// Version 3 migrates old defaults for all translation shortcuts. Keep the existing
// storage key for compatibility with older exports; migrate only once.
export function migrateSettings(input,base=defaults()){
 const result=sanitizeSettings(input,base),version=input.blockShortcutDefaultVersion||1;
 const isOld=(s,code)=>s?.alt===true&&s.ctrl===true&&s.shift===false&&s.meta===false&&s.code===code;
 if(version<3){
  for(const [key,code] of [['pageShortcut','KeyT'],['restoreShortcut','KeyR'],['blockShortcut','']])
   if(isOld(input[key],code))result[key]={...defaults()[key]};
  const previous=input.blockShortcut;
  if(version<2&&previous?.alt===true&&previous.shift===true&&previous.ctrl===false&&previous.meta===false&&previous.code==='')result.blockShortcut={...defaults().blockShortcut};
 }
 result.blockShortcutDefaultVersion=3;return result;
}
export function shortcutLabel(s) {
 if(!s)return t('shortcutUnassigned');
 return [...(s.ctrl?['Ctrl']:[]),...(s.alt?['Alt']:[]),...(s.shift?['Shift']:[]),...(s.meta?['⌘']:[]),s.code.replace(/^Key|^Digit/,'')].filter(Boolean).join(' + ');
}
export const fingerprint=s=>JSON.stringify([s.targetLanguage,s.modelId,s.instructionsEnabled?s.instructions:'',1]);
