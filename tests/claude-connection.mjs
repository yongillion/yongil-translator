import assert from 'node:assert/strict';
import {ReadableStream} from 'node:stream/web';
import {connectionHarness,blocks} from './api-connection.mjs';
import {readClaudeStream,listClaudeModels,validateClaudeKey,claudePayload} from '../extension/lib/claude.mjs';
import {redact} from '../extension/lib/logger.mjs';
import {sanitizeSettings} from '../extension/lib/settings.mjs';

const testKey='sk-ant-api03-TEST_ONLY_NOT_A_REAL_CREDENTIAL';
const output=JSON.stringify({blocks:[{id:'b1',nodes:[{id:'n0',text:'안녕하세요'}]}]});
function events(text=output,reason='end_turn'){
 return [{type:'message_start',message:{content:[]}},{type:'content_block_start',index:0,content_block:{type:'text',text:''}},
  {type:'ping'},{type:'content_block_delta',index:0,delta:{type:'text_delta',text}},
  {type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:reason}},{type:'message_stop'}];
}
function stream(rows,{byteChunks=false,finalNewline=true}={}){
 const data=new TextEncoder().encode(rows.map(row=>'event: '+row.type+'\r\ndata: '+JSON.stringify(row)).join('\r\n\r\n')+(finalNewline?'\r\n\r\n':''));
 return new ReadableStream({start(controller){if(byteChunks)for(const byte of data)controller.enqueue(new Uint8Array([byte]));else controller.enqueue(data);controller.close();}});
}
const response=rows=>({ok:true,status:200,body:stream(rows)});
async function job(h,maxRetries=0){await h.send({type:'settings.update',patch:{modelId:'claude-test-small',maxRetries}});return (await h.send({type:'job.begin'},h.content)).data;}
const batch=(h,j)=>h.send({type:'job.batch',jobId:j.id,blocks},h.content);
export async function claudeConnectionTests(){
 const results=[];async function test(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.stack||e.message});}}
 await test('Claude keys use only Anthropic headers and trusted storage with safe public status',async()=>{
  const h=await connectionHarness(),connected=await h.connect('claude');assert.equal(connected.ok,true);assert.equal(connected.data.provider,'claude');
  const {url,init}=h.requests[0];assert.equal(url,'https://api.anthropic.com/v1/models?limit=100');assert.equal(init.headers['x-api-key'],testKey);
  assert.equal(init.headers['anthropic-version'],'2023-06-01');assert.equal(init.headers['anthropic-dangerous-direct-browser-access'],'true');assert.equal(init.headers.Authorization,undefined);
  assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(h.local.accessLevel,'TRUSTED_CONTEXTS');assert.equal(h.local.data.claudeAuth.apiKey,testKey);
  for(const type of ['auth.status','settings.get','models.list']){const result=JSON.stringify(await h.send({type}));assert.ok(!result.includes(testKey));assert.ok(!result.includes('email'));}
  assert.equal((await h.send({type:'models.list'})).data.items[0].name,'Claude Test');assert.equal(h.requests.length,1);
 });
 await test('Three providers preserve separate credentials, model choices, and job identities',async()=>{
  const h=await connectionHarness();await h.connect();await h.job();const apiId=h.local.data.apiAuth.connectionId;
  await h.connect('claude');const j=await job(h),claudeId=h.local.data.claudeAuth.connectionId;assert.notEqual(claudeId,apiId);
  for(const [provider,model] of [['api','gpt-test-small'],['subscription','subscription-model'],['claude','claude-test-small']]){
   await h.send({type:'auth.provider',provider});assert.equal((await h.send({type:'settings.get'})).data.modelId,model);assert.equal((await h.send({type:'auth.status'})).data.state,'connected');
  }
  assert.equal((await batch(h,j)).error.code,'INTERRUPTED');await h.send({type:'auth.signOut'});
  assert.equal(h.local.data.claudeAuth,undefined);assert.ok(h.local.data.apiAuth);assert.ok(h.local.data.auth);
 });
 await test('Provider mismatch, other-provider keys, and Claude OAuth tokens never reach a network endpoint',async()=>{
  const h=await connectionHarness();await h.send({type:'auth.provider',provider:'claude'});
  for(const apiKey of ['sk-TEST_ONLY_OPENAI_CREDENTIAL','sk-ant-oat01-TEST_ONLY_OAUTH_CREDENTIAL','invalid'])assert.equal((await h.send({type:'auth.apiKey',apiKey})).error.code,'API_KEY');
  assert.equal((await h.send({type:'auth.apiKey',provider:'api',apiKey:testKey})).error.code,'INPUT');
  assert.equal((await h.send({type:'auth.start'})).ok,false);
  await h.send({type:'auth.provider',provider:'api'});assert.equal((await h.send({type:'auth.apiKey',apiKey:testKey})).error.code,'API_KEY');assert.equal(h.requests.length,0);
  assert.equal(validateClaudeKey(' sk-ant-usr-TEST_ONLY_USER_CREDENTIAL '),'sk-ant-usr-TEST_ONLY_USER_CREDENTIAL');
 });
 await test('Claude translations use Messages and supported structured outputs without OpenAI fields',async()=>{
  const h=await connectionHarness();await h.connect('claude');h.network.handle=async url=>url.endsWith('/messages')?response(events()):null;
  const result=await batch(h,await job(h));assert.equal(result.ok,true);assert.equal(result.data.b1[0],'안녕하세요');
  const {url,init}=h.requests.at(-1),body=JSON.parse(init.body);assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(init.headers['x-api-key'],testKey);
  for(const field of ['Authorization','ChatGPT-Account-Id','originator'])assert.equal(init.headers[field],undefined);
  for(const field of ['input','instructions','store','text'])assert.equal(body[field],undefined);
  assert.equal(body.stream,true);assert.ok(body.system.includes('untrusted'));assert.deepEqual(JSON.parse(body.messages[0].content),{blocks});
  assert.equal(body.output_config.format.type,'json_schema');assert.equal(body.output_config.format.schema.additionalProperties,false);assert.ok(body.max_tokens>0);
  assert.ok(h.requests.every(row=>row.url.startsWith('https://api.anthropic.com/')));
 });
 await test('Claude model discovery follows pagination, keeps API order, and excludes retired models',async()=>{
  const paths=[],items=await listClaudeModels(async path=>{paths.push(path);return paths.length===1?{data:[{id:'claude-one',display_name:'First',max_tokens:4096},{id:'claude-retired',lifecycle:'retired'}],has_more:true,last_id:'claude-retired'}:{data:[{id:'claude-one'},{id:'claude-two',capabilities:{structured_outputs:{supported:true}}}],has_more:false};});
  assert.deepEqual(items.map(x=>x.id),['claude-one','claude-two']);assert.ok(paths[1].includes('after_id=claude-retired'));assert.equal(items[0].maxOutputTokens,4096);assert.equal(items[0].structuredOutput,false);assert.equal(items[1].structuredOutput,true);
  await assert.rejects(()=>listClaudeModels(async()=>({data:[],has_more:true,last_id:'loop'})),e=>e.code==='MODELS');
 });
 await test('Structured outputs are omitted when capability is unknown or unsupported',()=>{
  const body=claudePayload({id:'claude-legacy',maxOutputTokens:4096,structuredOutput:false},'Translate',blocks);
  assert.equal(body.output_config,undefined);assert.equal(body.max_tokens,4096);
 });
 await test('Claude stream handles byte-split Unicode, CRLF, final frames, and non-text events',async()=>{
  const rows=events();rows.splice(1,0,{type:'content_block_start',index:1,content_block:{type:'thinking',thinking:'ignored'}},{type:'content_block_delta',index:1,delta:{type:'thinking_delta',thinking:'ignored'}},{type:'future_event'});
  assert.equal(await readClaudeStream(stream(rows,{byteChunks:true,finalNewline:false})),output);
 });
 await test('Incomplete, truncated, and refusal streams never count as completed translations',async()=>{
  for(const [rows,code]of [[events().slice(0,-1),'STREAM'],[events(output,'max_tokens'),'OUTPUT_LIMIT'],[events(output,'refusal'),'REFUSAL'],[events(output,'tool_use'),'STREAM']])await assert.rejects(()=>readClaudeStream(stream(rows)),e=>e.code===code);
 });
 await test('Stream errors hide echoed credentials and preserve retryable versus authorization errors',async()=>{
  for(const [type,code]of [['overloaded_error','SERVER'],['authentication_error','AUTH_REQUIRED'],['rate_limit_error','USAGE_LIMIT']]){
   const logs=[];await assert.rejects(()=>readClaudeStream(stream([{type:'error',error:{type,message:testKey}}]),undefined,event=>logs.push(event)),e=>e.code===code&&!e.message.includes(testKey));
   assert.ok(!JSON.stringify(logs).includes(testKey));
  }
 });
 await test('Cancelling Claude streaming promptly releases a reader waiting for data',async()=>{
  const controller=new AbortController();let cancelled=false;
  const pending=readClaudeStream(new ReadableStream({cancel(){cancelled=true;}}),controller.signal);controller.abort();
  await assert.rejects(()=>pending,e=>e.name==='AbortError');assert.equal(cancelled,true);
 });
 await test('Claude retries invalid JSON with original blocks and validates the final IDs',async()=>{
  const h=await connectionHarness();await h.connect('claude');let attempts=0;
  h.network.handle=async url=>url.endsWith('/messages')?response(events(++attempts===1?'invalid JSON':output)):null;
  assert.equal((await batch(h,await job(h,1))).ok,true);assert.equal(attempts,2);
  const bodies=h.requests.filter(x=>x.url.endsWith('/messages')).map(x=>JSON.parse(x.init.body));assert.equal(bodies[0].messages[0].content,bodies[1].messages[0].content);assert.ok(bodies[1].system.includes('previous response'));
 });
 await test('Truncated Claude output retries with more tokens within the configured retry budget',async()=>{
  const h=await connectionHarness();await h.connect('claude');let attempts=0;
  h.network.handle=async url=>url.endsWith('/messages')?response(events(output,++attempts===1?'max_tokens':'end_turn')):null;
  assert.equal((await batch(h,await job(h,1))).ok,true);
  const limits=h.requests.filter(x=>x.url.endsWith('/messages')).map(x=>JSON.parse(x.init.body).max_tokens);assert.deepEqual(limits,[4096,8192]);
 });
 await test('Claude request authorization failure neither retries OAuth nor leaks provider error bodies',async()=>{
  const h=await connectionHarness();await h.connect('claude');await h.send({type:'settings.update',patch:{developerMode:true}});const j=await job(h,4);
  h.network.status=401;h.network.body=JSON.stringify({error:{message:testKey}});
  assert.equal((await batch(h,j)).error.code,'AUTH_REQUIRED');assert.equal(h.requests.length,2);
  assert.ok(!JSON.stringify(await h.send({type:'logs.get'})).includes(testKey));assert.ok(!h.requests.some(row=>row.url.includes('oauth')));
 });
 await test('Failed Claude replacement keeps the old key; successful replacement rotates identity',async()=>{
  const h=await connectionHarness();await h.connect('claude');const old=h.local.data.claudeAuth.connectionId;
  h.network.status=403;assert.equal((await h.send({type:'auth.apiKey',apiKey:testKey})).ok,false);assert.equal(h.local.data.claudeAuth.connectionId,old);
  h.network.status=200;await h.send({type:'auth.apiKey',apiKey:'sk-ant-api03-TEST_ONLY_REPLACEMENT_CREDENTIAL'});assert.notEqual(h.local.data.claudeAuth.connectionId,old);
 });
 await test('Provider switches cancel Claude work and reject late results',async()=>{
  const h=await connectionHarness();await h.connect('claude');const j=await job(h);let started;const ready=new Promise(resolve=>{started=resolve;});
  h.network.handle=async(url,init)=>{if(!url.endsWith('/messages'))return;return new Promise((resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});started();});};
  const pending=batch(h,j);await ready;await h.send({type:'auth.provider',provider:'api'});assert.equal((await pending).error.code,'CANCELLED');
 });
 await test('Claude credential fields are redacted and cannot enter settings exports',()=>{
  const value=JSON.stringify(redact({headers:{'x-api-key':testKey},anthropic_key:'nonstandard-secret',claudeKey:testKey,text:'Echo '+testKey}));assert.ok(!value.includes(testKey));assert.ok(!value.includes('nonstandard-secret'));
  assert.throws(()=>sanitizeSettings({claudeAuth:{apiKey:testKey}}));
 });
 await test('Failed initial Claude verification saves no credential or model cache',async()=>{
  for(const [status,code]of [[401,'AUTH_REQUIRED'],[403,'ACCESS'],[402,'USAGE_LIMIT'],[429,'USAGE_LIMIT'],[529,'SERVER']]){
   const h=await connectionHarness();h.network.status=status;h.network.body=JSON.stringify({error:{message:testKey}});
   const result=await h.connect('claude');assert.equal(result.error.code,code);assert.equal(h.local.data.claudeAuth,undefined);assert.equal(h.local.data.modelCache,undefined);assert.ok(!JSON.stringify(result).includes(testKey));
  }
 });
 await test('Claude retry count zero, exhausted output capacity, and refusals stop after one request',async()=>{
  for(const [rows,retries,capacity,code]of [[events('invalid'),0,16384,'RESULT'],[events(output,'max_tokens'),4,4096,'OUTPUT_LIMIT'],[events(output,'refusal'),4,16384,'REFUSAL']]){
   const h=await connectionHarness();await h.connect('claude');h.local.data.modelCache.items[0].maxOutputTokens=capacity;let attempts=0;
   h.network.handle=async url=>{if(url.endsWith('/messages')){attempts++;return response(rows);}};
   const result=await batch(h,await job(h,retries));assert.equal(result.error.code,code);assert.equal(attempts,1);
  }
 });
 await test('Claude model refresh reads paginated capabilities and rejects stale provider results',async()=>{
  const h=await connectionHarness();await h.connect('claude');
  h.network.handle=async url=>url.includes('/models')?{ok:true,status:200,json:async()=>({data:[{id:'claude-new',display_name:'New model',max_tokens:64000}],has_more:false})}:null;
  const refreshed=await h.send({type:'models.list',force:true});assert.equal(refreshed.data.items[0].id,'claude-new');assert.equal(refreshed.data.items[0].structuredOutput,false);
  let started,release;const ready=new Promise(resolve=>{started=resolve;});h.network.handle=async()=>{started();await new Promise(resolve=>{release=resolve;});return {ok:true,status:200,json:async()=>({data:[{id:'claude-late'}]})};};
  const pending=h.send({type:'models.list',force:true});await ready;await h.send({type:'auth.provider',provider:'api'});release();
  assert.equal((await pending).ok,false);assert.equal(h.local.data.modelCache,undefined);
 });
 return {passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,results};
}
