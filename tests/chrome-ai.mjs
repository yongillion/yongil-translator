import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mockI18n,localeFetch} from './locale-fixtures.mjs';
import {readFile} from 'node:fs/promises';
import {connectionHarness,blocks} from './api-connection.mjs';
import {uiHarness} from './ui-state.mjs';
import {chromeAIAvailability,discoverChromeAI,hasChromeAI,chromeAILanguage,chromeAIOptions,promptChromeAI,CHROME_AI_MODEL} from '../extension/lib/chrome-ai.mjs';

const chromeNavigator={userAgent:'Mozilla/5.0 Chrome/150.0.0.0 Safari/537.36',userAgentData:{brands:[{brand:'Not/A)Brand',version:'99'},{brand:'Chromium',version:'150'},{brand:'Google Chrome',version:'150'}]}};
const feature={availability:async options=>!options?.expectedOutputs?.[0]?.languages||options.expectedOutputs[0].languages.every(x=>['en','ja','es','de','fr'].includes(x))?'available':'unavailable',create:async()=>{}};
const forks=[undefined,{userAgent:'Chrome/150.0.0.0'}, {...chromeNavigator,userAgentData:{brands:[{brand:'Chromium'}]}},
 {...chromeNavigator,brave:{}}, {...chromeNavigator,userAgent:chromeNavigator.userAgent+' Edg/150.0.0.0'},
 {...chromeNavigator,userAgentData:{brands:[{brand:'Chromium'},{brand:'Microsoft Edge'}]}},
 {...chromeNavigator,userAgent:chromeNavigator.userAgent+' OPR/125.0'}, {...chromeNavigator,userAgent:chromeNavigator.userAgent+' Vivaldi/7.0'},
 {...chromeNavigator,userAgent:chromeNavigator.userAgent+' Whale/4.0'}, {...chromeNavigator,userAgent:chromeNavigator.userAgent+' SamsungBrowser/29.0'}];
