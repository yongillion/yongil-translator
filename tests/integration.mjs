import {mockI18n,localeFetch} from './locale-fixtures.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {ReadableStream} from 'node:stream/web';
const event=()=>({listeners:[],addListener(fn){this.listeners.push(fn);}});
const storage=initial=>({data:{...initial},async get(keys){if(typeof keys==='string')return {[keys]:this.data[keys]};return Object.fromEntries((keys||Object.keys(this.data)).map(k=>[k,this.data[k]]));},async set(value){Object.assign(this.data,value);},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete this.data[key];},async setAccessLevel(options){this.access=options.accessLevel;}});
export async function integrationTests(){
 const id='testextension',url='chrome-extension://'+id+'/',local=storage({
  settings:{schemaVersion:1,targetLanguage:'한국어',modelId:'available-model',instructions:'',instructionsEnabled:false,blockShortcut:{alt:true,shift:true,ctrl:false,meta:false,code:''},cancelShortcut:{alt:false,shift:false,ctrl:false,meta:false,code:'Escape'},excludedSites:[],theme:'system',defaultLocale:'ko'},
  authEpoch:'test-connection',auth:{accessToken:'TEST_ONLY_ACCESS_TOKEN',refreshToken:'TEST_ONLY_REFRESH_TOKEN',connectionId:'test-connection',expiresAt:Date.now()+3600000,accountId:'test-account',email:'test@example.invalid'}
 }),session=storage({}),requests=[],tabMessages=[],createdTabs=[];
 const chrome={
  storage:{local,session},i18n:mockI18n(),
  runtime:{id,getURL:p=>url+p,onMessage:event(),onInstalled:event(),onStartup:event(),openOptionsPage:async()=>{}},
  tabs:{onUpdated:event(),onRemoved:event(),query:async()=>[{id:1,url:'https://example.test/'}],get:async id=>({id,url:'https://example.test/'}),
   create:async opts=>{createdTabs.push(opts);return{id:99};},update:async()=>{},remove:async()=>{},
   sendMessage:async(id,msg,frame)=>{tabMessages.push({id,msg,frame});return{translated:0,running:false,total:0};}},
  alarms:{create:async()=>{},clear:async()=>{},onAlarm:event()},
  permissions:{getAll:async()=>({origins:['https://auth.openai.com/*','https://chatgpt.com/*','https://example.test/*']}),contains:async()=>true,onAdded:event(),onRemoved:event()},
  scripting:{executeScript:async()=>[{frameId:0}],registerContentScripts:async()=>{},unregisterContentScripts:async()=>{}},
  webNavigation:{getAllFrames:async()=>[{frameId:0,url:'https://example.test/'}],onCommitted:event(),onBeforeNavigate:event()},
  action:{setBadgeText:async()=>{},setTitle:async()=>{}}
 };
 let translationGate=null;
 const fetcher=async(target,opts={})=>{
  if(target.startsWith(url+'_locales/'))return localeFetch(target);
  requests.push({target,opts});
  if(target.includes('/models?'))return{ok:true,json:async()=>({models:[{slug:'available-model',display_name:'Available model'}]})};
  if(target.endsWith('/responses')){
   if(translationGate)await translationGate(opts.signal);
   const input=JSON.parse(JSON.parse(opts.body).input[0].content[0].text);
   const text=JSON.stringify({blocks:input.blocks.map(b=>({id:b.id,nodes:b.nodes.map(n=>({id:n.id,text:'번역: '+n.text}))}))});
   const content='data: '+JSON.stringify({type:'response.completed',response:{status:'completed',output:[{content:[{type:'output_text',text}]}]}})+'\n\n';
   return{ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(content));c.close();}})};
  }
  throw new Error('Unexpected external request');
 };
 const context=vm.createContext({chrome,fetch:fetcher,crypto,URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,AbortSignal,atob,btoa,setTimeout,clearTimeout,setInterval:()=>0,clearInterval:()=>{},DOMException:class extends Error{constructor(message,name){super(message);this.name=name;}}});
 const loaded=new Map();
 function moduleAt(file){if(!loaded.has(file.href))loaded.set(file.href,readFile(file,'utf8').then(source=>new vm.SourceTextModule(source,{context,identifier:file.href})));return loaded.get(file.href);}
 const entry=await moduleAt(new URL('../extension/background.mjs',import.meta.url));await entry.link((specifier,ref)=>moduleAt(new URL(specifier,ref.identifier)));await entry.evaluate();
 const ui={id,url:url+'popup.html'},content={id,url:'https://example.test/',tab:{id:1},frameId:0,documentId:'document-one'};
 const send=(message,sender=ui)=>new Promise(resolve=>chrome.runtime.onMessage.listeners[0](message,sender,resolve));
 const cases=[];async function check(name,fn){try{await fn();cases.push({name,passed:true});}catch(e){cases.push({name,passed:false,error:e.message});}}
 await check('Credentials use trusted-context-only storage',async()=>{assert.equal(local.access,'TRUSTED_CONTEXTS');assert.equal(session.access,'TRUSTED_CONTEXTS');});
 await check('Stored legacy block shortcut is migrated once and later custom choices survive',async()=>{
  const migrated=(await send({type:'settings.get'})).data;
  assert.equal(migrated.blockShortcutDefaultVersion,3);assert.equal(local.data.settings.blockShortcut.ctrl,false);assert.equal(local.data.settings.blockShortcut.shift,false);
  const old={alt:true,shift:true,ctrl:false,meta:false,code:''};
  await send({type:'settings.update',patch:{blockShortcut:old}});
  assert.equal((await send({type:'settings.get'})).data.blockShortcut.ctrl,false);
  await send({type:'settings.update',patch:{blockShortcut:migrated.blockShortcut}});
 });
 await check('Content scripts cannot request credentials or account actions',async()=>{for(const type of ['auth.status','auth.start','auth.signOut','settings.update','models.list'])assert.equal((await send({type},content)).ok,false);});
 await check('Options tab hash anchors and query strings retain authorized UI access',async()=>{
  for(const suffix of ['', '#instructions', '?view=account#connection']){
   const r=await send({type:'auth.status'},{id,url:url+'options.html'+suffix,tab:{id:9,url:url+'options.html'},frameId:0});assert.equal(r.ok,true);
  }
 });
 await check('Options tab shares the popup account, settings, and model access',async()=>{
  const options={id,url:url+'options.html',tab:{id:9,url:url+'options.html'},frameId:0};
  const popupStatus=await send({type:'auth.status'}),optionsStatus=await send({type:'auth.status'},options);
  assert.equal(optionsStatus.ok,true);assert.equal(optionsStatus.data.state,'connected');assert.deepEqual(optionsStatus.data,popupStatus.data);
  assert.ok(!JSON.stringify(optionsStatus).includes('TEST_ONLY'));
  const saved=await send({type:'settings.update',patch:{theme:'dark'}},options);assert.equal(saved.ok,true);
  assert.equal((await send({type:'settings.get'})).data.theme,'dark');
  assert.equal((await send({type:'models.list'},options)).ok,true);assert.equal((await send({type:'settings.get'},options)).data.pageShortcut.code,'KeyT');
 });
 await check('Trusted UI URLs also require this extension sender identity',async()=>{
  for(const sender of [{url:url+'popup.html'},{id:'other-extension',url:url+'popup.html'},
   {id:'other-extension',url:url+'options.html',tab:{id:9}}])assert.equal((await send({type:'auth.status'},sender)).ok,false);
 });
 await check('Tabs and frames outside the exact UI allowlist cannot perform account actions',async()=>{
  for(const page of ['options.html/other','unlisted.html','https://example.test/options.html']){
   const sender={id,url:page.startsWith('https:')?page:url+page,tab:{id:9,url:url+'options.html'},frameId:1};
   for(const type of ['auth.status','auth.start','auth.signOut','settings.update','models.list'])assert.equal((await send({type},sender)).ok,false);
  }
 });
 await check('Public status never returns tokens',async()=>{const r=await send({type:'auth.status'});assert.equal(r.ok,true);assert.ok(!JSON.stringify(r).includes('TEST_ONLY'));});
 await check('Model list reflects the actual adapter response',async()=>{const r=await send({type:'models.list'});assert.equal(r.data.items[0].id,'available-model');});
 await check('UI language preference persists, localizes errors, and reaches content scripts',async()=>{
  const before=(await send({type:'settings.get'})).data;
  assert.equal(before.uiLanguage,'auto');
  const saved=await send({type:'settings.update',patch:{uiLanguage:'en'}});
  assert.equal(saved.data.uiLanguage,'en');assert.equal(saved.data.targetLanguage,before.targetLanguage);assert.equal(saved.data.modelId,before.modelId);
  assert.equal((await send({type:'unknown'})).error.message,'Unknown request.');
  const init=await send({type:'content.init'},content);assert.equal(init.data.locale.language,'en');assert.equal(init.data.locale.messages.restoreBlock.message,'Restore this block');
  assert.ok(tabMessages.some(x=>x.msg.type==='settings.changed'&&x.msg.locale.language==='en'));
  await send({type:'settings.update',patch:{uiLanguage:'auto'}});
  assert.equal((await send({type:'unknown'})).error.message,'알 수 없는 요청입니다.');
 });
 let job;
 await check('Translation job freezes selected language and model',async()=>{
  const result=await send({type:'job.begin'},content);assert.equal(result.ok,true);job=result.data;
  await send({type:'settings.update',patch:{targetLanguage:'日本語'}});
  const r=await send({type:'job.batch',jobId:job.id,blocks:[{id:'b',nodes:[{id:'n',text:'Hello'}]}]},content);
  assert.equal(r.ok,true);assert.equal(r.data.b[0],'번역: Hello');
  const payload=JSON.parse(requests.find(x=>x.target.endsWith('/responses')).opts.body);assert.ok(payload.instructions.includes('Target language: 한국어'));assert.equal(payload.store,false);assert.equal(payload.stream,true);
 });
 await check('Another document cannot use a translation job',async()=>{const r=await send({type:'job.batch',jobId:job.id,blocks:[{id:'b',nodes:[{id:'n',text:'x'}]}]},{...content,documentId:'other-document'});assert.equal(r.error.code,'INTERRUPTED');});
 await check('Excluded sites stop new translation requests',async()=>{await send({type:'settings.update',patch:{excludedSites:['example.test']}});const r=await send({type:'job.begin'},content);assert.equal(r.error.code,'EXCLUDED');await send({type:'settings.update',patch:{excludedSites:[]}});});
 await check('Popup selection toggles all frames together and explicit exit cancels every frame',async()=>{
  const oldFrames=chrome.webNavigation.getAllFrames,oldInject=chrome.scripting.executeScript,oldSend=chrome.tabs.sendMessage;
  const states=new Map([[0,true],[1,false]]),commands=[];
  chrome.webNavigation.getAllFrames=async()=>[0,1].map(frameId=>({frameId,url:'https://example.test/'}));
  chrome.scripting.executeScript=async()=>[0,1].map(frameId=>({frameId}));
  chrome.tabs.sendMessage=async(tabId,message,options)=>{
   if(message.type==='page.select'){commands.push(message.active);states.set(options.frameId,message.active);}
   if(message.type==='selection.cancel')for(const frameId of states.keys())states.set(frameId,false);
   return {picking:states.get(options?.frameId),translated:0,total:0,running:false};
  };
  try{
   assert.equal((await send({type:'page.select',tabId:1})).ok,true);assert.deepEqual([...states.values()],[false,false]);assert.deepEqual(commands,[false,false]);
   await send({type:'page.select',tabId:1});assert.deepEqual([...states.values()],[true,true]);
   await send({type:'selection.finished'},content);assert.deepEqual([...states.values()],[false,false]);
  }finally{chrome.webNavigation.getAllFrames=oldFrames;chrome.scripting.executeScript=oldInject;chrome.tabs.sendMessage=oldSend;}
 });
 await check('Page translation and restoration dispatch independently across all frames in the sender tab',async()=>{
  const oldFrames=chrome.webNavigation.getAllFrames,oldInject=chrome.scripting.executeScript,oldSend=chrome.tabs.sendMessage;
  const states=new Map([[0,0],[1,1]]),actions=[];
  chrome.webNavigation.getAllFrames=async()=>[0,1].map(frameId=>({frameId,url:'https://example.test/'}));
  chrome.scripting.executeScript=async()=>[0,1].map(frameId=>({frameId}));
  chrome.tabs.sendMessage=async(tabId,message,options)=>{
   if(['page.translate','page.restore'].includes(message.type)){
    actions.push({tabId,frameId:options.frameId,type:message.type});states.set(options.frameId,message.type==='page.restore'?0:1);
   }
   return {translated:states.get(options?.frameId)||0,total:2,running:false};
  };
  try{
   const before=requests.length;
   for(const type of ['page.translate','page.translate','page.restore','page.restore']){
    actions.length=0;assert.equal((await send({type,tabId:999},content)).ok,true);
    assert.deepEqual(actions.map(x=>x.type),[type,type]);assert.ok(actions.every(x=>x.tabId===content.tab.id));
    assert.deepEqual([...states.values()],type==='page.restore'?[0,0]:[1,1]);
   }
   assert.equal(requests.length,before);
  }finally{chrome.webNavigation.getAllFrames=oldFrames;chrome.scripting.executeScript=oldInject;chrome.tabs.sendMessage=oldSend;}
 });
 await check('Unauthorized documents cannot request page translation or restoration in any tab',async()=>{
  const original=chrome.permissions.contains,oldInject=chrome.scripting.executeScript;let injected=false;
  chrome.permissions.contains=async()=>false;chrome.scripting.executeScript=async()=>{injected=true;return [{frameId:0}];};
  try{
   for(const type of ['page.translate','page.restore']){
    const result=await send({type,tabId:1},{...content,tab:{id:77}});
    assert.equal(result.ok,false);assert.equal(result.error.code,'PERMISSION');assert.equal(injected,false);
   }
  }finally{chrome.permissions.contains=original;chrome.scripting.executeScript=oldInject;}
 });
 await check('Page restoration routes to documents without inference',async()=>{const before=requests.length;await send({type:'page.restore',tabId:1});assert.equal(requests.length,before);assert.ok(tabMessages.some(x=>x.msg.type==='page.restore'));});
 await check('Unapproved sites cannot activate or translate even after a prior permitted popup action',async()=>{
  await send({type:'page.activate',tabId:1});
  const oldContains=chrome.permissions.contains,oldInject=chrome.scripting.executeScript;let injected=false;
  const count=requests.length;chrome.permissions.contains=async()=>false;
  chrome.scripting.executeScript=async()=>{injected=true;return [{frameId:0}];};
  try{
   for(const type of ['page.activate','page.translate','page.select','page.retry','page.restore']){
    const denied=await send({type,tabId:1});assert.equal(denied.ok,false);assert.equal(denied.error.code,'PERMISSION');
   }
   for(const type of ['job.begin','page.restore']){
    const denied=await send({type},{...content,url:'https://example.test/after-spa'});assert.equal(denied.error.code,'PERMISSION');
   }
   const batch=await send({type:'job.batch',jobId:job.id,blocks:[{id:'b',nodes:[{id:'n',text:'Blocked'}]}]},content);
   assert.equal(batch.error.code,'PERMISSION');assert.equal(injected,false);assert.equal(requests.length,count);
  }finally{chrome.permissions.contains=oldContains;chrome.scripting.executeScript=oldInject;}
 });
 await check('A frame needs access to its own origin and the containing site before translating',async()=>{
  const oldContains=chrome.permissions.contains;
  try{
   const child={...content,frameId:1,documentId:'child',url:'https://frame.test/'};
   for(const allowedOrigin of ['https://example.test/*','https://frame.test/*']){
    chrome.permissions.contains=async({origins})=>origins[0]===allowedOrigin;
    assert.equal((await send({type:'job.begin'},child)).error.code,'PERMISSION');
   }
   chrome.permissions.contains=async()=>true;assert.equal((await send({type:'job.begin'},child)).ok,true);
  }finally{chrome.permissions.contains=oldContains;}
 });
 await check('Configured concurrency is shared across tabs and survives settings roundtrips',async()=>{
  assert.equal((await send({type:'settings.get'})).data.maxConcurrentBatches,16);
  assert.equal((await send({type:'settings.update',patch:{maxConcurrentBatches:65}})).ok,false);
  assert.equal((await send({type:'settings.update',patch:{maxConcurrentBatches:64}})).data.maxConcurrentBatches,64);
  assert.equal((await send({type:'settings.update',patch:{maxConcurrentBatches:3}})).data.maxConcurrentBatches,3);
  const second={...content,tab:{id:2},documentId:'second-document'};
  const a=await send({type:'job.begin'},content),b=await send({type:'job.begin'},second);
  assert.equal(a.data.maxConcurrentBatches,3);assert.equal(b.data.maxConcurrentBatches,3);
  const releases=[];let active=0,peak=0,completed=0;
  translationGate=()=>new Promise(resolve=>{active++;peak=Math.max(peak,active);releases.push(()=>{active--;resolve();});});
  const tasks=Array.from({length:8},(_,i)=>send({type:'job.batch',jobId:i%2?a.data.id:b.data.id,blocks:[{id:'b'+i,nodes:[{id:'n',text:'Text '+i}]}]},i%2?content:second).then(r=>{completed++;return r;}));
  try{
   await new Promise(r=>setTimeout(r,0));assert.equal(peak,3);assert.equal(releases.length,3);
   for(let n=0;n<30&&completed<8;n++){releases.splice(0).forEach(release=>release());await new Promise(r=>setTimeout(r,0));}
   assert.equal(completed,8);assert.ok((await Promise.all(tasks)).every(r=>r.ok));assert.equal(peak,3);
  }finally{translationGate=null;releases.splice(0).forEach(release=>release());}
  await send({type:'job.end',jobId:a.data.id},content);await send({type:'job.end',jobId:b.data.id},second);
 });
 await check('Logout removes tokens and invalidates pending jobs',async()=>{await send({type:'auth.signOut'});assert.equal(local.data.auth,undefined);const r=await send({type:'job.batch',jobId:job.id,blocks:[{id:'b',nodes:[{id:'n',text:'x'}]}]},content);assert.equal(r.error.code,'INTERRUPTED');assert.ok(!JSON.stringify((await send({type:'auth.status'})).data).includes('TEST_ONLY'));});
 await check('Malformed messages are rejected without external requests',async()=>{const before=requests.length;assert.equal((await send({type:'unknown'})).ok,false);assert.equal(requests.length,before);});
 return {passed:cases.filter(x=>x.passed).length,failed:cases.filter(x=>!x.passed).length,results:cases};
}
