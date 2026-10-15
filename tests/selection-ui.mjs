import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {mockI18n,catalogs} from './locale-fixtures.mjs';
const source=await readFile(new URL('../extension/selection-ui.js',import.meta.url),'utf8');
const core=await readFile(new URL('../extension/document-core.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function element(tag='div'){
 const handlers=new Map(),attrs=new Map(),captured=new Set();
 return {nodeType:1,tagName:tag.toUpperCase(),style:{},children:[],hidden:false,textContent:'',className:'',
  append(...items){this.children.push(...items);},setAttribute(k,v){attrs.set(k,v);},getAttribute:k=>attrs.get(k),
  addEventListener(k,fn){if(!handlers.has(k))handlers.set(k,[]);handlers.get(k).push(fn);},
  emit(k,event={}){const e={button:0,pointerId:1,clientX:40,clientY:60,altKey:false,ctrlKey:false,metaKey:false,composedPath:()=>[this],preventDefault(){this.prevented=true;},stopPropagation(){},...event};for(const fn of handlers.get(k)||[])fn(e);return e;},
  closest(){return this.protected?this:null;},querySelectorAll(){return this.editors||[];},focus(){this.focused=true;},
  setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id),
  getBoundingClientRect(){const left=parseFloat(this.style.left)||20,top=parseFloat(this.style.top)||50,width=parseFloat(this.style.width)||(this.className==='selection-trigger'?160:420),height=parseFloat(this.style.height)||(this.className==='selection-trigger'?36:280);return {left,top,width,height,right:left+width,bottom:top+height};}};
}
function harness(){
 const document=element(),surface=element(),own=element(),page=element('p'),shadow=element(),calls=[],pending=[];
 page.textContent='Original page text';let selection=null,enabled=true,count=0,beginGate=null;
 document.createElement=tag=>element(tag);
 const send=async(type,data={})=>{
  calls.push({type,data});
  if(type==='job.begin'){if(beginGate)await beginGate;return {id:'selection-'+(++count)};}
  if(type==='job.batch')return new Promise((resolve,reject)=>pending.push({data,resolve,reject}));return {};
 };
 const context=vm.createContext({document,chrome:{i18n:mockI18n('en')},window:{getSelection:()=>selection},innerWidth:1000,innerHeight:800,
  addEventListener:surface.addEventListener.bind(surface),setInterval:()=>1,clearInterval(){}});
 vm.runInContext(core,context);vm.runInContext(source,context);
 const ui=context.YTSelection({shadow,own,send,isEnabled:()=>enabled});
 const trigger=shadow.children.find(el=>el.className==='selection-trigger'),dialog=shadow.children.find(el=>el.className==='selection-dialog');
 const [heading,output,note]=dialog.children,[title,close]=heading.children;
 function select(text='Hello',flags={}){
  const range={commonAncestorContainer:page,getBoundingClientRect:()=>page.getBoundingClientRect(),intersectsNode:()=>true};
  selection={isCollapsed:false,rangeCount:1,anchorNode:page,focusNode:page,toString:()=>text,getRangeAt:()=>range};
  document.emit('pointerup',{composedPath:()=>[page],...flags});
 }
 return {ui,context,document,surface,shadow,own,page,trigger,dialog,heading,output,title,note,close,calls,pending,select,
  setEnabled(value){enabled=value;},gateBegin(value){beginGate=value;},collapse(){selection={isCollapsed:true};document.emit('selectionchange');}};
}
export async function selectionUITests(){
 const results=[];async function test(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.stack||e.message});}}
 await test('Selecting text shows a button and only an explicit click requests translation',async()=>{
  const h=harness();assert.equal(h.trigger.hidden,true);h.select('Hello world');assert.equal(h.trigger.hidden,false);assert.equal(h.dialog.hidden,true);assert.equal(h.calls.length,0);
  h.trigger.emit('click');await tick();assert.equal(h.dialog.hidden,false);assert.equal(h.output.textContent,'Translating');
  assert.equal(h.pending[0].data.blocks[0].nodes[0].text,'Hello world');assert.equal(h.page.textContent,'Original page text');
  h.pending[0].resolve({selection:['<b>Translated text</b>']});await tick();assert.equal(h.output.textContent,'<b>Translated text</b>');assert.equal(h.output.innerHTML,undefined);
  assert.equal(h.output.getAttribute('aria-busy'),'false');assert.ok(h.calls.some(c=>c.type==='job.end'));
 });
 await test('Closing or replacing a selection rejects late results and cancels only its job',async()=>{
  const h=harness();h.select();h.trigger.emit('click');await tick();h.close.emit('click');assert.equal(h.dialog.hidden,true);
  assert.ok(h.calls.some(c=>c.type==='job.cancel'&&c.data.jobId==='selection-1'));h.pending[0].resolve({selection:['Late']});await tick();assert.notEqual(h.output.textContent,'Late');
  h.select('Second');h.trigger.emit('click');await tick();h.select('Third');h.trigger.emit('click');await tick();
  h.pending[2].resolve({selection:['Newest']});await tick();h.pending[1].resolve({selection:['Stale']});await tick();assert.equal(h.output.textContent,'Newest');
 });
 await test('Closing while a job starts cancels the late job before sending selected text',async()=>{
  const h=harness();let release;h.gateBegin(new Promise(resolve=>{release=resolve;}));h.select();h.trigger.emit('click');h.close.emit('click');release();await tick();
  assert.equal(h.pending.length,0);assert.ok(h.calls.some(c=>c.type==='job.cancel'));assert.equal(h.dialog.hidden,true);
 });
 await test('Dragging, viewport changes, resizing support, and Escape keep the popup usable',async()=>{
  const h=harness();h.select();h.trigger.emit('click');await tick();
  h.heading.emit('pointerdown',{clientX:30,clientY:60});h.heading.emit('pointermove',{clientX:300,clientY:250});h.heading.emit('pointerup');
  assert.ok(parseFloat(h.dialog.style.left)>20);assert.ok(parseFloat(h.dialog.style.top)>50);
  h.dialog.style.width='700px';h.dialog.style.height='500px';h.dialog.style.left='900px';h.dialog.style.top='790px';h.surface.emit('resize');
  assert.equal(h.dialog.style.left,'292px');assert.equal(h.dialog.style.top,'292px');assert.ok(h.shadow.children[0].textContent.includes('resize:both'));
  h.dialog.emit('keydown',{key:'Escape'});assert.equal(h.dialog.hidden,true);h.pending[0].resolve({selection:['Late']});await tick();
 });
 await test('Editors, disabled selection, empty text, and oversized selections never send text',async()=>{
  const h=harness();h.page.protected=true;h.select();assert.equal(h.trigger.hidden,true);h.page.protected=false;
  h.page.editors=[element('textarea')];h.select();assert.equal(h.trigger.hidden,true);h.page.editors=[];
  h.select();h.setEnabled(false);h.trigger.emit('click');h.ui.render();assert.equal(h.calls.length,0);assert.equal(h.trigger.hidden,true);
  h.select();assert.equal(h.trigger.hidden,true);h.setEnabled(true);h.select('  ');assert.equal(h.trigger.hidden,true);
  h.select('Hello',{altKey:true});assert.equal(h.trigger.hidden,true);h.select('x'.repeat(16001));h.trigger.emit('click');await tick();
  assert.equal(h.calls.length,0);assert.match(h.output.textContent,/16,000/);
  h.select();h.collapse();assert.equal(h.trigger.hidden,true);
 });
 await test('Popup errors and controls follow UI language changes, and stop ignores late responses',async()=>{
  const h=harness();h.select();h.trigger.emit('click');await tick();h.pending[0].reject({messageKey:'authRequired'});await tick();assert.equal(h.output.textContent,'Connect your ChatGPT account first.');
  h.context.YTDocument.setLocale({language:'ko',messages:catalogs.ko});h.ui.render();assert.equal(h.title.textContent,'선택 영역 번역');assert.equal(h.output.textContent,'먼저 ChatGPT 계정을 연결하세요.');
  h.select();h.trigger.emit('click');await tick();h.ui.stop();assert.equal(h.output.textContent,'번역을 중지했습니다');h.pending[1].resolve({selection:['Late']});await tick();assert.equal(h.output.textContent,'번역을 중지했습니다');
 });
 return {passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
}
