import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {localeFetch,mockI18n,catalogs} from './locale-fixtures.mjs';
import {uiHarness} from './ui-state.mjs';
import {connectionHarness,blocks} from './api-connection.mjs';
import {BrowserTranslator,TRANSLATOR_MODEL,discoverTranslator,translatorAvailability,translatorLanguage,detectSource} from '../extension/lib/translator.mjs';
import {parseTranslation} from '../extension/lib/protocol.mjs';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const detection=(language='en',isReliable=true)=>async()=>({isReliable,languages:[{language,percentage:100}]});
const event=()=>({listeners:[],addListener(fn){this.listeners.push(fn);},emit(value){for(const fn of this.listeners)fn(value);}});
const feature={availability:async()=> 'available',create:async()=>({translate:async text=>'번역 '+text,destroy(){}})};
function runner(h,sender={id:'test',url:'chrome-extension://test/translator.html',tab:{id:2}}){
 const port={name:'translator-runner',sender,onMessage:event(),onDisconnect:event(),sent:[],disconnected:false,
  postMessage(message){this.sent.push(message);this.handle?.(message);},disconnect(){this.disconnected=true;this.onDisconnect.emit();}};
 for(const listener of h.chrome.runtime.onConnect.listeners)listener(port);return port;
}
async function setup(){
 const h=await connectionHarness();await h.send({type:'auth.provider',provider:'translator'});
 const port=runner(h);port.onMessage.emit({type:'ready'});
 await h.send({type:'settings.update',patch:{modelId:TRANSLATOR_MODEL,targetLanguage:'한국어',maxRetries:0}});
 return {...h,port,job:async()=>(await h.send({type:'job.begin'},h.content)).data};
}
async function pageHarness(api){
 const nodes=new Map(['prepare-local','cancel-local','local-status','language-pair','download-progress'].map(id=>[id,{hidden:true,disabled:true,textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}}]));
 const port={onMessage:event(),onDisconnect:event(),sent:[],postMessage(message){this.sent.push(message);},disconnect(){this.onDisconnect.emit();}};
 const chrome={i18n:{...mockI18n('en'),detectLanguage:detection()},storage:{local:{get:async()=>({settings:{uiLanguage:'en',targetLanguage:'한국어'}})},onChanged:event()},runtime:{getURL:p=>'chrome-extension://test/'+p,connect:()=>port}};
 const document={getElementById:id=>nodes.get(id),documentElement:{dataset:{}},querySelectorAll:()=>[]};
 const context=vm.createContext({chrome,document,Translator:api,fetch:localeFetch,AbortController,DOMException,URL,setTimeout,clearTimeout,setInterval(){},window:{addEventListener(){}}});
 const modules=new Map(),entry=new vm.SourceTextModule(await readFile(new URL('../extension/translator.mjs',import.meta.url),'utf8'),{context});
 await entry.link(async specifier=>{const name=specifier.split('/').pop();if(!modules.has(name))modules.set(name,readFile(new URL('../extension/lib/'+name,import.meta.url),'utf8').then(source=>new vm.SourceTextModule(source,{context})));return modules.get(name);});await entry.evaluate();
 return {nodes,port,click:id=>nodes.get(id).listeners.click()};
}
export async function translatorTests(){
 const results=[];async function test(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.stack||e.message});}}
 await test('Translator discovery probes language pairs without creating models or assuming English support',async()=>{
  let creates=0;const support=await discoverTranslator({availability:async p=>p.sourceLanguage==='fr'&&p.targetLanguage==='de'?'downloadable':'unavailable',create(){creates++;}});
  assert.equal(support.state,'available');assert.equal(support.pairs.length,1);assert.equal(support.pairs[0].targetLanguage,'de');assert.equal(creates,0);
 });
 await test('Translator feature probes reject missing methods, blocked policies, unknown states and hanging APIs',async()=>{
  for(const api of [{},{availability(){}},{...feature,availability:async()=> 'future'},{...feature,availability:async()=>{throw Error('blocked');}}])assert.equal((await discoverTranslator(api)).state,'unavailable');
  assert.equal(await translatorAvailability({sourceLanguage:'en',targetLanguage:'ko'},{...feature,availability:()=>new Promise(()=>{})},5),'unavailable');
 });
 await test('Language mapping preserves regional targets and distinguishes simplified and traditional Chinese',async()=>{
  assert.equal(translatorLanguage('한국어'),'ko');assert.equal(translatorLanguage('en-GB'),'en-GB');assert.equal(translatorLanguage('pt-BR'),'pt-BR');
  assert.equal(translatorLanguage('zh-TW'),'zh-Hant');assert.equal(translatorLanguage('zh-HK'),'zh-Hant');assert.equal(translatorLanguage('zh-CN'),'zh');
  assert.throws(()=>translatorLanguage('Unknown language'),e=>e.code==='LANGUAGE');
 });
 await test('Automatic source detection prefers reliable text and uses document hints for short labels',async()=>{
  assert.equal(await detectSource('Bonjour','en',detection('fr')),'fr');assert.equal(await detectSource('OK','de',detection('en',false)),'de');
  assert.equal(await detectSource('Hello','',detection('en',false)),'en');
  assert.equal(await detectSource('Hello','invalid language!',detection('en',false)),'en');
  await assert.rejects(()=>detectSource('x','',async()=>({languages:[{language:'und',percentage:100}]})),e=>e.code==='SOURCE_LANGUAGE');
 });
 await test('Native translation passes plain node text, preserves whitespace and IDs, and reuses prepared sessions',async()=>{
  const calls=[];let creates=0,destroys=0;
  const engine=new BrowserTranslator({...feature,create:async pair=>{creates++;return {translate:async(text)=>{calls.push(text);return '번역: '+text;},destroy(){destroys++;}};}});
  const input=[{id:'b1',nodes:[{id:'n0',text:'  Hello '},{id:'n1',text:'world\n'},{id:'n2',text:' 123 '}]}];
  const output=await engine.translate({blocks:input,targetLanguage:'한국어'},undefined,detection());
  assert.deepEqual(parseTranslation(output,input).b1,['  번역: Hello ','번역: world\n',' 123 ']);assert.deepEqual(calls,['Hello','world']);assert.equal(creates,1);
  await engine.translate({blocks,targetLanguage:'한국어'},undefined,detection());assert.equal(creates,1);engine.destroy();assert.equal(destroys,1);
 });
 await test('Same-language and non-linguistic blocks complete without downloading or invoking a translator',async()=>{
  let creates=0;const engine=new BrowserTranslator({...feature,create(){creates++;throw Error();}});
  assert.equal(parseTranslation(await engine.translate({blocks,targetLanguage:'en-US'},undefined,detection()),blocks).b1[0],'Hello world');
  const numbers=[{id:'b',nodes:[{id:'n',text:' 123 % '}]}];assert.equal(parseTranslation(await engine.translate({blocks:numbers,targetLanguage:'ko'}),numbers).b[0],' 123 % ');assert.equal(creates,0);
 });
 await test('Downloadable pairs wait for a user gesture, become reusable, and unsupported pairs fail without fallback',async()=>{
  let creates=0;const api={...feature,availability:async p=>p.sourceLanguage==='xx'?'unavailable':'downloadable',create:async()=>{creates++;return feature.create();}},engine=new BrowserTranslator(api);
  await assert.rejects(()=>engine.translate({blocks,targetLanguage:'ko'},undefined,detection()),e=>e.code==='LOCAL_NOT_READY');assert.equal(creates,0);assert.equal(engine.pending.size,1);
  await engine.prepare(engine.pending.values().next().value);assert.equal(engine.pending.size,0);await engine.translate({blocks,targetLanguage:'ko'},undefined,detection());assert.equal(creates,1);
  await assert.rejects(()=>engine.translate({blocks,targetLanguage:'ko'},undefined,detection('xx')),e=>e.code==='LANGUAGE');assert.equal(creates,1);engine.destroy();
 });
 await test('Cancellation rejects late native results and destroys sessions created after stopping',async()=>{
  let resolveText,destroys=0;const engine=new BrowserTranslator({...feature,create:async()=>({translate:()=>new Promise(r=>{resolveText=r;}),destroy(){destroys++;}})}),controller=new AbortController();
  const pending=engine.translate({blocks,targetLanguage:'ko'},controller.signal,detection());await tick();controller.abort();resolveText('late');await assert.rejects(()=>pending,e=>e.name==='AbortError');engine.destroy();assert.equal(destroys,1);
  let resolveCreate;const delayed=new BrowserTranslator({...feature,create:()=>new Promise(r=>{resolveCreate=r;})});const create=delayed.prepare({sourceLanguage:'en',targetLanguage:'ko'});delayed.destroy();resolveCreate({translate(){},destroy(){destroys++;}});await assert.rejects(()=>create,e=>e.name==='AbortError');assert.equal(destroys,2);
 });
 await test('Blank translations, context limits and incompatible sessions never return successful output',async()=>{
  for(const [session,code]of [[{translate:async()=>'',destroy(){}},'RESULT'],[{translate:async()=>{throw new DOMException('too long','QuotaExceededError');},destroy(){}},'CONTEXT'],[{},'LOCAL_MODEL']]){
   const engine=new BrowserTranslator({...feature,create:async()=>session});await assert.rejects(()=>engine.translate({blocks,targetLanguage:'ko'},undefined,detection()),e=>e.code===code);engine.destroy();
  }
 });
 await test('Popup and options show Translator by capability across browser identities and keep it independent of Prompt API',async()=>{
  for(const options of [false,true])for(const navigator of [undefined,{userAgent:'SamsungBrowser/30.0'},{userAgent:'Edg/150.0'},{userAgent:'Chrome/150.0'}]){
   const h=await uiHarness({options,navigator,Translator:feature});assert.equal(h.nodes.get('use-translator').hidden,false);assert.equal(h.nodes.get('use-chrome').hidden,true);
   const unsupported=await uiHarness({options,navigator});assert.equal(unsupported.nodes.get('use-translator').hidden,true);
  }
 });
 await test('Translator connection needs no credentials, keeps site permission gating, and hides unsupported instructions',async()=>{
  for(const options of [false,true])for(const uiLanguage of ['en','ko']){
   const h=await uiHarness({options,uiLanguage,Translator:feature});await h.click('use-translator');assert.equal(h.nodes.get('login').hidden,true);assert.equal(h.nodes.get('api-key-form').hidden,true);
   await h.click('open-translator');assert.ok(h.calls.includes('translator.open'));
   h.status.current={state:'connected',provider:'translator',connectionId:'translator-test'};await h.poll();
   if(!options){assert.equal(h.nodes.get('permission-card').hidden,false);await h.click('allow-site');await tick();assert.equal(h.nodes.get('edit-instructions').hidden,true);}else{assert.equal(h.nodes.get('instructions').hidden,true);assert.equal(h.nodes.get('instructions-nav').hidden,true);}
   assert.equal(h.nodes.get('account-title').textContent,catalogs[uiLanguage].translatorConnected.message);assert.equal(h.nodes.get('usage-link').hidden,true);
  }
 });
 await test('Unsupported saved Translator connections stay disconnected and target choices reflect actual pairs',async()=>{
  const unavailable=await uiHarness({provider:'translator',connected:true});assert.equal(unavailable.body.dataset.connected,'false');assert.equal(unavailable.nodes.get('open-translator').hidden,true);await unavailable.click('use-translator');assert.ok(!unavailable.calls.includes('auth.provider'));
  const h=await uiHarness({provider:'translator',Translator:{...feature,availability:async p=>p.targetLanguage==='ja'?'available':'unavailable'},connected:true,permission:true});
  assert.equal(h.nodes.get('translate').disabled,true);await h.click('language-toggle');assert.equal(h.nodes.get('language-list').children.length,1);
  h.nodes.get('target-language').value='日本語';await h.nodes.get('target-language').emit('blur');await tick();assert.equal(h.nodes.get('translate').disabled,false);
 });
 await test('Translator runner is trusted only at the exact extension URL with a tab, and duplicate runners are rejected',async()=>{
  const h=await connectionHarness();for(const sender of [{id:'other',url:'chrome-extension://test/translator.html',tab:{id:2}},{id:'test',url:'https://example.test/',tab:{id:2}},{id:'test',url:'chrome-extension://test/chrome-ai.html',tab:{id:2}},{id:'test',url:'chrome-extension://test/translator.html'}])assert.equal(runner(h,sender).disconnected,true);
  assert.equal(runner(h).disconnected,false);assert.equal(runner(h).disconnected,true);
  assert.equal((await h.send({type:'translator.open'},h.content)).ok,false);
 });
 await test('Translator worker uses a fixed engine and serial batches, logs full data, and sends no HTTP or prompts',async()=>{
  const h=await setup();await h.send({type:'settings.update',patch:{developerMode:true,instructionsEnabled:true,instructions:'STYLE_NOT_APPLICABLE'}});
  const job=await h.job();assert.equal(job.maxConcurrentBatches,1);assert.equal(job.maxBatchBlocks,1);assert.equal((await h.send({type:'models.list'})).data.items[0].id,TRANSLATOR_MODEL);
  h.port.handle=message=>{if(message.type==='translate'){assert.equal(message.instructions,undefined);h.port.onMessage.emit({type:'result',id:message.id,text:JSON.stringify({blocks:[{id:'b1',nodes:[{id:'n0',text:'안녕'}]}]})});}};
  const result=await h.send({type:'job.batch',jobId:job.id,blocks:[{...blocks[0],sourceLanguage:'en'}]},h.content);assert.equal(result.data.b1[0],'안녕');
  const logs=JSON.stringify(await h.send({type:'logs.get'}));assert.ok(logs.includes('local.request'));assert.ok(logs.includes('Hello world'));assert.ok(logs.includes('안녕'));assert.ok(!logs.includes('STYLE_NOT_APPLICABLE'));assert.equal(h.requests.length,0);
 });
 await test('Closing Translator, cancellation and provider switches reject in-flight results without cloud fallback',async()=>{
  for(const mode of ['close','cancel','switch']){
   const h=await setup(),job=await h.job(),result=h.send({type:'job.batch',jobId:job.id,blocks},h.content);await tick();
   if(mode==='close')h.port.disconnect();else if(mode==='cancel')await h.send({type:'job.cancel',jobId:job.id},h.content);else await h.send({type:'auth.provider',provider:'subscription'});
   assert.equal((await result).error.code,mode==='close'?'LOCAL_NOT_READY':'CANCELLED');assert.equal(h.requests.length,0);
  }
 });
 await test('Retryable native result failures obey the retry setting without adding LLM prompts',async()=>{
  const h=await setup();await h.send({type:'settings.update',patch:{maxRetries:1}});const job=await h.job();let attempts=0;
  h.port.handle=message=>{if(message.type==='translate'){
   assert.equal(message.instructions,undefined);attempts++;
   h.port.onMessage.emit(attempts===1?{type:'error',id:message.id,code:'RESULT'}:{type:'result',id:message.id,text:JSON.stringify({blocks:[{id:'b1',nodes:[{id:'n0',text:'안녕하세요'}]}]})});
  }};
  assert.equal((await h.send({type:'job.batch',jobId:job.id,blocks},h.content)).ok,true);assert.equal(attempts,2);assert.equal(h.requests.length,0);
 });
 await test('Page language hints are bounded and are stripped from cloud payloads',async()=>{
  const h=await connectionHarness(),job=(await h.send({type:'job.begin'},h.content)).data;
  assert.equal((await h.send({type:'job.batch',jobId:job.id,blocks:[{...blocks[0],sourceLanguage:'x'.repeat(101)}]},h.content)).error.code,'INPUT');assert.equal(h.requests.length,0);
  assert.equal((await h.send({type:'job.batch',jobId:job.id,blocks:[{...blocks[0],sourceLanguage:'en'}]},h.content)).ok,true);
  assert.ok(!h.requests.at(-1).init.body.includes('sourceLanguage'));
 });
 await test('Signing out stops only Translator while preserving stored cloud credentials and models',async()=>{
  const h=await setup();await h.send({type:'auth.signOut'});assert.ok(h.port.sent.some(x=>x.type==='stop'));assert.ok(h.local.data.auth);assert.equal((await h.send({type:'auth.status'})).data.state,'signed_out');
  await h.send({type:'auth.provider',provider:'subscription'});assert.equal((await h.send({type:'settings.get'})).data.modelId,'subscription-model');assert.equal(h.requests.length,0);
 });
 await test('Setup document calls create directly on click, reports download progress, and stops sessions',async()=>{
  let creates=0,destroys=0;const api={...feature,availability:async()=> 'downloadable',create(options){creates++;options.monitor({addEventListener(type,fn){fn({loaded:0.5});}});return Promise.resolve({translate:async x=>x,destroy(){destroys++;}});}};
  const h=await pageHarness(api);assert.equal(creates,0);h.port.onMessage.emit({type:'connected'});const prepared=h.click('prepare-local');assert.equal(creates,1);assert.equal(h.nodes.get('download-progress').value,0.5);await prepared;
  assert.ok(h.port.sent.some(x=>x.type==='ready'));assert.equal(h.nodes.get('prepare-local').hidden,true);h.click('cancel-local');assert.equal(destroys,1);assert.ok(h.port.sent.some(x=>x.type==='stopped'));
 });
 await test('A new source pair requests another explicit click and keeps the connection stable for retry',async()=>{
  let creates=0;const h=await pageHarness({...feature,availability:async()=> 'downloadable',create:async()=>{creates++;return feature.create();}});
  h.port.onMessage.emit({type:'connected'});await h.click('prepare-local');
  h.port.onMessage.emit({type:'translate',id:'new-pair',blocks,targetLanguage:'日本語'});await tick();await tick();
  assert.ok(h.port.sent.some(x=>x.type==='error'&&x.code==='LOCAL_NOT_READY'));assert.equal(h.nodes.get('prepare-local').hidden,false);assert.equal(h.nodes.get('language-pair').textContent,'en → ja');assert.equal(creates,1);
  await h.click('prepare-local');assert.equal(creates,2);h.port.onMessage.emit({type:'translate',id:'retry',blocks,targetLanguage:'日本語'});await tick();await tick();assert.ok(h.port.sent.some(x=>x.type==='result'&&x.id==='retry'));h.click('cancel-local');
 });
 return {passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
}