const event=()=>({listeners:[],addListener(fn){this.listeners.push(fn);},emit(value){for(const fn of this.listeners)fn(value);}});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function runner(h,sender={id:'test',url:'chrome-extension://test/chrome-ai.html',tab:{id:2}}){
 const port={name:'chrome-ai-runner',sender,onMessage:event(),onDisconnect:event(),sent:[],disconnected:false,
  postMessage(message){this.sent.push(message);this.handle?.(message);},disconnect(){this.disconnected=true;this.onDisconnect.emit();}};
 for(const listener of h.chrome.runtime.onConnect.listeners)listener(port);
 return port;
}
async function setup(){
 const h=await connectionHarness({navigator:chromeNavigator});
 await h.send({type:'auth.provider',provider:'chrome'});
 const port=runner(h);port.onMessage.emit({type:'ready'});
 await h.send({type:'settings.update',patch:{modelId:CHROME_AI_MODEL,targetLanguage:'日本語',maxRetries:0}});
 const job=async()=>(await h.send({type:'job.begin'},h.content)).data;
 return {...h,port,job};
}
const translated=JSON.stringify({blocks:[{id:'b1',nodes:[{id:'n0',text:'こんにちは'}]}]});
function respond(port,output=translated){port.handle=message=>{if(message.type==='translate'){port.onMessage.emit({type:'chunk',id:message.id,text:output});port.onMessage.emit({type:'result',id:message.id,text:output});}};}
async function pageHarness(model,{targetLanguage='한국어',detectLanguage}={}){
 const nodes=new Map(['prepare-local','cancel-local','local-status','download-progress'].map(id=>[id,{hidden:true,disabled:true,textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}}]));
 const port={onMessage:event(),onDisconnect:event(),sent:[],postMessage(message){this.sent.push(message);},disconnect(){this.onDisconnect.emit();}};let connections=0;
 const chrome={i18n:{...mockI18n('en'),detectLanguage},storage:{local:{get:async()=>({settings:{uiLanguage:'en',targetLanguage}})},onChanged:event()},runtime:{getURL:p=>'chrome-extension://test/'+p,connect(){connections++;return port;}}};
 const document={getElementById:id=>nodes.get(id),documentElement:{dataset:{}},querySelectorAll:()=>[]};
 const context=vm.createContext({chrome,document,LanguageModel:model,fetch:localeFetch,AbortController,DOMException,URL,setTimeout,clearTimeout,setInterval(){},window:{addEventListener(){}}});
 const entry=new vm.SourceTextModule(await readFile(new URL('../extension/chrome-ai.mjs',import.meta.url),'utf8'),{context});const modules=new Map();
 await entry.link(async specifier=>{const name=specifier.split('/').pop();if(!modules.has(name))modules.set(name,readFile(new URL('../extension/lib/'+name,import.meta.url),'utf8').then(source=>new vm.SourceTextModule(source,{context})));return modules.get(name);});await entry.evaluate();
 return {nodes,port,connections,click:id=>nodes.get(id).listeners.click()};
}
export async function chromeAITests(){
 const results=[];async function test(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.stack||e.message});}}
 await test('Discovery uses API availability without browser branding or model downloads',async()=>{
  assert.equal(hasChromeAI(feature),true);assert.equal(hasChromeAI({}),false);let created=0;
  for(const state of ['available','downloadable','downloading']){
   const support=await discoverChromeAI({availability:async()=>state,create:()=>{created++;}});
   assert.equal(support.state,state);assert.ok(support.languages.includes('ko'));
  }
  assert.equal(created,0);
 });
 await test('Missing APIs, unavailable models, unknown states, policy errors and timeouts fail closed',async()=>{
  for(const model of [{},{availability:async()=> 'available'}, {availability:async()=> 'unavailable',create(){}},{availability:async()=> 'future',create(){}},{availability:async()=>{throw new Error('blocked');},create(){}}])assert.equal((await discoverChromeAI(model)).state,'unavailable');
  assert.equal(await chromeAIAvailability({}, {availability:()=>new Promise(()=>{}),create(){}},5),'unavailable');
 });
 await test('Popup and options expose compatible APIs in Chrome, Samsung, Edge and unbranded browsers',async()=>{
  for(const options of [false,true]){
   const html=await readFile(new URL('../extension/'+(options?'options':'popup')+'.html',import.meta.url),'utf8');
   assert.match(html,/<button id="use-chrome"[^>]* hidden>/);
   for(const navigator of [chromeNavigator,...forks]){
    const h=await uiHarness({options,navigator,LanguageModel:feature});assert.equal(h.nodes.get('use-chrome').hidden,false);
    assert.equal((await uiHarness({options,navigator})).nodes.get('use-chrome').hidden,true);
   }
   for(const state of ['available','downloadable','downloading','unavailable','future']){
    const h=await uiHarness({options,navigator:chromeNavigator,LanguageModel:{availability:async()=>state,create(){}}});
    assert.equal(h.nodes.get('use-chrome').hidden,['unavailable','future'].includes(state));
   }
  }
 });
 await test('A saved local connection on an unsupported browser stays disconnected until explicitly switched',async()=>{
  const h=await uiHarness({provider:'chrome',connected:true});assert.equal(h.body.dataset.connected,'false');assert.equal(h.nodes.get('use-chrome').hidden,true);assert.equal(h.nodes.get('open-chrome-ai').hidden,true);
  await h.click('login');assert.ok(h.calls.indexOf('auth.provider')<h.calls.indexOf('auth.start'));assert.equal(h.status.current.state,'signing_in');
 });
 await test('Local mode replaces login/key controls, preserves site access gating, and disables unsupported targets',async()=>{
  const h=await uiHarness({navigator:chromeNavigator,LanguageModel:feature,uiLanguage:'en'});await h.click('use-chrome');
  assert.equal(h.nodes.get('login').hidden,true);assert.equal(h.nodes.get('api-key-form').hidden,true);assert.equal(h.nodes.get('open-chrome-ai').hidden,false);
  await h.click('open-chrome-ai');assert.ok(h.calls.includes('chromeAI.open'));
  h.status.current={state:'connected',provider:'chrome',connectionId:'local'};await h.poll();
  assert.equal(h.nodes.get('permission-card').hidden,false);assert.equal(h.nodes.get('account-card').hidden,true);
  await h.click('allow-site');await tick();assert.equal(h.nodes.get('translate').disabled,true);
  assert.equal(h.nodes.get('usage-link').hidden,true);
  await h.click('restore');assert.ok(h.calls.includes('page.restore'));
  await h.click('stop');assert.ok(h.calls.includes('page.stop'));
  h.nodes.get('target-language').value='English';await h.nodes.get('target-language').emit('blur');await tick();
  assert.equal(h.savedSettings.targetLanguage,'English');assert.equal(h.nodes.get('translate').disabled,false);
 });
 await test('Local target picker offers supported languages while cloud mode retains Korean',async()=>{
  const h=await uiHarness({navigator:chromeNavigator,LanguageModel:feature,provider:'chrome',connected:true,permission:true,uiLanguage:'en'});
  assert.equal(h.nodes.get('target-combobox').hidden,true);assert.ok(h.nodes.get('target-language-select').children.length>1);
  assert.ok(!h.nodes.get('target-language-select').children.some(row=>row.textContent.includes('Korean')));
  const cloud=await uiHarness({provider:'api',connected:true,permission:true,uiLanguage:'en'});await cloud.click('language-toggle');assert.ok(cloud.nodes.get('language-list').children.some(row=>row.children[0].textContent.includes('Korean')));
 });
 await test('Worker requires a ready extension runner without inspecting browser identity',async()=>{
  const h=await connectionHarness();h.local.data.connectionProvider='chrome';
  assert.equal((await h.send({type:'auth.status'})).data.provider,'chrome');
  assert.equal((await h.send({type:'auth.status'})).data.state,'signed_out');
  assert.equal((await h.send({type:'job.begin'},h.content)).ok,false);
  assert.equal((await h.send({type:'auth.provider',provider:'chrome'})).ok,true);
  assert.equal((await h.send({type:'chromeAI.open'})).ok,true);
  const port=runner(h);assert.equal(port.disconnected,false);port.onMessage.emit({type:'ready'});
  assert.equal((await h.send({type:'auth.status'})).data.state,'connected');assert.equal(h.requests.length,0);
 });
 await test('Runner bridge authenticates the exact extension document and rejects duplicate runners',async()=>{
  const h=await connectionHarness({navigator:chromeNavigator});
  for(const sender of [{id:'other',url:'chrome-extension://test/chrome-ai.html',tab:{id:2}},{id:'test',url:'https://example.test/',tab:{id:2}},{id:'test',url:'chrome-extension://test/chrome-ai.html'}])assert.equal(runner(h,sender).disconnected,true);
  const first=runner(h),second=runner(h);assert.equal(first.disconnected,false);assert.equal(second.disconnected,true);
 });
 await test('Local model discovery and translation stay on device with one block and request at a time',async()=>{
  const h=await setup(),models=await h.send({type:'models.list'});assert.equal(models.data.items[0].id,CHROME_AI_MODEL);
  const job=await h.job();assert.equal(job.maxConcurrentBatches,1);assert.equal(job.maxBatchBlocks,1);
  respond(h.port);const result=await h.send({type:'job.batch',jobId:job.id,blocks},h.content);
  assert.equal(result.data.b1[0],'こんにちは');assert.equal(h.requests.length,0);
  const input=h.port.sent.find(x=>x.type==='translate');assert.equal(input.targetLanguage,'日本語');assert.equal(input.blocks[0].nodes[0].text,'Hello world');assert.ok(!JSON.stringify(input).includes('TEST_ONLY_SUBSCRIPTION_TOKEN'));
 });
 await test('Unsupported targets fail before a local job starts',async()=>{
  const h=await setup();await h.send({type:'settings.update',patch:{targetLanguage:'Unknown language'}});
  const result=await h.send({type:'job.begin'},h.content);assert.equal(result.error.code,'LANGUAGE');assert.equal(h.requests.length,0);
 });
 await test('Closing the runner rejects in-flight translation and requires setup without cloud fallback',async()=>{
  const h=await setup(),job=await h.job();const result=h.send({type:'job.batch',jobId:job.id,blocks},h.content);await tick();h.port.disconnect();
  assert.equal((await result).error.code,'LOCAL_NOT_READY');assert.equal((await h.send({type:'auth.status'})).data.state,'signed_out');assert.equal(h.requests.length,0);
 });
 await test('Cancelling local translation aborts the runner and ignores late output',async()=>{
  const h=await setup(),job=await h.job();const result=h.send({type:'job.batch',jobId:job.id,blocks},h.content);await tick();
  await h.send({type:'job.cancel',jobId:job.id},h.content);assert.equal((await result).error.code,'CANCELLED');
  const request=h.port.sent.find(x=>x.type==='translate');assert.ok(h.port.sent.some(x=>x.type==='cancel'&&x.id===request.id));
  h.port.onMessage.emit({type:'result',id:request.id,text:translated});assert.equal(h.requests.length,0);
 });
 await test('Malformed local output uses the configured retry budget and logs local inputs and outputs',async()=>{
  const h=await setup();await h.send({type:'settings.update',patch:{maxRetries:1,developerMode:true}});const job=await h.job();let attempts=0;
  h.port.handle=message=>{if(message.type==='translate')h.port.onMessage.emit({type:'result',id:message.id,text:++attempts===1?'bad JSON':translated});};
  const result=await h.send({type:'job.batch',jobId:job.id,blocks},h.content);assert.equal(result.ok,true);assert.equal(attempts,2);
  const log=JSON.stringify(await h.send({type:'logs.get'}));assert.ok(log.includes('local.request'));assert.ok(log.includes('translation.retry'));assert.ok(log.includes('こんにちは'));assert.ok(!log.includes('http.request'));assert.equal(h.requests.length,0);
 });
 await test('Switching connections cancels local work and restores the previous cloud model',async()=>{
  const h=await setup(),job=await h.job();const result=h.send({type:'job.batch',jobId:job.id,blocks},h.content);await tick();await h.send({type:'auth.provider',provider:'subscription'});
  assert.equal((await result).error.code,'CANCELLED');assert.equal((await h.send({type:'settings.get'})).data.modelId,'subscription-model');
  await h.send({type:'auth.provider',provider:'chrome'});assert.equal((await h.send({type:'settings.get'})).data.modelId,CHROME_AI_MODEL);
 });
 await test('Disconnecting local mode stops its runner and preserves API/subscription credentials',async()=>{
  const h=await setup();const original=(await h.send({type:'auth.status'})).data.connectionId;await h.send({type:'auth.signOut'});
  assert.ok(h.port.sent.some(x=>x.type==='stop'));assert.ok(h.local.data.auth);assert.equal((await h.send({type:'auth.status'})).data.state,'signed_out');
  h.port.onMessage.emit({type:'ready'});assert.notEqual((await h.send({type:'auth.status'})).data.connectionId,original);
 });
 await test('Language options preserve supported regional variants and reject unsupported targets',()=>{
  assert.equal(chromeAILanguage('English (United States)'),'en');assert.equal(chromeAILanguage('fr-CA'),'fr');assert.equal(chromeAILanguage('日本語'),'ja');assert.equal(chromeAILanguage('한국어'),'ko');assert.throws(()=>chromeAILanguage('Unknown language'),e=>e.code==='LANGUAGE');
  assert.deepEqual(chromeAIOptions('ja').expectedOutputs,[{type:'text',languages:['ja']}]);
 });
 await test('Prompt sessions use structured output, stream deltas, and always release the model',async()=>{
  const calls=[],chunks=[];let destroyed=0;
  const model={availability:async options=>{calls.push(options);return 'available';},create:async options=>{calls.push(options);return {async *promptStreaming(text,options){calls.push({text,options});yield translated.slice(0,10);yield translated.slice(10);},destroy(){destroyed++;}};}};
  const result=await promptChromeAI({instructions:'Translate only',blocks,targetLanguage:'日本語'},new AbortController().signal,chunk=>chunks.push(chunk),model);
  assert.equal(result,translated);assert.equal(chunks.join(''),translated);assert.equal(destroyed,1);assert.deepEqual(calls[0],chromeAIOptions('ja'));assert.deepEqual(calls[1].initialPrompts,[{role:'system',content:'Translate only'}]);assert.equal(calls[2].options.responseConstraint.type,'object');
 });
 await test('Local engine handles cancellation, context exhaustion, and unavailable models without generating',async()=>{
  const request={instructions:'Translate',blocks,targetLanguage:'English'};let destroyed=0,created=0;
  const model={availability:async()=> 'available',create:async()=>{created++;return {async *promptStreaming(){throw new DOMException('too much','QuotaExceededError');},destroy(){destroyed++;}};}};
  const controller=new AbortController();controller.abort();await assert.rejects(promptChromeAI(request,controller.signal,null,model),e=>e.name==='AbortError');assert.equal(created,0);
  await assert.rejects(promptChromeAI(request,new AbortController().signal,null,model),e=>e.code==='CONTEXT');assert.equal(destroyed,1);
  model.availability=async()=> 'downloadable';await assert.rejects(promptChromeAI(request,new AbortController().signal,null,model),e=>e.code==='LOCAL_NOT_READY');assert.equal(created,1);
 });
 await test('Korean and additional targets follow browser support rather than a fixed language allowlist',async()=>{
  const model={availability:async options=>options?.expectedOutputs?.[0]?.languages?.some(x=>!['en','ko'].includes(x))?'unavailable':'available',create(){throw new Error('Discovery must not download');}};
  const support=await discoverChromeAI(model);assert.deepEqual(support.languages,['ko','en']);
  const h=await uiHarness({navigator:forks.at(-1),LanguageModel:model,provider:'chrome',connected:true,permission:true,uiLanguage:'en'});
  assert.equal(h.nodes.get('translate').disabled,false);assert.equal(h.nodes.get('target-combobox').hidden,true);
  assert.ok(h.nodes.get('target-language-select').children.some(row=>row.textContent.includes('Korean')));
  assert.ok(!h.nodes.get('language-list').children.some(row=>row.children[0].textContent.includes('Japanese')));
 });
 await test('Inference checks the exact source and target options and rejects unsupported pairs before creation',async()=>{
  let checked,created=0;const request={instructions:'Translate',blocks,targetLanguage:'한국어',sourceLanguages:['ja','en']};
  const model={availability:async options=>{checked=options;return 'unavailable';},create(){created++;}};
  await assert.rejects(promptChromeAI(request,new AbortController().signal,null,model),e=>e.code==='LANGUAGE');
  assert.deepEqual(checked,chromeAIOptions('ko',['ja','en']));assert.equal(created,0);
  model.availability=async()=> 'available';model.create=async options=>{assert.deepEqual(options.expectedInputs,checked.expectedInputs);assert.deepEqual(options.expectedOutputs,checked.expectedOutputs);return {async *promptStreaming(){yield translated;},destroy(){}};};
  assert.equal(await promptChromeAI(request,new AbortController().signal,null,model),translated);
 });
 await test('The setup document waits for an explicit click and prepares the browser-supported target',async()=>{
  let created=0,destroyed=0,options;
  const model={availability:async()=> 'downloadable',create(value){created++;options=value;return Promise.resolve({promptStreaming(){},destroy(){destroyed++;}});}};
  const h=await pageHarness(model);assert.equal(created,0);assert.equal(h.connections,1);h.port.onMessage.emit({type:'connected'});
  h.click('prepare-local');assert.equal(created,1,'create must run synchronously during user activation');
  assert.equal(options.expectedOutputs[0].languages[0],'ko');await tick();assert.equal(destroyed,1);assert.ok(h.port.sent.some(m=>m.type==='ready'));
  h.click('cancel-local');assert.ok(h.port.sent.some(m=>m.type==='stopped'));
 });
 await test('Unavailable or policy-blocked APIs keep setup hidden and never connect or download',async()=>{
  for(const availability of [async()=> 'unavailable',async()=>{throw new Error('policy');}]){
   let created=0;const h=await pageHarness({availability,create(){created++;}});
   assert.equal(h.connections,0);assert.equal(h.nodes.get('prepare-local').hidden,true);h.click('prepare-local');assert.equal(created,0);
  }
 });
 await test('Incompatible model sessions cannot mark the runner ready',async()=>{
  let destroyed=0;const h=await pageHarness({availability:async()=> 'available',create:async()=>({destroy(){destroyed++;}})});
  h.port.onMessage.emit({type:'connected'});h.click('prepare-local');await tick();assert.equal(destroyed,1);assert.ok(!h.port.sent.some(m=>m.type==='ready'));assert.equal(h.nodes.get('prepare-local').hidden,false);
 });
 await test('A source language download requires another user click with the exact request options',async()=>{
  const creates=[];let downloaded=false;
  const model={availability:async options=>options?.expectedInputs?.[0]?.languages?.includes('ja')&&!downloaded?'downloadable':'available',create(options){creates.push(options);if(options.expectedInputs[0].languages.includes('ja'))downloaded=true;return Promise.resolve({async *promptStreaming(){yield translated;},destroy(){}});}};
  const h=await pageHarness(model,{detectLanguage:async()=>({isReliable:true,languages:[{language:'ja',percentage:100}]})});h.port.onMessage.emit({type:'connected'});h.click('prepare-local');await tick();
  const request={type:'translate',id:'one',instructions:'Translate',blocks,targetLanguage:'한국어'};h.port.onMessage.emit(request);await tick();
  assert.ok(h.port.sent.some(m=>m.type==='error'&&m.code==='LOCAL_NOT_READY'));assert.equal(creates.length,1);assert.equal(h.nodes.get('prepare-local').hidden,false);
  h.click('prepare-local');assert.equal(creates.length,2);assert.deepEqual(Array.from(creates[1].expectedInputs[0].languages),['en','ja']);await tick();
  h.port.onMessage.emit({...request,id:'two'});await tick();assert.ok(h.port.sent.some(m=>m.type==='result'&&m.id==='two'));assert.equal(creates.length,3);
 });
 return {passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,results};
}
