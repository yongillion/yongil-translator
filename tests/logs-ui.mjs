import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {mockI18n,localeFetch,catalogs} from './locale-fixtures.mjs';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function element(tag='div',attributes=''){
 const attrs=Object.fromEntries([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(match=>[match[1],match[2]]));
 return {tagName:tag,children:[],listeners:{},dataset:Object.fromEntries(Object.entries(attrs).filter(([key])=>key.startsWith('data-')).map(([key,value])=>[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),value])),
  textContent:'',value:attrs.value||'',checked:/\bchecked\b/.test(attributes),hidden:/\bhidden\b/.test(attributes),scrollHeight:1000,scrollTop:0,
  append(...children){for(const child of children)this.insertBefore(child,null);},
  insertBefore(child,before){child.remove?.();const index=before?this.children.indexOf(before):this.children.length;this.children.splice(index,0,child);child.parent=this;},
  remove(){if(this.parent){this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;}},
  addEventListener(name,fn){(this.listeners[name]||=[]).push(fn);},async emit(name){for(const fn of this.listeners[name]||[])await fn();},
  getAttribute:key=>attrs[key],setAttribute(key,value){attrs[key]=value;}
 };
}
async function harness(){
 const html=await readFile(new URL('../extension/logs.html',import.meta.url),'utf8'),nodes=new Map(),all=[];
 for(const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)){const node=element(match[1],match[2]);all.push(node);const id=match[2].match(/\bid="([^"]+)"/)?.[1];if(id)nodes.set(id,node);}
 const document={documentElement:{dataset:{}},getElementById:id=>nodes.get(id),createElement:tag=>element(tag),querySelectorAll:selector=>all.filter(node=>node.getAttribute(selector.slice(1,-1))!==undefined)};
 const settings={uiLanguage:'en',theme:'light'},data={enabled:true,entries:[],dropped:0};let changed,closed=0;
 const chrome={i18n:mockI18n('en'),storage:{onChanged:{addListener(fn){changed=fn;}}},runtime:{getURL:path=>'chrome-extension://test/'+path,sendMessage:async({type})=>{
  if(type==='logs.clear')data.entries=[];return {ok:true,data:type==='settings.get'?{...settings}:JSON.parse(JSON.stringify(data))};
 }}};
 const context=vm.createContext({document,chrome,window:{close(){closed++;}},fetch:localeFetch,URL}),entry=new vm.SourceTextModule(await readFile(new URL('../extension/logs.mjs',import.meta.url),'utf8'),{context});
 await entry.link(async()=>new vm.SourceTextModule(await readFile(new URL('../extension/lib/i18n.mjs',import.meta.url),'utf8'),{context}));await entry.evaluate();
 return {nodes,settings,data,get closed(){return closed;},async update(){changed({developerLogs:{newValue:data},settings:{newValue:settings}},'local');await tick();}};
}
const entry=(id,event,details={},level='info')=>({id,event,details,level,time:'2026-10-16T00:00:00Z'});
export async function logsUITests(){
 const results=[];async function test(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.stack||e.message});}}
 await test('Side panel displays saved logs, live updates and payloads as inert text',async()=>{
  const h=await harness();h.data.entries=[entry('1','http.request',{payload:{instructions:'Private instructions',input:'<script>unsafe()</script>'}})];await h.update();
  const row=h.nodes.get('log-list').children[0];row.open=true;await row.emit('toggle');assert.ok(row.parts.pre.textContent.includes('<script>unsafe()</script>'));assert.equal(row.parts.pre.children.length,0);
  h.data.entries.push(entry('2','translation.response',{text:'partial'}));await h.update();assert.equal(h.nodes.get('log-list').children.length,2);assert.equal(row.open,true);
  const response=h.nodes.get('log-list').children[1];response.open=true;await response.emit('toggle');h.data.entries[1].details.text='complete output';await h.update();assert.ok(response.parts.pre.textContent.includes('complete output'));
  assert.equal(h.nodes.get('log-list').scrollTop,1000);
 });
 await test('Search and severity filtering retain chronological order when filters are removed',async()=>{
  const h=await harness();h.data.entries=[entry('1','http.request'),entry('2','translation.error',{},'error'),entry('3','translation.retry',{},'warn')];await h.update();
  h.nodes.get('log-level').value='error';await h.nodes.get('log-level').emit('change');assert.equal(h.nodes.get('log-list').children.length,1);
  h.nodes.get('log-level').value='all';await h.nodes.get('log-level').emit('change');assert.deepEqual(h.nodes.get('log-list').children.map(row=>row.entry.id),['1','2','3']);
  h.nodes.get('log-search').value='retry';await h.nodes.get('log-search').emit('input');assert.equal(h.nodes.get('log-list').children[0].entry.id,'3');
 });
 await test('Panel preserves scroll when follow is off, clears history and updates Korean labels',async()=>{
  const h=await harness();h.nodes.get('log-follow').checked=false;h.nodes.get('log-list').scrollTop=42;
  h.data.entries=[entry('1','translation.response')];h.settings.uiLanguage='ko';h.settings.theme='dark';h.data.enabled=false;await h.update();
  assert.equal(h.nodes.get('log-list').scrollTop,42);assert.equal(h.nodes.get('recording-state').textContent,catalogs.ko.logsStopped.message);
  assert.equal(h.nodes.get('clear-logs').textContent,catalogs.ko.clearLogs.message);
  await h.nodes.get('clear-logs').emit('click');assert.equal(h.nodes.get('log-list').children.length,0);assert.equal(h.nodes.get('log-empty').hidden,false);
 });
 await test('Localized close button dismisses only the panel and preserves recording and history',async()=>{
  const h=await harness();h.data.entries=[entry('1','http.request',{text:'Keep this history'})];await h.update();
  const close=h.nodes.get('close-logs');assert.equal(close.getAttribute('aria-label'),catalogs.en.closeLogs.message);
  h.settings.uiLanguage='ko';await h.update();assert.equal(close.getAttribute('title'),catalogs.ko.closeLogs.message);
  await close.emit('click');assert.equal(h.closed,1);assert.equal(h.data.enabled,true);assert.equal(h.data.entries.length,1);
 });
 return {passed:results.filter(row=>row.passed).length,failed:results.filter(row=>!row.passed).length,results};
}
