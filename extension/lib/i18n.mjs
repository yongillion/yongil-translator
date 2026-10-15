// Chrome localizes browser-owned metadata. This catalog also supports the UI override.
let current={language:'',messages:{}},revision=0;
const catalogs=new Map();
export function resolveUILanguage(preference='auto',browserLanguage=globalThis.chrome?.i18n?.getUILanguage?.()||'en'){
 return (preference==='auto'?browserLanguage:preference).toLowerCase().split(/[-_]/)[0]==='ko'?'ko':'en';
}
export function t(key,substitutions=[]){
 const values=(Array.isArray(substitutions)?substitutions:[substitutions]).map(String);
 const message=current.messages[key]?.message;
 return message!==undefined?message.replace(/\$([1-9])/g,(_,i)=>values[Number(i)-1]??''):
  globalThis.chrome?.i18n?.getMessage?.(key,values)||key;
}
export function localeData(){return current;}
export async function configureLanguage(preference='auto'){
 const request=++revision,language=resolveUILanguage(preference);
 if(!catalogs.has(language))catalogs.set(language,fetch(chrome.runtime.getURL('_locales/'+language+'/messages.json')).then(r=>{
  if(!r.ok)throw Error('Unable to load UI language');return r.json();
 }).catch(e=>{catalogs.delete(language);throw e;}));
 const messages=await catalogs.get(language);
 if(request===revision)current={language,messages};
 return current;
}
export function localizeDocument(doc=document){
 doc.documentElement.lang=t('uiLocale');
 for(const el of doc.querySelectorAll('[data-i18n]'))el.textContent=t(el.dataset.i18n);
 for(const attribute of ['title','aria-label','placeholder'])for(const el of doc.querySelectorAll('[data-i18n-'+attribute+']')){
  el.setAttribute(attribute,t(el.getAttribute('data-i18n-'+attribute)));
 }
}
