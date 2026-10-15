import {defaults,fingerprint} from '../extension/lib/settings.mjs';
import {mockI18n,catalogs} from './locale-fixtures.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../extension/content.js',import.meta.url),'utf8');
const core=await readFile(new URL('../extension/document-core.js',import.meta.url),'utf8');
// Run the real page job and restoration functions with fake DOM references and a deferred transport.
const start=source.indexOf(' function cancelEmptyJobs('),end=source.indexOf(' function matching(');
assert.ok(start>=0&&end>start,'Content job entry points must be available');
const jobSource=source.slice(source.indexOf(' function setPicking('),source.indexOf(' const own='))+source.slice(start,end);
const tick=()=>new Promise(r=>setTimeout(r,0));
function harness(limit=8,count=80,ignoreCancel=false){
 const requests=[],jobInfo={fingerprint:fingerprint({...defaults(),modelId:'model-a'})+'|account-a',target:'Korean',maxConcurrentBatches:limit};let live=0,peak=0,sequence=0,onMessage;
 const context=vm.createContext({chrome:{i18n:mockI18n(),runtime:{id:'test',onMessage:{addListener(fn){onMessage=fn;}}}},selectionUI:{stop(){}},enabled:true,epoch:0,barVisible:false,lastError:'',starting:false,label:'',
  jobs:new Map(),cache:new Map(),render(){},status(){return {};},error(e){throw e;},setInterval:()=>0,clearInterval(){}});
 vm.runInContext(core,context);const store=new context.YTDocument.SnapshotStore();context.store=store;context.t=context.YTDocument.t;
 const originals=Array.from({length:count},(_,i)=>'Source paragraph '+i);
 const blocks=originals.map(text=>store.register({},[{nodeValue:text,isConnected:true}]));
 context.blocksFor=elements=>blocks.filter(b=>!elements||elements.includes(b.element));context.knownFor=el=>blocks.filter(b=>b.element===el);
 context.send=async(type,data)=>{
  if(type==='job.begin')return{id:'test-job-'+(++sequence),...jobInfo};
  if(type==='job.cancel'){if(ignoreCancel)return {};for(const r of requests)if(!r.settled)r.reject(Object.assign(new Error('Cancelled'),{code:'CANCELLED'}));return {};}
  if(type!=='job.batch')return {};
  live++;peak=Math.max(peak,live);
  return new Promise((resolve,reject)=>{const r={data,settled:false,
   resolve(){if(r.settled)return;r.settled=true;live--;resolve(Object.fromEntries(data.blocks.map(b=>[b.id,b.nodes.map(n=>'Translated '+n.text)])));},
   reject(e){if(r.settled)return;r.settled=true;live--;reject(e);}};requests.push(r);});
 };
 vm.runInContext(jobSource+source.slice(source.indexOf(' chrome.runtime.onMessage.addListener('),source.indexOf(' setInterval(()=>{')),context);
 const done=context.translateElements(null);
 async function finish(pending=done){for(let i=0;i<100;i++){await tick();for(const r of requests)r.resolve();await tick();if(!context.starting&&!context.jobs.size){await pending;return;}}throw Error('Translation did not finish');}
 return {context,store,blocks,originals,requests,jobInfo,done,finish,peak:()=>peak,message(type){onMessage({type},{id:'test'},()=>{});}};
}
// Exercise the real click/keyboard listeners and snapshot restoration without a browser.
function selectionHarness(){
 const listeners=new Map(),messages=[],translations=[];let onMessage;
 class Element{
  constructor(tagName='P',parentElement=null){this.tagName=tagName;this.parentElement=parentElement;this.isConnected=true;this.isContentEditable=false;}
  getBoundingClientRect(){return {left:20,top:100,right:220,width:200,height:40};}
  contains(el){for(let p=el;p;p=p.parentElement)if(p===this)return true;return false;}
  matches(){return ['INPUT','TEXTAREA','SELECT'].includes(this.tagName);}
  closest(){for(let p=this;p;p=p.parentElement)if(p.matches()||p.isContentEditable)return p;return null;}
 }
 const html=new Element('HTML'),body=new Element('BODY',html),own=new Element('DIV',html);
 const context=vm.createContext({chrome:{i18n:mockI18n(),runtime:{id:'test',onMessage:{addListener(fn){onMessage=fn;}}}},selectionUI:{stop(){}},Element,own,enabled:true,held:false,picking:false,hover:null,selected:null,
  settings:defaults(),jobs:new Map(),cache:new Map(),
  addEventListener(type,listener){listeners.set('window:'+type,listener);},
  document:{body,documentElement:html,addEventListener(type,listener){listeners.set(type,listener);}},
  getComputedStyle:el=>({display:el.tagName==='SPAN'?'inline':'block',visibility:'visible',opacity:'1'}),paintHover(){},render(){},error(e){throw e;},
  send:async(type)=>{messages.push(type);return {};},setInterval:()=>0,clearInterval(){}});
 vm.runInContext(core,context);const store=new context.YTDocument.SnapshotStore();context.store=store;context.t=context.YTDocument.t;
 const targets=['First','Second'].map(text=>{const element=new Element('P',body),child=new Element('SPAN',element);
  const block=store.register(element,[{nodeValue:text,isConnected:true}]);
  store.apply(store.prepare(block,'test'),['Translated '+text]);return {element,child,block,original:text};});
 vm.runInContext(source.slice(source.indexOf(' function isOwn('),source.indexOf(' function scan('))+
  source.slice(source.indexOf(' function knownFor('),source.indexOf(' function status('))+jobSource+
  source.slice(end,source.indexOf(' setInterval(()=>{')),context);
 context.status=()=>({picking:context.picking});
 context.translateElements=async(elements,failedOnly=false)=>translations.push({elements,failedOnly});
 function event(type,target,flags={}){
  const e={button:0,altKey:false,shiftKey:false,ctrlKey:false,metaKey:false,code:'',target,
   composedPath:()=>[target,context.document],preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...flags};
  listeners.get(type)(e);return e;
 }
 return {context,store,targets,messages,translations,event,own,Element,message(type,data={}){let reply;onMessage({type,...data},{id:'test'},value=>{reply=value;});return reply;}};
}
export async function contentJobTests(){
 const results=[];async function test(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.stack||e.message});}}
 await test('Page dispatch fills eight slots and applies completed batches out of order',async()=>{
  const h=harness();await tick();assert.equal(h.requests.length,8);assert.equal(h.peak(),8);
  h.requests[3].resolve();await tick();assert.equal(h.requests.length,9);
  assert.ok(h.blocks[24].nodes[0].ref.nodeValue.startsWith('Translated'));assert.equal(h.blocks[0].nodes[0].ref.nodeValue,h.originals[0]);
  await h.finish();assert.equal(h.requests.length,10);assert.equal(h.peak(),8);assert.equal(h.store.translatedCount(),80);
 });
 await test('Page dispatch honors configured limits of one, four, and sixteen',async()=>{
  for(const limit of [1,4,16]){const h=harness(limit,136);await tick();assert.equal(h.requests.length,limit);await h.finish();assert.equal(h.peak(),limit);assert.equal(h.store.translatedCount(),136);}
 });
 await test('Restored individual blocks reuse successful results without another inference request',async()=>{
  const h=harness(8,2);await h.finish();const originalRequests=h.requests.length;
  const [first,second]=h.blocks,translated=first.nodes[0].ref.nodeValue;
  for(let i=0;i<3;i++){
   h.context.restoreElement(first.element);assert.equal(first.nodes[0].ref.nodeValue,h.originals[0]);
   await h.finish(h.context.translateElements([first.element]));
   assert.equal(first.nodes[0].ref.nodeValue,translated);assert.equal(h.requests.length,originalRequests);
   assert.equal(second.nodes[0].ref.nodeValue,'Translated '+h.originals[1]);
  }
 });
 await test('Page restoration preserves every cached block on pages larger than 200 blocks',async()=>{
  const h=harness(8,240);await h.finish();const originalRequests=h.requests.length;
  h.context.restoreAll();assert.equal(h.store.translatedCount(),0);
  await h.finish(h.context.translatePage());assert.equal(h.store.translatedCount(),240);
  assert.equal(h.requests.length,originalRequests);
  h.blocks.forEach((b,i)=>assert.equal(b.nodes[0].ref.nodeValue,'Translated '+h.originals[i]));
 });
 await test('Mixed cached and edited blocks send only the changed original text for translation',async()=>{
  const h=harness(8,3);await h.finish();h.context.restoreAll();
  h.blocks[1].nodes[0].ref.nodeValue='New text from the website';
  const pending=h.context.translatePage();await tick();
  assert.equal(h.requests.length,2);assert.equal(h.requests[1].data.blocks.length,1);
  assert.equal(h.requests[1].data.blocks[0].id,h.blocks[1].id);
  assert.equal(h.requests[1].data.blocks[0].nodes[0].text,'New text from the website');
  assert.equal(h.store.translatedCount(),2);
  await h.finish(pending);assert.equal(h.blocks[1].nodes[0].ref.nodeValue,'Translated New text from the website');
  h.context.restoreAll();assert.equal(h.blocks[1].nodes[0].ref.nodeValue,'New text from the website');
 });
 await test('Changed target, model, enabled instructions, and account require distinct cached results',async()=>{
  const h=harness(8,1);await h.finish();const initialFingerprint=h.jobInfo.fingerprint;
  const base={...defaults(),modelId:'model-a'},variants=[
   [{...base,targetLanguage:'Japanese'},'account-a'],
   [{...base,modelId:'model-b'},'account-a'],
   [{...base,instructionsEnabled:true,instructions:'Use formal language'},'account-a'],
   [{...base,instructionsEnabled:true,instructions:'Use informal language'},'account-a'],
   [base,'account-b']
  ];
  for(const [settings,account] of variants){
   h.context.restoreAll();h.jobInfo.fingerprint=fingerprint(settings)+'|'+account;
   const requestCount=h.requests.length;await h.finish(h.context.translatePage());
   assert.equal(h.requests.length,requestCount+1);assert.equal(h.store.translatedCount(),1);
  }
  h.context.restoreAll();h.jobInfo.fingerprint=initialFingerprint;
  const requestCount=h.requests.length;await h.finish(h.context.translatePage());assert.equal(h.requests.length,requestCount);
 });
 await test('A new document starts with a cold cache even when original text and settings match',async()=>{
  const previous=harness(8,2);await previous.finish();previous.context.restoreAll();
  await previous.finish(previous.context.translatePage());assert.equal(previous.requests.length,1);
  const reloaded=harness(8,2);await tick();assert.equal(reloaded.requests.length,1);assert.equal(reloaded.store.translatedCount(),0);
  assert.equal(reloaded.jobInfo.fingerprint,previous.jobInfo.fingerprint);assert.deepEqual(reloaded.originals,previous.originals);
  await reloaded.finish();assert.equal(reloaded.store.translatedCount(),2);
 });
 await test('Clearing the document cache preserves restoration but requires a new translation',async()=>{
  const h=harness(8,1);await h.finish();h.message('cache.clear');
  assert.equal(h.store.translatedCount(),1);h.context.restoreAll();assert.equal(h.blocks[0].nodes[0].ref.nodeValue,h.originals[0]);
  await h.finish(h.context.translatePage());assert.equal(h.requests.length,2);assert.equal(h.store.translatedCount(),1);
 });
 await test('Page restoration rejects every late parallel result',async()=>{
  const h=harness(8,80,true);await tick();h.context.restoreAll();await h.finish();
  assert.equal(h.requests.length,8);assert.equal(h.store.translatedCount(),0);assert.equal(h.context.cache.size,0);
  h.blocks.forEach((b,i)=>assert.equal(b.nodes[0].ref.nodeValue,h.originals[i]));
 });
 await test('Restoring one inflight block preserves the other parallel results',async()=>{
  const h=harness();await tick();h.context.restoreElement(h.blocks[2].element);await h.finish();
  assert.equal(h.blocks[2].nodes[0].ref.nodeValue,h.originals[2]);assert.equal(h.store.translatedCount(),79);
 });
 await test('Stop preserves applied translations and invalidates the remaining requests',async()=>{
  const h=harness();await tick();h.requests[0].resolve();await tick();h.context.stopAll();await h.finish();
  assert.equal(h.store.translatedCount(),8);assert.equal(h.requests.length,9);
 });
 await test('Usage limits halt every worker and leave unfinished blocks retryable',async()=>{
  const h=harness();await tick();h.requests[0].reject(Object.assign(new Error('Usage limit'),{code:'USAGE_LIMIT'}));await h.finish();
  assert.equal(h.requests.length,8);assert.equal(h.store.translatedCount(),0);assert.equal(h.context.lastError,'Usage limit');
  assert.ok(h.blocks.every(b=>b.state==='failed'));
 });
 await test('A failed batch does not prevent other workers from finishing',async()=>{
  const h=harness();await tick();h.requests[0].reject(Object.assign(new Error('Temporary error'),{code:'NETWORK'}));await h.finish();
  assert.equal(h.store.translatedCount(),72);assert.equal(h.blocks.filter(b=>b.state==='failed').length,8);assert.equal(h.context.cache.size,72);
  await h.finish(h.context.translatePage(true));assert.equal(h.store.translatedCount(),80);assert.equal(h.requests.length,11);
 });
 await test('Ctrl+Alt+T requests one page toggle per press without activating block selection',()=>{
  const h=selectionHarness(),first=h.targets[0],keys={ctrlKey:true,altKey:true,code:'KeyT'};
  const press=h.event('keydown',first.element,keys);assert.ok(press.prevented&&press.stopped);
  assert.deepEqual(h.messages,['page.toggle']);assert.equal(h.context.held,false);
  h.event('keydown',first.element,{...keys,repeat:true});assert.equal(h.messages.length,1);
  h.event('keyup',first.element);h.event('keydown',first.element,keys);assert.equal(h.messages.length,2);
 });
 await test('Page shortcuts honor customization, disabled keys, editor focus, composition, and own UI',()=>{
  const h=selectionHarness(),first=h.targets[0],keys={ctrlKey:true,altKey:true,code:'KeyT'};
  for(const [target,extra] of [[new h.Element('INPUT',first.element),{}],[h.own,{}],[first.element,{isComposing:true}]])
   assert.equal(h.event('keydown',target,{...keys,...extra}).prevented,undefined);
  h.context.settings.pageShortcut=null;h.event('keydown',first.element,keys);assert.deepEqual(h.messages,[]);
  h.context.settings.pageShortcut={alt:false,ctrl:true,shift:true,meta:false,code:'KeyY'};
  h.event('keydown',first.element,keys);assert.deepEqual(h.messages,[]);
  h.event('keydown',first.element,{ctrlKey:true,shiftKey:true,code:'KeyY'});assert.deepEqual(h.messages,['page.toggle']);
  h.context.enabled=false;h.event('keydown',first.element,{ctrlKey:true,shiftKey:true,code:'KeyY'});assert.equal(h.messages.length,1);
 });
 await test('Ctrl+Alt click restores the clicked block without prior hover or keydown',()=>{
  const h=selectionHarness(),[first,second]=h.targets;
  const click=h.event('click',first.child,{altKey:true,ctrlKey:true});
  assert.equal(first.block.nodes[0].ref.nodeValue,first.original);assert.equal(h.store.translatedCount(),1);
  assert.ok(click.prevented&&click.stopped);assert.equal(second.block.nodes[0].ref.nodeValue,'Translated '+second.original);
  assert.equal(h.translations.length,0);assert.deepEqual(h.messages,[]);
  h.event('click',first.element,{altKey:true,ctrlKey:true});
  assert.equal(h.translations.length,1);assert.equal(h.translations[0].elements[0],first.element);assert.equal(h.translations[0].failedOnly,false);
 });
 await test('Block selection restores the clicked block even when hover points elsewhere',()=>{
  const h=selectionHarness(),[first,second]=h.targets;
  h.message('page.select',{active:true});h.context.hover=second.element;
  h.event('click',first.element);
  assert.equal(first.block.nodes[0].ref.nodeValue,first.original);assert.equal(h.store.translatedCount(),1);
  assert.equal(h.context.picking,true);assert.deepEqual(h.messages,[]);assert.equal(h.translations.length,0);
  h.event('click',second.element);assert.equal(h.store.translatedCount(),0);
  h.event('click',first.element);assert.equal(h.context.picking,true);
  assert.equal(h.translations.length,1);assert.equal(h.translations[0].elements[0],first.element);assert.equal(h.translations[0].failedOnly,false);
  h.event('keydown',first.element,{code:'Escape'});assert.equal(h.context.picking,false);assert.deepEqual(h.messages,['selection.finished']);
  assert.equal(h.event('click',second.element).prevented,undefined);
 });
 await test('Block clicks honor customized modifier and keyed shortcuts',()=>{
  const h=selectionHarness(),[first,second]=h.targets;
  h.context.settings.blockShortcut={alt:false,shift:true,ctrl:true,meta:false,code:''};
  assert.equal(h.event('click',first.element,{altKey:true,ctrlKey:true}).prevented,undefined);
  h.event('click',first.element,{ctrlKey:true,shiftKey:true});assert.equal(first.block.nodes[0].ref.nodeValue,first.original);
  h.context.settings.blockShortcut.code='KeyB';
  assert.equal(h.event('click',second.element,{ctrlKey:true,shiftKey:true}).prevented,undefined);
  h.event('keydown',second.element,{ctrlKey:true,shiftKey:true,code:'KeyB'});
  assert.equal(h.event('click',second.element).prevented,undefined);
  h.event('click',second.element,{ctrlKey:true,shiftKey:true});assert.equal(second.block.nodes[0].ref.nodeValue,second.original);
 });
 await test('Ordinary clicks, editable fields, own UI, and disabled shortcuts do not restore blocks',()=>{
  const h=selectionHarness(),first=h.targets[0],modifiers={altKey:true,ctrlKey:true};
  h.context.hover=first.element;
  for(const [target,flags] of [[first.element,{}],[first.element,{...modifiers,button:1}],
   [new h.Element('INPUT',first.element),modifiers],[h.own,modifiers]])assert.equal(h.event('click',target,flags).prevented,undefined);
  h.context.settings.blockShortcut=null;h.context.held=true;assert.equal(h.event('click',first.element,modifiers).prevented,undefined);
  h.context.enabled=false;h.context.picking=true;assert.equal(h.event('click',first.element).prevented,undefined);
  assert.equal(h.store.translatedCount(),2);assert.equal(h.translations.length,0);
 });
 await test('Ordinary hover stays silent and selection modes alone show the action hint',()=>{
  const h=selectionHarness(),first=h.targets[0];
  h.context.outline={style:{}};h.context.hint={style:{}};h.context.innerWidth=1000;
  vm.runInContext(source.slice(source.indexOf(' function paintHover(){'),source.indexOf(' function error(e)')),h.context);
  h.event('pointermove',first.element);assert.equal(h.context.outline.hidden,true);assert.equal(h.context.hint.hidden,true);
  h.event('keydown',first.element,{altKey:true,ctrlKey:true,code:'ControlLeft'});
  assert.equal(h.context.outline.hidden,false);assert.equal(h.context.hint.textContent,'클릭하여 이 블록 원문 복원');
  h.event('keyup',first.element);assert.equal(h.context.hint.hidden,true);
  h.context.picking=true;h.context.paintHover();assert.equal(h.context.hint.hidden,false);
  h.event('click',first.element);h.context.paintHover();assert.equal(h.context.hint.hidden,false);
  assert.equal(h.context.hint.textContent,'클릭하여 이 블록 번역');
  h.event('keydown',first.element,{code:'Escape'});h.context.paintHover();assert.equal(h.context.hint.hidden,true);
 });
 await test('Persistent selection survives key release and frame focus, with explicit coordinated exits',()=>{
  const h=selectionHarness(),first=h.targets[0];
  assert.equal(h.message('page.select',{active:true}).picking,true);
  h.event('keyup',first.element);h.event('window:blur',first.element);assert.equal(h.context.picking,true);
  assert.equal(h.message('page.select',{active:false}).picking,false);assert.deepEqual(h.messages,[]);
  h.context.setPicking(true);h.context.setPicking(false);assert.deepEqual(h.messages,['selection.finished']);
  h.message('page.select',{active:true});h.context.document.hidden=true;h.event('visibilitychange',first.element);
  assert.equal(h.context.picking,false);assert.equal(h.messages.length,2);
  h.message('page.select',{active:true});h.message('selection.cancel');assert.equal(h.context.picking,false);assert.equal(h.messages.length,2);
  h.message('page.select',{active:true});h.event('keydown',h.own,{code:'Escape'});assert.equal(h.context.picking,false);assert.equal(h.messages.length,3);
 });
 return {passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
}
