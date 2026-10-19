import {AppError} from './protocol.mjs';
import {translationFormat} from './api.mjs';

export const CLAUDE_BASE='https://api.anthropic.com/v1';
export function claudeHeaders(apiKey){return {'x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'};}
export function validateClaudeKey(value){
 if(typeof value!=='string'||!/^sk-ant-(?:api\d+|usr)-[A-Za-z0-9_-]{16,1024}$/.test(value.trim()))throw new AppError('API_KEY','claudeKeyInvalid');
 return value.trim();
}
export function claudeError(status){
 if(status===401)return new AppError('AUTH_REQUIRED','apiKeyRejected');
 if(status===403)return new AppError('ACCESS','apiAccessDenied');
 if(status===402)return new AppError('USAGE_LIMIT','claudeBillingError');
 if(status===429)return new AppError('USAGE_LIMIT','apiRateLimited');
 if(status===408)return new AppError('TIMEOUT','translationTimeout');
 if(status===400)return new AppError('MODEL','claudeRequestInvalid');
 if(status===404)return new AppError('MODEL','apiModelRequest');
 if(status===413)return new AppError('INPUT','inputTooLong');
 return new AppError(status>=500?'SERVER':'PROVIDER','providerFailed');
}
export async function listClaudeModels(getPage){
 const items=[],seen=new Set(),cursors=new Set();let after;
 // Read the complete catalogue in API order, with a bound for malformed pagination.
 for(let page=0;page<100;page++){
  const data=await getPage('/models?limit=100'+(after?'&after_id='+encodeURIComponent(after):''));
  if(!Array.isArray(data?.data))throw new AppError('MODELS','modelListFormat');
  for(const row of data.data){
   if(typeof row?.id!=='string'||!row.id.startsWith('claude-')||row.id.length>160||row.lifecycle==='retired'||seen.has(row.id))continue;
   seen.add(row.id);items.push({id:row.id,name:typeof row.display_name==='string'?row.display_name:row.id,
    structuredOutput:row.capabilities?.structured_outputs?.supported===true,
    maxOutputTokens:Number.isInteger(row.max_tokens)&&row.max_tokens>0?row.max_tokens:8192});
  }
  if(!data.has_more){if(!items.length)throw new AppError('MODELS','apiModelsEmpty');return items;}
  if(typeof data.last_id!=='string'||!data.last_id||cursors.has(data.last_id))throw new AppError('MODELS','modelListFormat');
  after=data.last_id;cursors.add(after);
 }
 throw new AppError('MODELS','modelListFormat');
}
export async function verifyClaudeKey(value){
 const apiKey=validateClaudeKey(value),signal=AbortSignal.timeout(25000);
 const items=await listClaudeModels(async path=>{
  let response;try{response=await fetch(CLAUDE_BASE+path,{headers:{...claudeHeaders(apiKey),Accept:'application/json'},credentials:'omit',redirect:'error',signal});}
  catch{throw new AppError('NETWORK','claudeConnectionFailed');}
  // Do not surface or log provider error bodies, which can echo credentials.
  if(!response.ok)throw claudeError(response.status);
  try{return await response.json();}catch{throw new AppError('MODELS','modelListFormat');}
 });
 return {apiKey,items};
}
export function claudePayload(model,instructions,blocks,outputLimit){
 const content=JSON.stringify({blocks});
 const max_tokens=Math.min(model.maxOutputTokens,outputLimit||Math.max(4096,Math.min(32768,content.length*2+1024)));
 return {model:model.id,system:instructions,messages:[{role:'user',content}],max_tokens,stream:true,
  ...(model.structuredOutput?{output_config:{format:{type:'json_schema',schema:translationFormat.schema}}}:{})};
}
export async function readClaudeStream(body,signal,onEvent){
 if(!body)throw new AppError('STREAM','streamNoBody');
 const reader=body.getReader(),decoder=new TextDecoder(),parts=new Map();let pending='',bytes=0,started=false,completed=false,stopReason;
 const abort=()=>void reader.cancel().catch(()=>{});
 signal?.addEventListener('abort',abort,{once:true});
 const checkAbort=()=>{if(signal?.aborted)throw new DOMException('Aborted','AbortError');};
 function frame(source){
  const data=source.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
  if(!data)return;
  let event;try{event=JSON.parse(data);}catch{throw new AppError('STREAM','streamInvalid');}
  if(event.type==='error'){
   // Log the error category only; provider messages may include a credential.
   const type=event.error?.type;
   const status={authentication_error:401,permission_error:403,rate_limit_error:429,invalid_request_error:400,not_found_error:404,request_too_large:413,overloaded_error:529,api_error:500}[type]||500;
   onEvent?.({type:'error',status});throw claudeError(status);
  }
  onEvent?.(event);
  if(event.type==='message_start')started=true;
  if(event.type==='content_block_start')parts.set(event.index,{type:event.content_block?.type,text:event.content_block?.type==='text'?event.content_block.text||'':''});
  if(event.type==='content_block_delta'&&event.delta?.type==='text_delta'){
   const part=parts.get(event.index);if(part?.type!=='text'||typeof event.delta.text!=='string')throw new AppError('STREAM','streamInvalid');
   part.text+=event.delta.text;
  }
  if(event.type==='message_delta'&&event.delta?.stop_reason)stopReason=event.delta.stop_reason;
  if(event.type==='message_stop')completed=true;
 }
 try{
  while(true){
   checkAbort();const chunk=await reader.read();checkAbort();if(chunk.done)break;
   bytes+=chunk.value.byteLength;if(bytes>2_000_000)throw new AppError('STREAM','streamTooLarge');
   pending+=decoder.decode(chunk.value,{stream:true});
   let match;while((match=/\r?\n\r?\n/.exec(pending))){frame(pending.slice(0,match.index));pending=pending.slice(match.index+match[0].length);}
  }
  pending+=decoder.decode();if(pending.trim())frame(pending);
 }finally{signal?.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
 checkAbort();
 if(!started||!completed)throw new AppError('STREAM','streamDisconnected');
 if(stopReason==='max_tokens')throw new AppError('OUTPUT_LIMIT','claudeOutputLimit');
 if(stopReason==='refusal')throw new AppError('REFUSAL','claudeRefusal');
 if(stopReason!=='end_turn')throw new AppError('STREAM','streamIncompleteRetry');
 const text=[...parts].sort(([a],[b])=>a-b).map(([,part])=>part.text).join('');
 if(!text.trim())throw new AppError('RESULT','resultTextMissing');
 return text;
}
