import {AppError} from './protocol.mjs';

const key=tabId=>'pageSourceLanguage_'+tabId;
export async function pageDocument(tabId){return (await chrome.webNavigation.getFrame?.({tabId,frameId:0}))?.documentId||'';}
export async function pageLanguage(tabId,url,documentId=''){
 const saved=(await chrome.storage.session.get(key(tabId)))[key(tabId)];
 return saved?.url===url&&(saved.documentId||'')===documentId?saved:null;
}
export async function setPageLanguage(tabId,url,value,documentId=''){
 if(typeof value!=='string'||value.length>100||/[\r\n\x00-\x1f]/.test(value))throw new AppError('INPUT','languageField');
 const sourceLanguage=value.trim()==='auto'?'':value.trim();
 const saved={url,documentId,sourceLanguage};await chrome.storage.session.set({[key(tabId)]:saved});return saved;
}
export async function clearPageLanguage(tabId){await chrome.storage.session.remove(key(tabId));}
