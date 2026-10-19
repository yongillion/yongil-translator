import {AppError} from './protocol.mjs';

export const API_BASE='https://api.openai.com/v1';
export function validateAPIKey(value){
 if(typeof value!=='string'||!/^sk-[A-Za-z0-9_-]{16,1024}$/.test(value.trim()))throw new AppError('API_KEY','apiKeyInvalid');
 return value.trim();
}
export function apiError(status,body){
 if(status===401)return new AppError('AUTH_REQUIRED','apiKeyRejected');
 if(status===403)return new AppError('ACCESS','apiAccessDenied');
 if(status===429){
  let code;try{code=JSON.parse(body).error?.code;}catch{}
  return new AppError('USAGE_LIMIT',code==='insufficient_quota'?'apiQuotaExceeded':'apiRateLimited');
 }
 if(status===408)return new AppError('TIMEOUT','translationTimeout');
 if(status===400||status===404)return new AppError('MODEL','apiModelRequest');
 return new AppError(status>=500?'SERVER':'PROVIDER','providerFailed');
}
export function apiModels(data){
 if(!Array.isArray(data?.data))throw new AppError('MODELS','modelListFormat');
 // The models endpoint has no capability flags. Offer text-model families;
 // endpoint and project access are still checked by the Responses API.
 const items=data.data.filter(row=>typeof row?.id==='string'&&/^(gpt-|o[1-9])/.test(row.id)&&
  !/(audio|realtime|transcrib|tts|image|search|deep-research|instruct|moderation|embedding)/i.test(row.id)&&
  !/^gpt-(3\.5|4($|-))/.test(row.id)).map(row=>({id:row.id,name:row.id})).filter(row=>row.id.length<=160);
 if(!items.length)throw new AppError('MODELS','apiModelsEmpty');
 return items;
}
export async function verifyAPIKey(value){
 const apiKey=validateAPIKey(value);let response;
 try{response=await fetch(API_BASE+'/models',{headers:{Authorization:'Bearer '+apiKey,Accept:'application/json'},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(25000)});}
 catch{throw new AppError('NETWORK','apiConnectionFailed');}
 // Provider error messages may echo the key. Never return or log their raw text.
 if(!response.ok)throw apiError(response.status,await response.text());
 let data;try{data=await response.json();}catch{throw new AppError('MODELS','modelListFormat');}
 return {apiKey,items:apiModels(data)};
}
export const translationFormat={type:'json_schema',name:'webpage_translation',strict:true,schema:{
 type:'object',additionalProperties:false,required:['blocks'],properties:{blocks:{type:'array',items:{
  type:'object',additionalProperties:false,required:['id','nodes'],properties:{id:{type:'string'},nodes:{type:'array',items:{
   type:'object',additionalProperties:false,required:['id','text'],properties:{id:{type:'string'},text:{type:'string'}}
  }}}
 }}}
}};
