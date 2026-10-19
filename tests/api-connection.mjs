import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {ReadableStream} from 'node:stream/web';
import {mockI18n,localeFetch} from './locale-fixtures.mjs';
import {redact} from '../extension/lib/logger.mjs';
import {apiModels} from '../extension/lib/api.mjs';
import {sanitizeSettings} from '../extension/lib/settings.mjs';

const testKey='sk-TEST_ONLY_NOT_A_REAL_API_CREDENTIAL',replacementKey='sk-TEST_ONLY_REPLACEMENT_CREDENTIAL';
const event=()=>({listeners:[],addListener(fn){this.listeners.push(fn);}});
function storage(data={}){return {data,async get(keys){return Object.fromEntries((typeof keys==='string'?[keys]:keys||Object.keys(data)).map(key=>[key,data[key]]));},async set(next){Object.assign(data,next);},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete data[key];},async setAccessLevel({accessLevel}){this.accessLevel=accessLevel;}};}
async function harness(){
 const local=storage({authEpoch:'subscription-connection',auth:{accessToken:'TEST_ONLY_SUBSCRIPTION_TOKEN',refreshToken:'TEST_ONLY_REFRESH',accountId:'TEST_ONLY_ACCOUNT',connectionId:'subscription-connection',expiresAt:Date.now()+3600000},settings:{modelId:'subscription-model'}}),session=storage();
 const requests=[],messages=[],registrations=[],network={status:200,body:'',gate:null,translationGate:null},root='chrome-extension://test/';
 const chrome={storage:{local,session},i18n:mockI18n('en'),runtime:{id:'test',getURL:p=>root+p,onMessage:event(),onInstalled:event(),onStartup:event()},
  sidePanel:{setOptions:async()=>{}},alarms:{clear:async()=>{},create:async()=>{},onAlarm:event()},
  tabs:{onUpdated:event(),onRemoved:event(),query:async()=>[{id:1,url:'https://example.test/'}],get:async id=>({id,url:'https://example.test/'}),remove:async()=>{},sendMessage:async(id,message)=>{messages.push(message);return {};},create:async()=>({id:2}),update:async()=>{}},
  permissions:{contains:async()=>true,getAll:async()=>({origins:['https://api.openai.com/*','https://chatgpt.com/*','https://auth.openai.com/*','https://example.test/*']}),onAdded:event(),onRemoved:event()},
  scripting:{unregisterContentScripts:async()=>{},registerContentScripts:async rows=>registrations.push(...rows)},
  webNavigation:{onCommitted:event(),onBeforeNavigate:event(),getAllFrames:async()=>[{frameId:0,url:'https://example.test/'}]}};
 const fetcher=async(url,init={})=>{
  if(url.startsWith(root))return localeFetch(url);
  requests.push({url,init});
  if(network.gate)await network.gate;
  if(network.status!==200)return {ok:false,status:network.status,text:async()=>network.body};
  if(url.includes('/models'))return {ok:true,status:200,json:async()=>url.startsWith('https://api.openai.com/')?{data:[{id:'gpt-test-small'},{id:'text-embedding-test'},{id:'gpt-test-large'}]}:{models:[{id:'subscription-model'}]}};
  if(url.endsWith('/responses')){
   if(network.translationGate)await network.translationGate(init.signal);
   const blocks=JSON.parse(JSON.parse(init.body).input[0].content[0].text).blocks;
   const text=JSON.stringify({blocks:blocks.map(b=>({...b,nodes:b.nodes.map(n=>({...n,text:'Translated '+n.text}))}))});
   return {ok:true,status:200,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({type:'response.completed',response:{status:'completed',output:[{content:[{type:'output_text',text}]}]}})+'\n\n'));c.close();}})};
  }
  throw Error('Unexpected endpoint');
 };
 const context=vm.createContext({chrome,fetch:fetcher,crypto,URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,AbortSignal,DOMException,atob,btoa,setTimeout,clearTimeout,setInterval:()=>0,console});
 const modules=new Map();async function load(url){if(!modules.has(url.href))modules.set(url.href,readFile(url,'utf8').then(code=>new vm.SourceTextModule(code,{context,identifier:url.href})));return modules.get(url.href);}
 const worker=await load(new URL('../extension/background.mjs',import.meta.url));await worker.link((specifier,parent)=>load(new URL(specifier,parent.identifier)));await worker.evaluate();
 const ui={id:'test',url:root+'popup.html'},content={id:'test',url:'https://example.test/',tab:{id:1,url:'https://example.test/'},frameId:0,documentId:'document'};
 const send=(message,sender=ui)=>new Promise(resolve=>chrome.runtime.onMessage.listeners[0](message,sender,resolve));
 await send({type:'settings.get'});
 return {local,session,chrome,network,requests,messages,registrations,send,ui,content,
  async connect(){await send({type:'auth.provider',provider:'api'});return send({type:'auth.apiKey',apiKey:testKey});},
  async job(){await send({type:'settings.update',patch:{modelId:'gpt-test-small',maxRetries:0}});return (await send({type:'job.begin'},content)).data;}};
}
const blocks=[{id:'b1',nodes:[{id:'n0',text:'Hello world'}]}];
export async function apiConnectionTests(){
 const results=[];async function test(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.stack||e.message});}}
 await test('API connection validates against OpenAI and exposes no credentials or account email',async()=>{
  const h=await harness();assert.equal((await h.send({type:'auth.status'})).data.provider,'subscription');
  const result=await h.connect();assert.equal(result.ok,true);assert.equal(result.data.provider,'api');assert.equal(result.data.state,'connected');
  assert.equal(h.local.accessLevel,'TRUSTED_CONTEXTS');assert.equal(h.local.data.apiAuth.apiKey,testKey);assert.ok(h.local.data.auth);
  assert.equal(h.requests[0].url,'https://api.openai.com/v1/models');assert.equal(h.requests[0].init.headers.Authorization,'Bearer '+testKey);assert.equal(h.requests[0].init.credentials,'omit');assert.equal(h.requests[0].init.redirect,'error');
  for(const type of ['auth.status','settings.get','models.list']){const value=JSON.stringify(await h.send({type}));assert.ok(!value.includes(testKey));assert.ok(!value.includes('email'));}
  assert.equal((await h.send({type:'models.list'})).data.items[0].id,'gpt-test-small');assert.equal(h.requests.length,1);
 });
 await test('Switching providers preserves their model choices and invalidates active jobs and cache identity',async()=>{
  const h=await harness(),oldJob=(await h.send({type:'job.begin'},h.content)).data;
  await h.connect();const apiJob=await h.job();assert.notEqual(apiJob.fingerprint,oldJob.fingerprint);
  assert.equal((await h.send({type:'job.batch',jobId:oldJob.id,blocks},h.content)).error.code,'INTERRUPTED');
  await h.send({type:'auth.provider',provider:'subscription'});assert.equal((await h.send({type:'settings.get'})).data.modelId,'subscription-model');
  assert.equal((await h.send({type:'auth.status'})).data.connectionId,'subscription-connection');
  await h.send({type:'auth.provider',provider:'api'});assert.equal((await h.send({type:'settings.get'})).data.modelId,'gpt-test-small');
  assert.equal((await h.send({type:'auth.status'})).data.state,'connected');assert.ok(h.messages.some(x=>x.type==='job.stop'));
  const stale=await h.send({type:'settings.update',connectionId:'subscription-connection',patch:{modelId:'wrong-provider'}});assert.equal(stale.error.code,'ACCOUNT_CHANGED');
 });
 await test('API translations stream through Responses with strict schema and without subscription headers',async()=>{
  const h=await harness();await h.connect();const job=await h.job(),result=await h.send({type:'job.batch',jobId:job.id,blocks},h.content);
  assert.equal(result.ok,true);assert.equal(result.data.b1[0],'Translated Hello world');
  const request=h.requests.at(-1),body=JSON.parse(request.init.body);assert.equal(request.url,'https://api.openai.com/v1/responses');
  assert.equal(request.init.headers.Authorization,'Bearer '+testKey);assert.equal(request.init.headers['ChatGPT-Account-Id'],undefined);assert.equal(request.init.headers.originator,undefined);
  assert.equal(body.store,false);assert.equal(body.stream,true);assert.equal(body.text.format.type,'json_schema');assert.equal(body.text.format.strict,true);
  assert.ok(!JSON.stringify(body).includes(testKey));
  await h.send({type:'auth.provider',provider:'subscription'});const sub=(await h.send({type:'job.begin'},h.content)).data;await h.send({type:'job.batch',jobId:sub.id,blocks},h.content);
  assert.ok(h.requests.at(-1).url.startsWith('https://chatgpt.com/'));assert.equal(JSON.parse(h.requests.at(-1).init.body).text,undefined);
 });
 await test('Invalid, rejected, and restricted API keys are not saved and raw provider errors never escape',async()=>{
  for(const [status,key]of [[401,'apiKeyRejected'],[403,'apiAccessDenied'],[429,'apiQuotaExceeded'],[500,'providerFailed']]){
   const h=await harness();await h.send({type:'auth.provider',provider:'api'});await h.send({type:'settings.update',patch:{developerMode:true}});
   h.network.status=status;h.network.body=JSON.stringify({error:{code:'insufficient_quota',message:testKey}});
   const result=await h.send({type:'auth.apiKey',apiKey:testKey});assert.equal(result.ok,false);assert.equal(result.error.messageKey,key);assert.equal(h.local.data.apiAuth,undefined);
   const serialized=JSON.stringify([result,await h.send({type:'logs.get'})]);assert.ok(!serialized.includes(testKey));
  }
  const h=await harness();await h.send({type:'auth.provider',provider:'api'});const result=await h.send({type:'auth.apiKey',apiKey:'invalid'});assert.equal(result.error.code,'API_KEY');assert.equal(h.requests.length,0);
 });
 await test('Replacing and disconnecting an API key rotates identity and removes only the selected credential',async()=>{
  const h=await harness();const first=await h.connect();await h.send({type:'auth.apiKey',apiKey:replacementKey});
  assert.notEqual((await h.send({type:'auth.status'})).data.connectionId,first.data.connectionId);assert.equal(h.local.data.apiAuth.apiKey,replacementKey);
  h.network.status=401;await h.send({type:'auth.apiKey',apiKey:testKey});assert.equal(h.local.data.apiAuth.apiKey,replacementKey);
  await h.send({type:'auth.signOut'});assert.equal(h.local.data.apiAuth,undefined);assert.equal(h.local.data.modelCache,undefined);assert.ok(h.local.data.auth);
  await h.send({type:'auth.provider',provider:'subscription'});assert.equal((await h.send({type:'auth.status'})).data.state,'connected');
 });
 await test('API authorization errors do not refresh OAuth tokens, retry, or log an echoed key',async()=>{
  const h=await harness();await h.connect();const job=await h.job();await h.send({type:'settings.update',patch:{developerMode:true}});
  h.network.status=401;h.network.body=JSON.stringify({error:{message:'Incorrect API key: '+testKey}});
  const result=await h.send({type:'job.batch',jobId:job.id,blocks},h.content);assert.equal(result.error.messageKey,'apiKeyRejected');assert.equal(h.requests.length,2);
  assert.ok(!h.requests.some(row=>row.url.includes('/oauth/')));assert.ok(!JSON.stringify(await h.send({type:'logs.get'})).includes(testKey));
 });
 await test('Switching providers aborts in-flight API work and rejects late results',async()=>{
  const h=await harness();await h.connect();const job=await h.job();let started;
  const ready=new Promise(resolve=>{started=resolve;});h.network.translationGate=signal=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});started();});
  const pending=h.send({type:'job.batch',jobId:job.id,blocks},h.content);await ready;await h.send({type:'auth.provider',provider:'subscription'});
  assert.equal((await pending).error.code,'CANCELLED');
 });
 await test('Queued provider switch wins over a slow key check without leaking the key or selecting API afterward',async()=>{
  const h=await harness();await h.send({type:'auth.provider',provider:'api'});let release;h.network.gate=new Promise(resolve=>{release=resolve;});
  const pending=h.send({type:'auth.apiKey',apiKey:testKey});await new Promise(resolve=>setTimeout(resolve,0));
  const switching=h.send({type:'auth.provider',provider:'subscription'});release();await pending;await switching;
  assert.equal((await h.send({type:'auth.status'})).data.provider,'subscription');assert.equal((await h.send({type:'settings.get'})).data.modelId,'subscription-model');
 });
 await test('Content pages and log panels cannot set keys or switch providers',async()=>{
  const h=await harness();for(const sender of [h.content,{id:'test',url:'chrome-extension://test/logs.html'},{id:'other',url:h.ui.url}])for(const type of ['auth.apiKey','auth.provider']){
   assert.equal((await h.send({type,apiKey:testKey,provider:'api'},sender)).ok,false);
  }
  assert.equal(h.requests.length,0);assert.equal(h.local.data.apiAuth,undefined);
 });
 await test('API keys are removed from diagnostics and rejected in settings exports/imports',()=>{
  const output=JSON.stringify(redact({apiKey:testKey,openai_key:replacementKey,nested:{message:'Bad credential '+testKey},headers:{Authorization:'Bearer '+testKey}}));
  assert.ok(!output.includes(testKey));assert.ok(!output.includes(replacementKey));assert.ok(output.includes('[REDACTED]'));
  assert.throws(()=>sanitizeSettings({apiKey:testKey}));assert.throws(()=>sanitizeSettings({apiAuth:{apiKey:testKey}}));
 });
 await test('Model discovery filters non-text families without inventing available models',()=>{
  const ids=['gpt-test-small','gpt-4o','gpt-4.1-mini','o3-mini','gpt-audio','gpt-image-1','gpt-realtime','gpt-4-turbo','gpt-3.5-turbo','text-embedding-3-small'];
  assert.deepEqual(apiModels({data:ids.map(id=>({id}))}).map(x=>x.id),ids.slice(0,4));assert.throws(()=>apiModels({data:[]}));
 });
 await test('API backend permission is not registered as a translation content script',async()=>{
  const h=await harness();h.chrome.runtime.onInstalled.listeners[0]();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(h.registrations.length,1);assert.deepEqual([...h.registrations[0].matches],['https://example.test/*']);
 });
 return {passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,results};
}
