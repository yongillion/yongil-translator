import {LANGUAGES} from './languages.mjs';
import {translatorLanguage,translatorAvailability} from './translator.mjs';
import {chromeAILanguage,chromeAIOptions,chromeAIAvailability} from './chrome-ai.mjs';

// Check source support with the actual output language, not just output capability.
export async function nativeSourceLanguages(provider,target){
 const canonical=provider==='translator'?translatorLanguage:chromeAILanguage;
 let targetLanguage;try{targetLanguage=canonical(target);}catch{return [];}
 const candidates=[...new Set(LANGUAGES.map(([code])=>canonical(code)))];
 return (await Promise.all(candidates.map(async sourceLanguage=>{
  if(provider==='translator'&&sourceLanguage===targetLanguage)return null;
  const state=provider==='translator'?await translatorAvailability({sourceLanguage,targetLanguage}):await chromeAIAvailability(chromeAIOptions(targetLanguage,[sourceLanguage]));
  return state==='unavailable'?null:sourceLanguage;
 }))).filter(Boolean);
}
