import {t} from './i18n.mjs';
const cancelled=()=>Object.assign(new Error('Aborted'),{name:'AbortError'});
export class AppError extends Error {
 constructor(code,messageKey,substitutions=[]){super(t(messageKey,substitutions));this.name='AppError';this.code=code;this.messageKey=messageKey;this.substitutions=substitutions;}
}
export function validateBlocks(blocks) {
 if(!Array.isArray(blocks)||blocks.length<1||blocks.length>12)throw new AppError('INPUT','inputBlocks');
 const ids=new Set();let size=0;
 for(const b of blocks) {
  if(!b||typeof b.id!=='string'||b.id.length>100||ids.has(b.id)||!Array.isArray(b.nodes)||!b.nodes.length||b.nodes.length>300)throw new AppError('INPUT','inputBlockFormat');
  ids.add(b.id);const nodeIds=new Set();
  for(const n of b.nodes) {
   if(!n||typeof n.id!=='string'||n.id.length>100||nodeIds.has(n.id)||typeof n.text!=='string')throw new AppError('INPUT','inputTextFormat');
   nodeIds.add(n.id);size+=n.text.length;
  }
 }
 if(size>18000)throw new AppError('INPUT','inputTooLong');
 return blocks;
}
function translationJSON(source){
 try{return {parsed:JSON.parse(source)};}catch{}
 // Some responses append extra closing tokens after an otherwise complete root.
 // Locate that root without treating braces inside quoted/escaped text as syntax.
 // Never repair its contents, invent missing tokens, or discard another JSON value.
 if(source[0]==='{'){
  const stack=[];let quoted=false,escaped=false;
  for(let index=0;index<source.length;index++){
   const char=source[index];
   if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
   if(char==='"'){quoted=true;continue;}
   if(char==='{'||char==='[')stack.push(char);
   else if(char==='}'||char===']'){
    if(stack.pop()!==(char==='}'?'{':'['))break;
    if(!stack.length){
     const suffix=source.slice(index+1);
     if(!/^[\s\]}]+$/.test(suffix))break;
     try{return {parsed:JSON.parse(source.slice(0,index+1)),recovery:{reason:'extra_closing_delimiters',removedCharacters:suffix.trim().length}};}catch{break;}
    }
   }
  }
 }
 throw new AppError('RESULT','resultFormat');
}
export function parseTranslation(text,requested,onRecovery) {
 const source=text.trim().replace(/^\x60\x60\x60(?:json)?\s*/,'').replace(/\s*\x60\x60\x60$/,'').trim();
 const {parsed,recovery}=translationJSON(source);
 if(!parsed||!Array.isArray(parsed.blocks)||parsed.blocks.length!==requested.length)throw new AppError('RESULT','resultBlockCount');
 const result=new Map();let total=0;
 for(const input of requested){
  const matches=parsed.blocks.filter(b=>b?.id===input.id);
  if(matches.length!==1||!Array.isArray(matches[0].nodes)||matches[0].nodes.length!==input.nodes.length)throw new AppError('RESULT','resultBlockMissing');
  const nodes=matches[0].nodes;const values=[];
  for(const original of input.nodes){
   const found=nodes.filter(n=>n?.id===original.id);
   if(found.length!==1||typeof found[0].text!=='string'||found[0].text.length>50000||(!found[0].text.trim()&&original.text.trim()))throw new AppError('RESULT','resultTextMissing');
   total+=found[0].text.length;values.push(found[0].text);
  }
  result.set(input.id,values);
 }
 if(total>150000)throw new AppError('RESULT','resultTooLarge');
 if(recovery)onRecovery?.(recovery);
 return Object.fromEntries(result);
}
export async function readResponseStream(body,signal,onEvent) {
 if(!body)throw new AppError('STREAM','streamNoBody');
 const reader=body.getReader(),decoder=new TextDecoder();let pending='',text='',completed=false,bytes=0;
 try{
  while(true){
   if(signal?.aborted)throw cancelled();
   const chunk=await reader.read();if(chunk.done)break;
   bytes+=chunk.value.byteLength;if(bytes>2_000_000)throw new AppError('STREAM','streamTooLarge');
   pending+=decoder.decode(chunk.value,{stream:true});
   let match;while((match=/\r?\n\r?\n/.exec(pending))){
    const frame=pending.slice(0,match.index);pending=pending.slice(match.index+match[0].length);
    const data=frame.split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');
    if(!data||data==='[DONE]')continue;
    let event;try{event=JSON.parse(data);}catch{onEvent?.({type:'stream.invalid',data});throw new AppError('STREAM','streamInvalid');}
    onEvent?.(event);
    if(event.type==='response.output_text.delta')text+=event.delta||'';
    if(['error','response.failed','response.incomplete'].includes(event.type))throw new AppError('STREAM','streamIncompleteRetry');
    if(event.type==='response.completed'){
     if(event.response?.status&&event.response.status!=='completed')throw new AppError('STREAM','streamIncomplete');
     const full=(event.response?.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
     if(full)text=full;completed=true;
    }
   }
  }
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 if(!completed||!text.trim())throw new AppError('STREAM','streamDisconnected');
 return text;
}
export class RequestQueue {
 constructor(limit=2){this.limit=limit;this.active=0;this.pending=[];this.running=new Map();}
 setLimit(limit){
  if(!Number.isInteger(limit)||limit<1)throw new Error('Invalid concurrency limit');
  this.limit=limit;this.pump();
 }
 run(key,fn){return new Promise((resolve,reject)=>{this.pending.push({key,fn,resolve,reject,controller:new AbortController()});this.pump();});}
 pump(){while(this.active<this.limit&&this.pending.length){const task=this.pending.shift();this.active++;this.running.set(task.key,task);
  Promise.resolve().then(()=>task.fn(task.controller.signal)).then(task.resolve,task.reject).finally(()=>{this.active--;this.running.delete(task.key);this.pump();});}}
 cancel(prefix){
  for(const item of this.pending.filter(x=>x.key.startsWith(prefix)))item.reject(cancelled());
  this.pending=this.pending.filter(x=>!x.key.startsWith(prefix));
  for(const item of this.running.values())if(item.key.startsWith(prefix))item.controller.abort();
 }
}
