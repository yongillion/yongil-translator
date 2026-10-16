import {mockI18n,localeFetch,catalogs} from './locale-fixtures.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {Blob} from 'node:buffer';
const source=await readFile(new URL('../extension/ui.mjs',import.meta.url),'utf8');
const settingsSource=await readFile(new URL('../extension/lib/settings.mjs',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
function element(tag='div',attributes=''){
 const attrs=Object.fromEntries([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
 const classes=new Set((attributes.match(/class="([^"]*)"/)?.[1]||'').split(' '));
 return {tagName:tag.toUpperCase(),hidden:/\bhidden(?:\s|$)/.test(attributes),disabled:false,value:'',textContent:'',children:[],listeners:{},dataset:Object.fromEntries(Object.entries(attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v])),
  classList:{contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}},
  addEventListener(name,fn){(this.listeners[name]||=[]).push(fn);},async emit(name,event={}){for(const fn of this.listeners[name]||[])await fn(event);},
  append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},
  getAttribute(name){return attrs[name];},setAttribute(name,value){attrs[name]=value;},removeAttribute(name){delete attrs[name];},scrollIntoView(){},focus(){},click(){}};
}
async function harness({options=false,connected=false,permission=false,url='https://example.test/',browserLanguage='ko',uiLanguage='auto',modelId='test-model',items=[{id:'test-model',name:'Test model'}]}={}){
 const html=await readFile(new URL('../extension/'+(options?'options':'popup')+'.html',import.meta.url),'utf8');
 const nodes=new Map(),gates=[],all=[];
 for(const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)){
  const el=element(match[1],match[2]),id=match[2].match(/\bid="([^"]+)"/)?.[1];if(id)nodes.set(id,el);all.push(el);
  if(/\bdata-connected-only\b/.test(match[2]))gates.push(el);
 }
 assert.ok(gates.length>0&&gates.every(el=>el.hidden),'Protected UI must start hidden in HTML');
 const status={current:connected?{state:'connected',connectionId:'test-account',email:'user@example.invalid'}:{state:'disconnected'}};
 const grants={allowed:permission,result:true,pending:null,requestPending:null};const calls=[];let poll;
 const savedSettings={schemaVersion:1,uiLanguage,targetLanguage:'한국어',modelId,instructions:'',instructionsEnabled:false,maxConcurrentBatches:8,excludedSites:[],theme:'system',defaultLocale:'ko',pageShortcut:{alt:true,ctrl:true,shift:false,meta:false,code:'KeyT'},blockShortcut:null,cancelShortcut:null};
 const event=()=>({listeners:[],addListener(fn){this.listeners.push(fn);},emit(...args){for(const fn of this.listeners)fn(...args);}});
 const body=element('body','class="'+(options?'options':'popup')+'"');body.dataset.connected='false';
 const document={body,documentElement:{dataset:{}},hidden:false,getElementById:id=>nodes.get(id)||null,
  querySelectorAll:selector=>selector==='[data-connected-only]'?gates:all.filter(el=>el.getAttribute(selector.slice(1,-1))!==undefined),createElement:tag=>element(tag)};
 const chrome={i18n:mockI18n(browserLanguage),storage:{onChanged:event()},runtime:{getURL:p=>'chrome-extension://test/'+p,sendMessage:async message=>{
  calls.push(message.type);let data={};
  if(message.type==='settings.get')data={...savedSettings};
  if(message.type==='settings.update'){Object.assign(savedSettings,message.patch);data={...savedSettings};}
  if(message.type==='auth.status')data={...status.current};
  if(message.type==='auth.start')status.current={state:'signing_in'};
  if(message.type==='auth.cancel'||message.type==='auth.signOut')status.current={state:'disconnected'};
  if(message.type==='models.list')data={items};
  if(message.type==='page.status')data={total:0,running:false,frames:[]};
  return {ok:true,data};}},tabs:{query:async()=>[{id:1,url}],create:async()=>{}},
  permissions:{onAdded:event(),onRemoved:event(),getAll:async()=>({origins:grants.allowed?['https://example.test/*']:[]}),
   contains:async()=>grants.pending?await grants.pending:grants.allowed,
   request:async()=>{const result=grants.requestPending?await grants.requestPending:grants.result;if(result)grants.allowed=true;return result;},remove:async()=>{grants.allowed=false;return true;}}};
 const context=vm.createContext({document,chrome,fetch:localeFetch,URL,Blob,Option:class{constructor(text,value){Object.assign(this,element('option'),{textContent:text,value});}},window:{close(){}},setInterval:fn=>{poll=fn;return 0;},setTimeout,clearTimeout,confirm:()=>true});
 const entry=new vm.SourceTextModule(source,{context,identifier:'ui.mjs'});
 const modules=new Map();
 const icons=new vm.SyntheticModule(['paintIcons'],function(){this.setExport('paintIcons',()=>{});},{context});
 await entry.link(async specifier=>{
  if(specifier==='./icons.mjs')return icons;
  const name=specifier.split('/').pop();
  if(!modules.has(name))modules.set(name,readFile(new URL('../extension/lib/'+name,import.meta.url),'utf8').then(source=>new vm.SourceTextModule(source,{context,identifier:name})));
  return modules.get(name);
 });await entry.evaluate();
 return {nodes,gates,status,grants,calls,body,chrome,savedSettings,document,all,poll:()=>poll(),click:id=>nodes.get(id).emit('click')};
}
export async function uiStateTests(){
 const results=[];async function test(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.stack||e.message});}}
 await test('Signed-out popup and options hide connected-only controls',async()=>{
  for(const options of [false,true]){const h=await harness({options});assert.ok(h.gates.every(el=>el.hidden));assert.equal(h.nodes.get('login').hidden,false);assert.equal(h.body.dataset.connected,'false');assert.ok(!h.calls.includes('models.list'));if(!options)assert.equal(h.nodes.get('permission-card').hidden,true);}
 });
 await test('Signing in keeps controls hidden until authentication completes',async()=>{
  const h=await harness();await h.click('login');assert.ok(h.gates.every(el=>el.hidden));assert.equal(h.nodes.get('cancel-login').hidden,false);
  h.status.current={state:'connected',connectionId:'test-account',email:'user@example.invalid'};await h.poll();
  assert.ok(h.gates.every(el=>el.hidden));assert.equal(h.nodes.get('permission-card').hidden,false);assert.equal(h.nodes.get('account-card').hidden,true);assert.ok(!h.calls.includes('models.list'));
  assert.equal(h.nodes.get('open-options').hidden,false);assert.ok(h.all.some(el=>el.classList.contains('brand')&&!el.hidden));
 });
 await test('First model load selects and saves the first available model in popup and options',async()=>{
  for(const options of [false,true]){
   const h=await harness({options,connected:true,permission:true,modelId:'',items:[{id:'first-model',name:'First model'},{id:'second-model',name:'Second model'}]});
   assert.equal(h.nodes.get('model').value,'first-model');assert.equal(h.savedSettings.modelId,'first-model');
   assert.equal(h.calls.filter(type=>type==='settings.update').length,1);
   if(!options)assert.equal(h.nodes.get('translate').disabled,false);
   await h.click('refresh-models');assert.equal(h.calls.filter(type=>type==='settings.update').length,1);
  }
 });
 await test('Saved model choices are preserved even when absent from a refreshed list',async()=>{
  for(const modelId of ['second-model','previous-model']){
   const h=await harness({connected:true,permission:true,modelId,items:[{id:'first-model',name:'First model'},{id:'second-model',name:'Second model'}]});
   assert.equal(h.nodes.get('model').value,modelId);assert.equal(h.savedSettings.modelId,modelId);assert.ok(!h.calls.includes('settings.update'));
  }
 });
 await test('Empty model lists do not create a model selection',async()=>{
  const h=await harness({connected:true,permission:true,modelId:'',items:[]});assert.equal(h.savedSettings.modelId,'');assert.ok(!h.calls.includes('settings.update'));assert.equal(h.nodes.get('translate').disabled,true);
 });
 await test('Granted site access stays hidden through account polling',async()=>{
  const h=await harness({connected:true,permission:true});assert.equal(h.nodes.get('permission-card').hidden,true);await h.poll();assert.equal(h.nodes.get('permission-card').hidden,true);
 });
 await test('Granting access hides the card and revoking it shows the card again',async()=>{
  const h=await harness({connected:true});assert.equal(h.nodes.get('permission-card').hidden,false);await h.click('allow-site');await tick();assert.equal(h.nodes.get('permission-card').hidden,true);assert.ok(h.gates.every(el=>!el.hidden));assert.equal(h.nodes.get('account-card').hidden,false);assert.ok(h.calls.includes('page.activate'));assert.ok(h.calls.includes('models.list'));
  h.grants.allowed=false;h.chrome.permissions.onRemoved.emit();await tick();assert.equal(h.nodes.get('permission-card').hidden,false);assert.ok(h.gates.every(el=>el.hidden));assert.equal(h.nodes.get('account-card').hidden,true);assert.equal(h.nodes.get('translate').disabled,true);
  h.grants.allowed=true;h.chrome.permissions.onAdded.emit();await tick();assert.equal(h.nodes.get('permission-card').hidden,true);
 });
 await test('Declining site access keeps all translation controls hidden and blocks page actions',async()=>{
  const h=await harness({connected:true});h.grants.result=false;await h.click('allow-site');await tick();assert.equal(h.nodes.get('permission-card').hidden,false);assert.ok(h.gates.every(el=>el.hidden));assert.equal(h.nodes.get('translate').disabled,true);assert.equal(h.nodes.get('permission-feedback').hidden,false);
  for(const id of ['translate','select-block','restore','retry'])await h.click(id);await tick();
  assert.ok(!h.calls.some(type=>type.startsWith('page.')));assert.ok(!h.calls.includes('models.list'));
 });
 await test('Logout hides every connected control and stale permission responses',async()=>{
  const h=await harness({connected:true});let release;h.grants.pending=new Promise(resolve=>{release=resolve;});h.chrome.permissions.onRemoved.emit();
  await h.click('logout');await tick();release(false);await tick();assert.ok(h.gates.every(el=>el.hidden));assert.equal(h.nodes.get('permission-card').hidden,true);assert.equal(h.nodes.get('login').hidden,false);
 });
 await test('Unsupported pages do not show a request for site access',async()=>{
  const h=await harness({connected:true,url:'chrome://extensions/'});assert.equal(h.nodes.get('permission-card').hidden,false);assert.equal(h.nodes.get('allow-site').hidden,true);assert.ok(h.gates.every(el=>el.hidden));assert.equal(h.nodes.get('site-access-title').textContent,catalogs.ko.siteUnsupportedTitle.message);assert.ok(!h.calls.includes('models.list'));
 });
 await test('A pending access check hides previously available controls until permission is confirmed',async()=>{
  const h=await harness({connected:true,permission:true});let release;h.grants.pending=new Promise(resolve=>{release=resolve;});
  h.chrome.permissions.onRemoved.emit();assert.ok(h.gates.every(el=>el.hidden));assert.equal(h.nodes.get('account-card').hidden,true);
  assert.equal(h.nodes.get('allow-site').hidden,true);assert.equal(h.nodes.get('site-access-title').textContent,catalogs.ko.siteAccessChecking.message);
  release(false);await tick();assert.equal(h.nodes.get('allow-site').hidden,false);assert.equal(h.nodes.get('allow-site').disabled,false);
 });
 await test('A permission approval arriving after logout cannot reveal controls or activate a page',async()=>{
  const h=await harness({connected:true});let release;h.grants.requestPending=new Promise(resolve=>{release=resolve;});
  await h.click('allow-site');await h.click('logout');await tick();release(true);await tick();
  assert.ok(h.gates.every(el=>el.hidden));assert.equal(h.nodes.get('permission-card').hidden,true);assert.equal(h.nodes.get('account-card').hidden,false);
  assert.ok(!h.calls.includes('page.activate'));assert.ok(!h.calls.includes('models.list'));
 });
 await test('Connection completion unlocks options and subsequent logout hides them',async()=>{
  const h=await harness({options:true});h.status.current={state:'connected',connectionId:'new-account'};await h.poll();assert.ok(h.gates.every(el=>!el.hidden));
  h.status.current={state:'disconnected'};await h.poll();assert.ok(h.gates.every(el=>el.hidden));
 });
 await test('Popup and options localize text and accessibility labels using browser language or override',async()=>{
  for(const options of [false,true])for(const [browserLanguage,uiLanguage,expected] of [['en-US','auto','en'],['ko-KR','auto','ko'],['fr','auto','en'],['en','ko','ko'],['ko','en','en']]){
   const h=await harness({options,connected:true,browserLanguage,uiLanguage});
   assert.equal(h.document.documentElement.lang,expected);
   assert.equal(h.nodes.get('account-title').textContent,catalogs[expected].chatGPTConnected.message);
   assert.equal(h.nodes.get('language-toggle').getAttribute('aria-label'),catalogs[expected].openLanguages.message);
   for(const el of h.all.filter(el=>el.dataset.i18n))assert.equal(el.textContent,catalogs[expected][el.dataset.i18n].message);
  }
 });
 await test('UI language changes persist without changing the translation target or model',async()=>{
  const h=await harness({options:true,connected:true,browserLanguage:'ko'}),language=h.nodes.get('ui-language');
  h.nodes.get('instructions-text').value='Unsaved instructions';h.nodes.get('excluded-sites').value='draft.example';
  language.value='en';await language.emit('change');
  assert.equal(h.savedSettings.uiLanguage,'en');assert.equal(h.document.documentElement.lang,'en');
  assert.equal(h.nodes.get('account-title').textContent,'ChatGPT connected');assert.equal(h.nodes.get('target-language').value,'Korean');
  assert.equal(h.savedSettings.targetLanguage,'한국어');assert.equal(h.savedSettings.modelId,'test-model');
  assert.equal(h.nodes.get('instructions-text').value,'Unsaved instructions');assert.equal(h.nodes.get('excluded-sites').value,'draft.example');
  language.value='auto';await language.emit('change');assert.equal(h.document.documentElement.lang,'ko');
 });
 await test('Open UI follows language changes made in another extension screen',async()=>{
  const h=await harness({connected:true});h.savedSettings.uiLanguage='en';
  h.chrome.storage.onChanged.emit({settings:{newValue:{...h.savedSettings}}},'local');await tick();
  assert.equal(h.document.documentElement.lang,'en');assert.equal(h.nodes.get('account-title').textContent,'ChatGPT connected');
 });
 await test('Options show one editable page shortcut alongside block and cancel shortcuts',async()=>{
  const h=await harness({options:true,connected:true,browserLanguage:'en'});
  assert.equal(h.nodes.has('command-list'),false);assert.equal(h.nodes.has('open-shortcuts'),false);
  assert.ok(h.nodes.get('record-page').classList.contains('shortcut-button'));
  assert.equal(h.nodes.get('record-page').textContent,'Ctrl + Alt + T');
  for(const id of ['record-page','record-block','record-cancel'])assert.ok(h.nodes.has(id));
  assert.equal(h.all.filter(el=>el.dataset.i18n==='commandToggle').length,1);
  assert.ok(!h.calls.includes('commands.list'));
  const button=h.nodes.get('record-page');await h.click('record-page');await tick();
  await button.emit('keydown',{altKey:false,ctrlKey:true,shiftKey:true,metaKey:false,code:'KeyY',preventDefault(){},stopPropagation(){}});
  await button.emit('keyup',{preventDefault(){}});
  assert.equal(h.savedSettings.pageShortcut.code,'KeyY');assert.equal(button.textContent,'Ctrl + Shift + Y');
  await h.click('clear-page');await tick();assert.equal(h.savedSettings.pageShortcut,null);assert.equal(button.textContent,'Not set');
 });
 await test('Popup displays the configured page shortcut without querying browser commands',async()=>{
  const h=await harness({connected:true});assert.equal(h.nodes.get('translate-key').textContent,'Ctrl + Alt + T');
  assert.ok(!h.calls.includes('commands.list'));
 });
 await test('Saved language overrides also apply before sign-in',async()=>{
  const h=await harness({uiLanguage:'en',browserLanguage:'ko'});
  assert.equal(h.nodes.get('account-title').textContent,'Connect ChatGPT');assert.equal(h.nodes.get('open-options').getAttribute('title'),'Settings');
  assert.ok(h.gates.every(el=>el.hidden));
 });
 return {passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
}
