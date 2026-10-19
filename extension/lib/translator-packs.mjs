import {translatorLanguage} from './translator.mjs';

const storageKey='translatorPreparedPairs';let writes=Promise.resolve();
export function languagePair(pair){return {sourceLanguage:translatorLanguage(pair?.sourceLanguage),targetLanguage:translatorLanguage(pair?.targetLanguage)};}
export const pairKey=pair=>pair.sourceLanguage+'>'+pair.targetLanguage;
export async function preparedPairs(){
 await writes.catch(()=>{});
 const saved=(await chrome.storage.local.get(storageKey))[storageKey];
 return Array.isArray(saved)?saved.flatMap(pair=>{try{return [languagePair(pair)];}catch{return [];}}):[];
}
export function rememberPair(pair,remove=false){
 const clean=languagePair(pair);
 const next=writes.catch(()=>{}).then(async()=>{
  const saved=(await chrome.storage.local.get(storageKey))[storageKey];
  const pairs=(Array.isArray(saved)?saved:[]).filter(p=>pairKey(p)!==pairKey(clean));
  if(!remove)pairs.push(clean);
  await chrome.storage.local.set({[storageKey]:pairs});
 });writes=next;return next;
}
