import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {connectionHarness,blocks} from './api-connection.mjs';
const event=()=>({listeners:[],addListener(fn){this.listeners.push(fn);},emit(value){for(const fn of this.listeners)fn(value);}});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(condition){for(let i=0;i<100&&!condition();i++)await tick();assert.ok(condition(),'Expected asynchronous condition');}
const pair={sourceLanguage:'en',targetLanguage:'ko'};
const options={expectedInputs:[{type:'text',languages:['en']}],expectedOutputs:[{type:'text',languages:['ko']}]};
function portFor(h,name,url,tab){
 const port={name,sender:{id:'test',url:'chrome-extension://test/'+url,...(tab?{tab:{id:2}}:{})},sent:[],onMessage:event(),onDisconnect:event(),disconnected:false,
  postMessage(message){this.sent.push(message);this.handle?.(message);},disconnect(){this.disconnected=true;this.onDisconnect.emit();}};
 for(const listener of h.chrome.runtime.onConnect.listeners)listener(port);return port;
}
async function backgroundHarness(){
 const h=await connectionHarness(),creates=[],state={available:true,packs:new Set(['en>ko']),hold:false,resolve:null,destroys:0,hostCreations:0},document={getElementById:()=>({textContent:''})};
 const output=JSON.stringify({blocks:[{id:'b1',nodes:[{id:'n0',text:'번역'}]}]});
 const Translator={availability:async p=>state.packs.has(p.sourceLanguage+'>'+p.targetLanguage)?'available':'downloadable',create:async p=>{creates.push({provider:'translator',...p});return {translate:async()=>state.hold?new Promise(resolve=>{state.resolve=resolve;}):'번역',destroy(){state.destroys++;}};}};
 const LanguageModel={availability:async()=>state.available?'available':'downloadable',create:async p=>{creates.push({provider:'chrome',...p});return {async *promptStreaming(){yield state.hold?await new Promise(resolve=>{state.resolve=()=>resolve(output);}):output;},destroy(){state.destroys++;}};}};
 const window={addEventListener(){},parent:{postMessage(){}}},context=vm.createContext({window,document,location:{origin:'chrome-extension://test'},Translator,LanguageModel,AbortController,DOMException,setTimeout,clearTimeout,URL,console});
 const modules=new Map();async function load(url){if(!modules.has(url.href))modules.set(url.href,readFile(url,'utf8').then(code=>new vm.SourceTextModule(code,{context,identifier:url.href})));return modules.get(url.href);}
 const entry=await load(new URL('../extension/browser-ai-frame.mjs',import.meta.url));await entry.link((specifier,parent)=>load(new URL(specifier,parent.identifier)));await entry.evaluate();
 const ports=[];
 function connectHost(){const port=portFor(h,'browser-ai-background','browser-ai.html');port.handle=message=>window.runBrowserAI(message,response=>port.onMessage.emit(response));ports.push(port);return port;}
 h.chrome.i18n.detectLanguage=async()=>({isReliable:true,languages:[{language:'en',percentage:100}]});
 h.chrome.runtime.getContexts=async()=>ports.some(p=>!p.disconnected)?[{documentUrl:'chrome-extension://test/browser-ai.html'}]:[];
 h.chrome.offscreen={createDocument:async args=>{assert.deepEqual(Array.from(args.reasons),['IFRAME_SCRIPTING']);state.hostCreations++;connectHost();}};
 async function prepare(provider){
  await h.send({type:'auth.provider',provider});await h.send({type:'settings.update',patch:{modelId:provider==='translator'?'browser-translator':'chrome-gemini-nano',targetLanguage:'한국어',maxRetries:0}});
  const page=portFor(h,provider==='translator'?'translator-runner':'chrome-ai-runner',provider==='translator'?'translator.html':'chrome-ai.html',true);
  page.onMessage.emit({type:'ready',options:provider==='translator'?pair:options});await until(()=>page.sent.some(x=>x.type==='accepted'));
  return page;
 }
 return {...h,state,ports,creates,prepare,connectHost,job:async()=>(await h.send({type:'job.begin'},h.content)).data};
}
export async function nativeBackgroundTests(){
 const results=[];async function test(name,fn){try{await fn();results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.stack||error.message});}}
 await test('Both native providers continue translating after their preparation tabs close',async()=>{
  for(const provider of ['translator','chrome']){
   const h=await backgroundHarness(),page=await h.prepare(provider);assert.equal(page.sent.find(x=>x.type==='accepted').background,true);
   const before=(await h.send({type:'auth.status'})).data;page.onMessage.emit({type:'stopped',explicit:false});page.disconnect();
   const after=(await h.send({type:'auth.status'})).data;assert.equal(after.state,'connected');assert.equal(after.connectionId,before.connectionId);
   const job=await h.job(),result=await h.send({type:'job.batch',jobId:job.id,blocks},h.content);assert.equal(result.data.b1[0],'번역');assert.equal(h.requests.length,0);
  }
 });
 await test('Closing setup during inference does not cancel hidden translation',async()=>{
  const h=await backgroundHarness(),page=await h.prepare('translator'),job=await h.job();h.state.hold=true;
  const response=h.send({type:'job.batch',jobId:job.id,blocks},h.content);await until(()=>h.state.resolve);page.disconnect();h.state.resolve('완료');
  assert.equal((await response).data.b1[0],'완료');
 });
 await test('One offscreen host serves both providers without exposing cloud credentials',async()=>{
  const h=await backgroundHarness();(await h.prepare('translator')).disconnect();(await h.prepare('chrome')).disconnect();
  assert.equal(h.state.hostCreations,1);assert.ok(!JSON.stringify(h.ports[0].sent).includes('TEST_ONLY_SUBSCRIPTION_TOKEN'));
  assert.equal(h.local.data.nativeConnection_translator.connectionId.startsWith('translator:'),true);assert.equal(h.local.data.nativeConnection_chrome.connectionId.startsWith('chrome:'),true);
 });
 await test('A recreated hidden document reuses downloaded packs and keeps connection identity',async()=>{
  const h=await backgroundHarness();(await h.prepare('translator')).disconnect();const before=(await h.send({type:'auth.status'})).data;
  h.ports[0].disconnect();const job=await h.job();assert.equal((await h.send({type:'job.batch',jobId:job.id,blocks},h.content)).ok,true);
  assert.equal(h.state.hostCreations,2);assert.equal((await h.send({type:'auth.status'})).data.connectionId,before.connectionId);
 });
 await test('Stored preparation survives a fresh service worker and lazily starts its hidden host',async()=>{
  const h=await backgroundHarness();h.local.data.connectionProvider='translator';h.local.data.nativeConnection_translator={connectionId:'translator:previous-worker'};
  await h.send({type:'settings.update',patch:{modelId:'browser-translator',targetLanguage:'한국어',maxRetries:0}});
  assert.equal(h.state.hostCreations,0);const job=await h.job();assert.equal((await h.send({type:'job.batch',jobId:job.id,blocks},h.content)).ok,true);assert.equal(h.state.hostCreations,1);
 });
 await test('Missing language packs require a new click and persist only preparation options',async()=>{
  const h=await backgroundHarness();(await h.prepare('translator')).disconnect();h.chrome.i18n.detectLanguage=async()=>({isReliable:true,languages:[{language:'ja',percentage:100}]});
  const job=await h.job(),result=await h.send({type:'job.batch',jobId:job.id,blocks},h.content);assert.equal(result.error.code,'LOCAL_NOT_READY');
  assert.deepEqual(JSON.parse(JSON.stringify(h.local.data.nativeConnection_translator.pendingSetup)),{sourceLanguage:'ja',targetLanguage:'ko'});
  assert.equal(h.creates.filter(x=>x.sourceLanguage==='ja').length,0);assert.ok(!JSON.stringify(h.local.data.nativeConnection_translator).includes('Hello world'));
  const page=portFor(h,'translator-runner','translator.html',true);page.onMessage.emit({type:'inspect'});await until(()=>page.sent.some(x=>x.type==='background-state'));assert.equal(page.sent.at(-1).pendingSetup.sourceLanguage,'ja');
  h.state.packs.add('ja>ko');page.onMessage.emit({type:'ready',options:{sourceLanguage:'ja',targetLanguage:'ko'}});await until(()=>page.sent.some(x=>x.type==='accepted'));
  assert.equal((await h.send({type:'job.batch',jobId:job.id,blocks},h.content)).ok,true);
 });
 await test('Hidden setup failures leave the tab fallback available and never claim background readiness',async()=>{
  for(const provider of ['translator','chrome']){
   const h=await backgroundHarness();h.state.available=false;h.state.packs.clear();const page=await h.prepare(provider);
   assert.equal(page.sent.find(x=>x.type==='accepted').background,false);assert.equal(h.local.data['nativeConnection_'+provider],undefined);
   page.disconnect();assert.equal((await h.send({type:'auth.status'})).data.state,'signed_out');assert.equal(h.creates.length,0);
  }
 });
 await test('Hidden-host authentication rejects regular tabs, web pages and other extensions',async()=>{
  const h=await backgroundHarness();assert.equal(portFor(h,'browser-ai-background','browser-ai.html',true).disconnected,true);
  assert.equal(portFor(h,'browser-ai-background','translator.html').disconnected,true);
  const port={name:'browser-ai-background',sender:{id:'other',url:'chrome-extension://test/browser-ai.html'},disconnect(){this.disconnected=true;}};
  for(const listener of h.chrome.runtime.onConnect.listeners)listener(port);assert.equal(port.disconnected,true);
 });
 await test('Cancellation aborts hidden requests and ignores late native output',async()=>{
  const h=await backgroundHarness();(await h.prepare('translator')).disconnect();const job=await h.job();h.state.hold=true;
  const result=h.send({type:'job.batch',jobId:job.id,blocks},h.content);await until(()=>h.state.resolve);await h.send({type:'job.cancel',jobId:job.id},h.content);
  assert.equal((await result).error.code,'CANCELLED');assert.ok(h.ports[0].sent.some(x=>x.type==='cancel'));h.state.resolve('late');await tick();
 });
 await test('Disconnect clears persistent readiness and destroys only the selected provider sessions',async()=>{
  const h=await backgroundHarness();(await h.prepare('chrome')).disconnect();(await h.prepare('translator')).disconnect();const destroyed=h.state.destroys;
  await h.send({type:'auth.signOut'});assert.equal(h.local.data.nativeConnection_translator,undefined);assert.ok(h.local.data.nativeConnection_chrome);assert.ok(h.state.destroys>destroyed);
  assert.equal((await h.send({type:'auth.status'})).data.state,'signed_out');assert.ok(h.local.data.auth);
 });
 await test('Initial readiness waits for hidden handoff and stopping cannot revive a late setup result',async()=>{
  const h=await backgroundHarness();await h.send({type:'auth.provider',provider:'translator'});
  let release;h.chrome.offscreen.createDocument=async()=>{await new Promise(resolve=>{release=resolve;});h.connectHost();};
  const page=portFor(h,'translator-runner','translator.html',true);page.onMessage.emit({type:'ready',options:pair});await until(()=>release);
  assert.equal((await h.send({type:'auth.status'})).data.state,'signed_out');
  page.onMessage.emit({type:'stopped',explicit:true});release();await until(()=>h.ports.length>0);await tick();assert.equal(h.creates.length,0);
  assert.equal(h.local.data.nativeConnection_translator,undefined);assert.ok(!page.sent.some(x=>x.type==='accepted'));
 });
 await test('Provider switching cancels hidden inference without applying stale results',async()=>{
  const h=await backgroundHarness();(await h.prepare('translator')).disconnect();const job=await h.job();h.state.hold=true;
  const result=h.send({type:'job.batch',jobId:job.id,blocks},h.content);await until(()=>h.state.resolve);await h.send({type:'auth.provider',provider:'subscription'});
  assert.equal((await result).error.code,'CANCELLED');h.state.resolve('late');await tick();assert.equal(h.requests.length,0);
 });
 await test('The offscreen parent accepts only its own iframe and forwards runtime messages without other extension APIs',async()=>{
  const listeners={},forwarded=[],frame={contentWindow:{}},sent=[],port={onMessage:event(),onDisconnect:event(),postMessage:m=>sent.push(m),disconnect(){}};let connects=0;
  const window={addEventListener(name,fn){listeners[name]=fn;}},chrome={runtime:{connect(){connects++;return port;}}};
  const context=vm.createContext({window,chrome,document:{getElementById:()=>frame},location:{origin:'chrome-extension://test'},setInterval(){},setTimeout(){}});
  const entry=new vm.SourceTextModule(await readFile(new URL('../extension/browser-ai.mjs',import.meta.url),'utf8'),{context});await entry.link(()=>{});await entry.evaluate();
  frame.contentWindow.runBrowserAI=(message,emit)=>{forwarded.push(message);if(message.type==='translate')emit({type:'result',id:message.id,text:'done'});};
  listeners.message({source:{},origin:'chrome-extension://test',data:{type:'browser-ai-frame-ready'}});assert.equal(connects,0);
  listeners.message({source:frame.contentWindow,origin:'https://example.test',data:{type:'browser-ai-frame-ready'}});assert.equal(connects,0);
  listeners.message({source:frame.contentWindow,origin:'chrome-extension://test',data:{type:'browser-ai-frame-ready'}});assert.equal(connects,1);
  port.onMessage.emit({type:'translate',provider:'translator',id:'one'});assert.equal(sent.at(-1).text,'done');
  port.onDisconnect.emit();assert.deepEqual(forwarded.slice(-2).map(x=>x.provider),['chrome','translator']);
 });
 await test('Stopping during source detection prevents a later hidden inference request',async()=>{
  const h=await backgroundHarness(),page=await h.prepare('translator'),job=await h.job();let release;
  h.chrome.i18n.detectLanguage=()=>new Promise(resolve=>{release=()=>resolve({isReliable:true,languages:[{language:'en',percentage:100}]});});
  const result=h.send({type:'job.batch',jobId:job.id,blocks},h.content);await until(()=>release);
  page.onMessage.emit({type:'stopped',explicit:true});await tick();release();assert.equal((await result).error.code,'LOCAL_NOT_READY');
  assert.ok(!h.ports[0].sent.some(x=>x.type==='translate'));
 });
 return {passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
}
