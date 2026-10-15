import {readFile} from 'node:fs/promises';
export const catalogs=Object.fromEntries(await Promise.all(['en','ko'].map(async language=>[language,JSON.parse(await readFile(new URL('../extension/_locales/'+language+'/messages.json',import.meta.url),'utf8'))])));
export function mockI18n(language='ko'){
 return {getUILanguage:()=>language,getMessage(key,values=[]){
  const catalog=catalogs[language.toLowerCase().split(/[-_]/)[0]]||catalogs.en;
  return (catalog[key]?.message||catalogs.en[key]?.message||'').replace(/\$([1-9])/g,(_,i)=>String(values[Number(i)-1]??''));
 }};
}
export async function localeFetch(url){
 const match=String(url).match(/\/_locales\/(en|ko)\/messages.json$/);
 if(!match)throw Error('Unexpected locale request: '+url);
 return {ok:true,json:async()=>JSON.parse(JSON.stringify(catalogs[match[1]]))};
}
