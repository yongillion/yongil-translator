// Canonical native labels are stored independently of the interface language.
const definitions=[
 ['ko','한국어'],
 ['en','English'],['en-US','English'],['en-GB','English'],['en-AU','English'],['en-CA','English'],['en-NZ','English'],['en-IE','English'],['en-IN','English'],['en-ZA','English'],
 ['ja','日本語'],['zh-CN','简体中文'],['zh-TW','繁體中文'],['zh-HK','繁體中文'],
 ['es','Español'],['es-ES','Español'],['es-MX','Español'],['es-AR','Español'],
 ['fr','Français'],['fr-FR','Français'],['fr-CA','Français'],['fr-BE','Français'],['fr-CH','Français'],
 ['de','Deutsch'],['de-DE','Deutsch'],['de-AT','Deutsch'],['de-CH','Deutsch'],
 ['pt','Português'],['pt-BR','Português'],['pt-PT','Português'],
 ['it','Italiano'],['ru','Русский'],['ar','العربية'],['hi','हिन्दी'],['vi','Tiếng Việt'],
 ['th','ไทย'],['id','Bahasa Indonesia'],['tr','Türkçe'],['pl','Polski'],['uk','Українська']
];
const normalized=value=>String(value||'').trim().toLowerCase().replaceAll('_','-');
function localeParts(locale){try{return new Intl.Locale(String(locale).replaceAll('_','-'));}catch{return new Intl.Locale('en');}}
function countryName(locale,region){
 if(localeParts(locale).language==='ko'&&region==='AU')return '호주';
 try{return new Intl.DisplayNames([locale],{type:'region',style:region==='HK'?'short':'long'}).of(region)||region;}catch{return region;}
}
export const LANGUAGES=definitions.map(([code,name])=>{
 const {region}=localeParts(code);return [code,region?name+' ('+countryName(code,region)+')':name];
});
const legacyNames={'简体中文':'zh-CN','繁體中文':'zh-TW'};
function findLanguage(value){
 const key=normalized(value),alias=legacyNames[value];
 return LANGUAGES.find(([code,name])=>normalized(code)===key||normalized(name)===key||code===alias);
}
export function languageLabel(locale){
 const parsed=localeParts(locale||'en');
 return LANGUAGES.find(([code])=>normalized(code)===normalized(parsed.baseName))?.[1]
  ||(parsed.region&&LANGUAGES.find(([code])=>{const candidate=localeParts(code);return candidate.language===parsed.language&&candidate.region===parsed.region;})?.[1])
  ||LANGUAGES.find(([code])=>code===parsed.language)?.[1]
  ||LANGUAGES.find(([code])=>localeParts(code).language===parsed.language)?.[1]||String(locale);
}
function localizedLabel(code,uiLocale){
 const {language,region}=localeParts(code);
 let name;try{name=new Intl.DisplayNames([uiLocale],{type:'language'}).of(language)||language;}catch{name=language;}
 return region?name+' ('+countryName(uiLocale,region)+')':name;
}
export function displayLanguage(value,uiLocale='en'){
 const match=findLanguage(value);if(!match)return value;
 const [code,native]=match,localized=localizedLabel(code,uiLocale);
 return localeParts(code).language===localeParts(uiLocale).language||native===localized?native:native+' ∙ '+localized;
}
export function targetLanguageValue(value,uiLocale='en'){
 const direct=findLanguage(value);if(direct)return direct[1];
 const key=normalized(value);
 return LANGUAGES.find(([code,native])=>normalized(displayLanguage(native,uiLocale))===key||normalized(localizedLabel(code,uiLocale))===key)?.[1]||String(value).trim();
}
