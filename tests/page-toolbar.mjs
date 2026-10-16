import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {mockI18n,catalogs} from './locale-fixtures.mjs';
const source=await readFile(new URL('../extension/content.js',import.meta.url),'utf8');
const core=await readFile(new URL('../extension/document-core.js',import.meta.url),'utf8');
function element(){
 const attrs=new Map(),listeners=new Map();
 return {style:{},dataset:{},children:[],isConnected:true,hidden:false,textContent:'',disabled:false,
  setAttribute(k,v){attrs.set(k,v);},getAttribute:k=>attrs.get(k),removeAttribute:k=>attrs.delete(k),
  append(...children){this.children.push(...children);},addEventListener(type,fn){listeners.set(type,fn);},
  click(){if(!this.disabled)listeners.get('click')?.({stopPropagation(){}});}};
}
function harness(){
 const own=element(),shadow=element(),sent=[];
 const context=vm.createContext({chrome:{i18n:mockI18n('en')},own,shadow,
  document:{createElement:()=>element(),documentElement:element()},
  settings:{theme:'light'},enabled:true,starting:false,picking:false,barVisible:true,lastError:'',label:'',skipped:0,
  labelMessage:null,errorMessage:null,jobs:new Map(),selectionUI:{render(){}},paintHover(){},
  send:async type=>{sent.push(type);},error(e){throw e;},setPicking(){},stopAll(){},translatePage(){},restoreAll(){}});
 vm.runInContext(core,context);context.t=context.YTDocument.t;context.store=new context.YTDocument.SnapshotStore();
 vm.runInContext(source.slice(source.indexOf(" const style=document.createElement('style')"),source.indexOf(' const send=async'))+
  source.slice(source.indexOf(' function status(){'),source.indexOf(' function paintHover(){')),context);
 const ui=vm.runInContext('({bar,progress,progressFill,blockCount,detail,translateButton})',context);
 const blocks=Array.from({length:120},(_,i)=>context.store.register(element(),[{nodeValue:'Source '+i,isConnected:true}]));
 const tickets=blocks.map(b=>context.store.prepare(b,'model-target'));
 context.jobs.set('page-job',{});context.render();
 const complete=(from,to,same=false)=>{for(let i=from;i<to;i++)context.store.apply(tickets[i],[same?'Source '+i:'Translation '+i]);context.render();};
 return {context,ui,blocks,tickets,sent,complete};
}
export async function pageToolbarTests(){
 const results=[];async function test(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.stack||e.message});}}
 await test('Toolbar reports 16 of 120 completed blocks and exposes the same progress accessibly',()=>{
  const h=harness();h.complete(0,16);
  assert.equal(h.ui.blockCount.textContent,'16/120 Blocks');assert.equal(h.ui.blockCount.hidden,false);
  assert.equal(h.ui.progress.getAttribute('role'),'progressbar');assert.equal(h.ui.progress.getAttribute('aria-valuenow'),'16');
  assert.equal(h.ui.progress.getAttribute('aria-valuemax'),'120');assert.equal(h.ui.progress.getAttribute('aria-valuetext'),'16/120 Blocks');
  assert.equal(h.ui.progressFill.style.transform,'scaleX('+(16/120)+')');assert.equal(h.ui.translateButton.disabled,true);
  h.context.lastError='One request failed';h.context.render();assert.equal(h.ui.blockCount.textContent,'16/120 Blocks');assert.equal(h.ui.detail.textContent,'One request failed');
 });
 await test('Progress counts unchanged successful output but excludes failures, edited and detached text',()=>{
  const h=harness();h.complete(0,16);h.complete(16,17,true);
  assert.equal(h.context.status().completed,17);assert.equal(h.context.status().translated,16);
  h.context.store.fail(h.tickets[17],'Retry later');h.blocks[0].nodes[0].ref.nodeValue='Site edit';h.blocks[1].nodes[0].ref.isConnected=false;
  h.context.render();assert.equal(h.ui.blockCount.textContent,'15/119 Blocks');assert.equal(h.context.status().failed,1);
 });
 await test('Completed and restored pages update the top bar and page-translation button',async()=>{
  const h=harness();h.complete(0,120);h.context.jobs.clear();h.context.render();
  assert.equal(h.ui.blockCount.textContent,'120/120 Blocks');assert.equal(h.ui.progressFill.style.transform,'scaleX(1)');
  assert.equal(h.ui.translateButton.disabled,false);assert.equal(h.ui.translateButton.textContent,'Translate page');
  h.ui.translateButton.click();await Promise.resolve();assert.deepEqual(h.sent,['page.translate']);
  h.context.store.restoreAll();h.context.render();assert.equal(h.ui.blockCount.textContent,'0/120 Blocks');assert.equal(h.ui.progressFill.style.transform,'scaleX(0)');
  h.context.enabled=false;h.context.render();h.ui.translateButton.click();assert.equal(h.sent.length,1);
 });
 await test('Preparation is indeterminate and progress labels follow the UI language',()=>{
  const h=harness();h.context.store.blocks.clear();h.context.starting=true;h.context.render();
  assert.equal(h.ui.progress.hidden,false);assert.equal(h.ui.blockCount.hidden,true);
  assert.equal(h.ui.progress.dataset.indeterminate,'true');assert.equal(h.ui.progress.getAttribute('aria-valuenow'),undefined);
  h.context.starting=false;h.context.jobs.clear();h.context.render();assert.equal(h.ui.progress.hidden,true);
  h.context.YTDocument.setLocale({language:'ko',messages:catalogs.ko});h.context.render();
  assert.equal(h.ui.translateButton.textContent,'페이지 번역');assert.equal(h.ui.progress.getAttribute('aria-label'),'번역 진행률');
 });
 return {passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
}
