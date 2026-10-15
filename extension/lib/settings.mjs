import {t} from './i18n.mjs';
export const LANGUAGES = [
['ko','한국어'],['en','English'],['ja','日本語'],['zh-CN','简体中文'],['zh-TW','繁體中文'],
['es','Español'],['fr','Français'],['de','Deutsch'],['pt-BR','Português (Brasil)'],
['it','Italiano'],['ru','Русский'],['ar','العربية'],['hi','हिन्दी'],['vi','Tiếng Việt'],
['th','ไทย'],['id','Bahasa Indonesia'],['tr','Türkçe'],['pl','Polski'],['uk','Українська']
];
export function languageLabel(locale) {
 const code=String(locale||'en').replaceAll('_','-');
 return LANGUAGES.find(([id])=>id.toLowerCase()===code.toLowerCase())?.[1]
   || LANGUAGES.find(([id])=>id===code.split('-')[0])?.[1] || code;
}
export function defaults(locale='en') {
 return {schemaVersion:1,targetLanguage:languageLabel(locale),modelId:'',
 instructions:'',instructionsEnabled:false,maxConcurrentBatches:8,uiLanguage:'auto',
 pageShortcut:{alt:true,shift:false,ctrl:true,meta:false,code:'KeyT'},
 blockShortcutDefaultVersion:2,blockShortcut:{alt:true,shift:false,ctrl:true,meta:false,code:''},
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
     if(!Number.isInteger(value)||value<1||value>16)throw new Error(t('concurrencyInvalid'));
     result[key]=value;break;
    case 'instructionsEnabled':if(typeof value!=='boolean')throw new Error(t('instructionsInvalid'));result[key]=value;break;
   case 'blockShortcutDefaultVersion':if(value!==1&&value!==2)throw new Error(t('settingsVersion'));result[key]=value;break;
   case 'pageShortcut':
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
// Upgrade only stored legacy defaults; explicit choices made after migration stay intact.
export function migrateSettings(input,base=defaults()){
 const result=sanitizeSettings(input,base),previous=input.blockShortcut;
 if(input.blockShortcutDefaultVersion!==2&&previous?.alt===true&&previous.shift===true&&previous.ctrl===false&&previous.meta===false&&previous.code==='')result.blockShortcut={...defaults().blockShortcut};
 result.blockShortcutDefaultVersion=2;return result;
}
export function shortcutLabel(s) {
 if(!s)return t('shortcutUnassigned');
 return [...(s.ctrl?['Ctrl']:[]),...(s.alt?['Alt']:[]),...(s.shift?['Shift']:[]),...(s.meta?['⌘']:[]),s.code.replace(/^Key|^Digit/,'')].filter(Boolean).join(' + ');
}
export const fingerprint=s=>JSON.stringify([s.targetLanguage,s.modelId,s.instructionsEnabled?s.instructions:'',1]);
