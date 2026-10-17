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
async function harness({options=false,connected=false,permission=false,url='https://example.test/',browserLanguage='ko',uiLanguage='auto',modelId='test-model',developerMode=false,panelWindows=[],nativePanelClose=true,panelEvents=true,items=[{id:'test-model',name:'Test model'}]}={}){
 const html=await readFile(new URL('../extension/'+(options?'options':'popup')+'.html',import.meta.url),'utf8');
 const nodes=new Map(),gates=[],all=[];
 for(const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)){
  const el=element(match[1],match[2]),id=match[2].match(/\bid="([^"]+)"/)?.[1];if(id)nodes.set(id,el);all.push(el);
  if(/\bdata-connected-only\b/.test(match[2]))gates.push(el);
 }
 assert.ok(gates.length>0&&gates.every(el=>el.hidden),'Protected UI must start hidden in HTML');
 const status={current:connected?{state:'connected',connectionId:'test-account',email:'user@example.invalid'}:{state:'disconnected'}};
 const grants={allowed:permission,result:true,pending:null,requestPending:null,requests:[]};const calls=[];let poll;
 const savedSettings={schemaVersion:1,uiLanguage,targetLanguage:'한국어',modelId,instructions:'',instructionsEnabled:false,maxConcurrentBatches:16,maxRetries:4,developerMode,excludedSites:[],theme:'system',defaultLocale:'ko',pageShortcut:{alt:true,ctrl:false,shift:false,meta:false,code:'KeyT'},restoreShortcut:{alt:true,ctrl:false,shift:false,meta:false,code:'KeyR'},blockShortcut:{alt:true,ctrl:false,shift:false,meta:false,code:''},cancelShortcut:null};
 const event=()=>({listeners:[],addListener(fn){this.listeners.push(fn);},emit(...args){for(const fn of this.listeners)fn(...args);}});
 const panels={windows:new Set(panelWindows),hidden:new Set(),queries:[],closeRequests:[]};
 const body=element('body','class="'+(options?'options':'popup')+'"');body.dataset.connected='false';
 const document={body,documentElement:{dataset:{}},hidden:false,getElementById:id=>nodes.get(id)||null,
  querySelectorAll:selector=>selector==='[data-connected-only]'?gates:all.filter(el=>el.getAttribute(selector.slice(1,-1))!==undefined),createElement:tag=>element(tag)};
 const chrome={i18n:mockI18n(browserLanguage),storage:{onChanged:event()},windows:{getCurrent:async()=>({id:7})},sidePanel:{opens:[],closes:[],onOpened:event(),onClosed:event(),open(options){this.opens.push(options);panels.windows.add(options.windowId);this.onOpened?.emit({...options,path:'logs.html'});return Promise.resolve();},close(options){this.closes.push(options);panels.windows.delete(options.windowId);this.onClosed?.emit({...options,path:'logs.html'});return Promise.resolve();}},runtime:{getURL:p=>'chrome-extension://test/'+p,getContexts:async filter=>{panels.queries.push(JSON.parse(JSON.stringify(filter)));return [...panels.windows].map(id=>({contextType:'SIDE_PANEL',documentUrl:'chrome-extension://test/logs.html',documentId:'logs-'+id,windowId:-1})).filter(context=>!filter.windowIds||filter.windowIds.includes(context.windowId));},sendMessage:async message=>{
  calls.push(message.type);let data={};
  if(message.type==='logs.panel.status')return panels.windows.has(message.windowId)?{ok:true,windowId:message.windowId,open:!panels.hidden.has(message.windowId)}:undefined;
  if(message.type==='logs.panel.close'){panels.closeRequests.push(JSON.parse(JSON.stringify(message)));panels.windows.delete(message.windowId);return {ok:true};}
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
   request:async options=>{grants.requests.push(JSON.parse(JSON.stringify(options)));const result=grants.requestPending?await grants.requestPending:grants.result;if(result)grants.allowed=true;return result;},remove:async()=>{grants.allowed=false;return true;}}};
 if(!nativePanelClose)delete chrome.sidePanel.close;
 if(!panelEvents){delete chrome.sidePanel.onOpened;delete chrome.sidePanel.onClosed;}
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
 return {nodes,gates,status,grants,calls,body,chrome,savedSettings,document,all,panels,poll:()=>poll(),click:id=>nodes.get(id).emit('click')};
}
export async function uiStateTests(){
 const results=[];async function test(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.stack||e.message});}}
 await test('Signed-out popup and options hide connected-only controls',async()=>{
  for(const options of [false,true]){const h=await harness({options});assert.ok(h.gates.every(el=>el.hidden));assert.equal(h.nodes.get('login').hidden,false);assert.equal(h.body.dataset.connected,'false');assert.ok(!h.calls.includes('models.list'));if(!options)assert.equal(h.nodes.get('permission-card').hidden,true);}
 });
 await test('Developer mode shows a log icon and opens the native side panel directly on click',async()=>{
  const normal=await harness();assert.equal(normal.nodes.get('open-logs').hidden,true);await normal.click('open-logs');assert.equal(normal.chrome.sidePanel.opens.length,0);
  for(const options of [false,true]){
   const h=await harness({options,connected:true,developerMode:true});assert.equal(h.nodes.get('open-logs').hidden,false);
   await h.click('open-logs');assert.equal(h.chrome.sidePanel.opens.length,1);assert.equal(h.chrome.sidePanel.opens[0].windowId,7);
   h.chrome.storage.onChanged.emit({settings:{newValue:{...h.savedSettings,developerMode:false}}},'local');assert.equal(h.nodes.get('open-logs').hidden,true);
  }
 });
 await test('Retry count and developer mode controls save independently from translation preferences',async()=>{
  const h=await harness({options:true,connected:true});assert.equal(h.nodes.get('max-retries').value,4);
  h.nodes.get('max-retries').valueAsNumber=0;await h.nodes.get('max-retries').emit('change');assert.equal(h.savedSettings.maxRetries,0);
  h.nodes.get('developer-mode').checked=true;await h.nodes.get('developer-mode').emit('change');assert.equal(h.savedSettings.developerMode,true);assert.equal(h.nodes.get('open-logs').hidden,false);
  assert.equal(h.savedSettings.targetLanguage,'한국어');assert.equal(h.savedSettings.modelId,'test-model');
 });
 await test('LOG toggles the current window panel and discovers panels already open when UI starts',async()=>{
  for(const options of [false,true])for(const initiallyOpen of [false,true]){
   const h=await harness({options,connected:true,developerMode:true,panelWindows:initiallyOpen?[7,8]:[8]}),button=h.nodes.get('open-logs');
   assert.equal(button.getAttribute('aria-pressed'),String(initiallyOpen));
   assert.equal(button.getAttribute('title'),catalogs.ko[initiallyOpen?'closeLogs':'openLogs'].message);
   assert.deepEqual(h.panels.queries[0],{contextTypes:['SIDE_PANEL'],documentUrls:['chrome-extension://test/logs.html']});
   const first=h.click('open-logs');
   assert.equal(initiallyOpen?h.chrome.sidePanel.closes.length:h.chrome.sidePanel.opens.length,1,'The native operation must begin in the click handler');
   await first;await tick();assert.equal(h.panels.windows.has(7),!initiallyOpen);assert.equal(h.panels.windows.has(8),true);
   await h.click('open-logs');await tick();assert.equal(h.panels.windows.has(7),initiallyOpen);
   assert.equal(button.getAttribute('aria-pressed'),String(initiallyOpen));assert.equal(h.savedSettings.developerMode,true);
   assert.ok(!h.calls.includes('logs.clear'));assert.ok(!h.calls.includes('settings.update'));
  }
 });
 await test('Panel events and legacy polling keep LOG synchronized with manual close and reopening',async()=>{
  for(const panelEvents of [false,true]){
   const h=await harness({options:true,connected:true,developerMode:true,panelWindows:[7,8],panelEvents}),button=h.nodes.get('open-logs');
   h.chrome.sidePanel.onClosed?.emit({windowId:8,path:'logs.html'});assert.equal(button.getAttribute('aria-pressed'),'true');
   h.panels.windows.delete(7);h.chrome.sidePanel.onClosed?.emit({windowId:7,path:'logs.html'});await h.poll();
   assert.equal(button.getAttribute('aria-pressed'),'false');assert.equal(button.getAttribute('aria-label'),catalogs.ko.openLogs.message);
   await h.click('open-logs');await tick();assert.equal(h.chrome.sidePanel.opens.length,1);assert.equal(button.getAttribute('aria-pressed'),'true');
   h.chrome.storage.onChanged.emit({settings:{newValue:{...h.savedSettings,uiLanguage:'en'}}},'local');await tick();
   assert.equal(button.getAttribute('title'),catalogs.en.closeLogs.message);
  }
 });
 await test('Legacy panel close targets its own window and works without sidePanel.close or lifecycle events',async()=>{
  const h=await harness({connected:true,developerMode:true,panelWindows:[7,8],nativePanelClose:false,panelEvents:false});
  await h.click('open-logs');await tick();assert.deepEqual(h.panels.closeRequests,[{type:'logs.panel.close',windowId:7}]);
  assert.equal(h.panels.windows.has(7),false);assert.equal(h.panels.windows.has(8),true);
  await h.click('open-logs');await tick();assert.equal(h.chrome.sidePanel.opens.length,1);assert.equal(h.panels.windows.has(7),true);
 });
 await test('Pending and rejected toggle operations neither double-toggle nor leave LOG disabled',async()=>{
  const h=await harness({connected:true,permission:true,developerMode:true});let reject;
  h.chrome.sidePanel.open=()=>new Promise((resolve,fail)=>{reject=fail;});
  const pending=h.click('open-logs');assert.equal(h.nodes.get('open-logs').disabled,true);
  await h.click('open-logs');assert.equal(h.chrome.sidePanel.closes.length,0);
  reject(Error('Cannot open panel'));await pending;await tick();
  assert.equal(h.nodes.get('open-logs').disabled,false);assert.equal(h.nodes.get('open-logs').getAttribute('aria-pressed'),'false');
  assert.equal(h.nodes.get('feedback').textContent,'Cannot open panel');
  h.panels.windows.add(7);await h.poll();assert.equal(h.nodes.get('open-logs').getAttribute('aria-pressed'),'true');h.chrome.sidePanel.close=()=>Promise.reject(Error('Cannot close panel'));
  await h.click('open-logs');await tick();assert.equal(h.nodes.get('open-logs').getAttribute('aria-pressed'),'true');
  assert.equal(h.nodes.get('open-logs').disabled,false);assert.equal(h.nodes.get('feedback').textContent,'Cannot close panel');
 });
 await test('Delayed context discovery cannot overwrite a newer native close event',async()=>{
  const h=await harness({connected:true,developerMode:true,panelWindows:[7]});let resolve;
  h.chrome.runtime.getContexts=()=>new Promise(done=>{resolve=done;});const pending=h.poll();
  h.panels.windows.delete(7);h.chrome.sidePanel.onClosed.emit({windowId:7,path:'logs.html'});resolve([{windowId:7}]);await pending;
  assert.equal(h.nodes.get('open-logs').getAttribute('aria-pressed'),'false');
 });
 await test('Chromium contexts with windowId -1 still close an existing panel instead of reopening it',async()=>{
  const h=await harness({connected:true,developerMode:true,panelWindows:[7,8],panelEvents:false});
  const contexts=await h.chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']});assert.ok(contexts.every(context=>context.windowId===-1));
  assert.equal(h.nodes.get('open-logs').getAttribute('aria-pressed'),'true');
  await h.click('open-logs');await tick();assert.equal(h.chrome.sidePanel.closes.length,1);assert.equal(h.chrome.sidePanel.opens.length,0);
  assert.equal(h.panels.windows.has(7),false);assert.equal(h.panels.windows.has(8),true);
  await h.click('open-logs');await tick();assert.equal(h.chrome.sidePanel.opens.length,1);
 });
 await test('Hidden panel documents do not count as open and global events accept tabId -1',async()=>{
  const h=await harness({connected:true,developerMode:true,panelWindows:[7,8]});
  h.panels.hidden.add(7);await h.poll();assert.equal(h.nodes.get('open-logs').getAttribute('aria-pressed'),'false');
  h.panels.hidden.delete(7);h.chrome.sidePanel.onOpened.emit({windowId:7,path:'logs.html',tabId:-1});
  assert.equal(h.nodes.get('open-logs').getAttribute('aria-pressed'),'true');
  h.chrome.sidePanel.onClosed.emit({windowId:7,path:'logs.html',tabId:9});assert.equal(h.nodes.get('open-logs').getAttribute('aria-pressed'),'true');
  h.chrome.sidePanel.onClosed.emit({windowId:7,path:'logs.html',tabId:-1});assert.equal(h.nodes.get('open-logs').getAttribute('aria-pressed'),'false');
 });
 await test('Log retention control is shown only in developer mode and saves the upper limit',async()=>{
  const h=await harness({options:true,connected:true}),input=h.nodes.get('max-log-entries');
  assert.equal(h.nodes.get('developer-options').hidden,true);assert.equal(input.value,4000);assert.equal(input.getAttribute('max'),'1000000');
  h.nodes.get('developer-mode').checked=true;await h.nodes.get('developer-mode').emit('change');assert.equal(h.nodes.get('developer-options').hidden,false);
  input.valueAsNumber=1000000;await input.emit('change');assert.equal(h.savedSettings.maxLogEntries,1000000);
  h.chrome.storage.onChanged.emit({settings:{newValue:{...h.savedSettings,developerMode:false,maxLogEntries:123}}},'local');
  assert.equal(h.nodes.get('developer-options').hidden,true);assert.equal(input.value,123);
  h.nodes.get('developer-mode').checked=true;await h.nodes.get('developer-mode').emit('change');assert.equal(h.nodes.get('developer-options').hidden,false);
 });
 await test('Rejected log limits restore the saved input and show the validation error',async()=>{
  const h=await harness({options:true,connected:true,developerMode:true}),input=h.nodes.get('max-log-entries'),send=h.chrome.runtime.sendMessage;
  h.chrome.runtime.sendMessage=async message=>message.type==='settings.update'?{ok:false,error:{message:'Invalid log limit'}}:send(message);
  input.value=1000001;input.valueAsNumber=1000001;await input.emit('change');
  assert.equal(input.value,4000);assert.equal(h.nodes.get('feedback').textContent,'Invalid log limit');
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
 await test('Popup access choices request their exact scope and activate the current page after approval',async()=>{
  for(const [id,origins] of [['allow-site',['https://example.test/*']],['allow-all-sites',['http://*/*','https://*/*']]]){
   const h=await harness({connected:true});
   for(const button of ['allow-site','allow-all-sites']){assert.equal(h.nodes.get(button).hidden,false);assert.equal(h.nodes.get(button).disabled,false);}
   await h.click(id);await tick();
   assert.deepEqual(h.grants.requests,[{origins}]);assert.equal(h.nodes.get('permission-card').hidden,true);
   assert.ok(h.gates.every(el=>!el.hidden));assert.ok(h.calls.includes('page.activate'));assert.ok(h.calls.includes('models.list'));
   assert.ok(h.calls.indexOf('page.activate')<h.calls.indexOf('models.list'),'Already-open documents must activate before model discovery');
  }
 });
 await test('A pending permission prompt disables both access choices and prevents duplicate requests',async()=>{
  for(const id of ['allow-site','allow-all-sites']){
   const h=await harness({connected:true});let release;h.grants.requestPending=new Promise(resolve=>{release=resolve;});
   await h.click(id);assert.equal(h.grants.requests.length,1);
   for(const button of ['allow-site','allow-all-sites']){assert.equal(h.nodes.get(button).disabled,true);await h.click(button);}
   assert.equal(h.grants.requests.length,1);release(false);await tick();
   assert.ok(h.gates.every(el=>el.hidden));
   for(const button of ['allow-site','allow-all-sites'])assert.equal(h.nodes.get(button).disabled,false);
  }
 });
 await test('Granting access hides the card and revoking it shows the card again',async()=>{
  const h=await harness({connected:true});assert.equal(h.nodes.get('permission-card').hidden,false);await h.click('allow-site');await tick();assert.equal(h.nodes.get('permission-card').hidden,true);assert.ok(h.gates.every(el=>!el.hidden));assert.equal(h.nodes.get('account-card').hidden,false);assert.ok(h.calls.includes('page.activate'));assert.ok(h.calls.includes('models.list'));
  h.grants.allowed=false;h.chrome.permissions.onRemoved.emit();await tick();assert.equal(h.nodes.get('permission-card').hidden,false);assert.ok(h.gates.every(el=>el.hidden));assert.equal(h.nodes.get('account-card').hidden,true);assert.equal(h.nodes.get('translate').disabled,true);
  h.grants.allowed=true;h.chrome.permissions.onAdded.emit();await tick();assert.equal(h.nodes.get('permission-card').hidden,true);
 });
 await test('Declining either access choice keeps translation controls hidden and blocks page actions',async()=>{
  for(const id of ['allow-site','allow-all-sites']){
   const h=await harness({connected:true});h.grants.result=false;await h.click(id);await tick();
   assert.equal(h.nodes.get('permission-card').hidden,false);assert.ok(h.gates.every(el=>el.hidden));
   assert.equal(h.nodes.get('translate').disabled,true);assert.equal(h.nodes.get('permission-feedback').hidden,false);
   for(const action of ['translate','select-block','restore','retry'])await h.click(action);await tick();
   assert.ok(!h.calls.some(type=>type.startsWith('page.')));assert.ok(!h.calls.includes('models.list'));
  }
 });
 await test('Logout hides every connected control and stale permission responses',async()=>{
  const h=await harness({connected:true});let release;h.grants.pending=new Promise(resolve=>{release=resolve;});h.chrome.permissions.onRemoved.emit();
  await h.click('logout');await tick();release(false);await tick();assert.ok(h.gates.every(el=>el.hidden));assert.equal(h.nodes.get('permission-card').hidden,true);assert.equal(h.nodes.get('login').hidden,false);
 });
 await test('Unsupported pages do not show a request for site access',async()=>{
  const h=await harness({connected:true,url:'chrome://extensions/'});assert.equal(h.nodes.get('permission-card').hidden,false);assert.equal(h.nodes.get('allow-site').hidden,true);assert.equal(h.nodes.get('allow-all-sites').hidden,true);assert.ok(h.gates.every(el=>el.hidden));assert.equal(h.nodes.get('site-access-title').textContent,catalogs.ko.siteUnsupportedTitle.message);assert.ok(!h.calls.includes('models.list'));
 });
 await test('A pending access check hides previously available controls until permission is confirmed',async()=>{
  const h=await harness({connected:true,permission:true});let release;h.grants.pending=new Promise(resolve=>{release=resolve;});
  h.chrome.permissions.onRemoved.emit();assert.ok(h.gates.every(el=>el.hidden));assert.equal(h.nodes.get('account-card').hidden,true);
  assert.equal(h.nodes.get('allow-site').hidden,true);assert.equal(h.nodes.get('allow-all-sites').hidden,true);assert.equal(h.nodes.get('site-access-title').textContent,catalogs.ko.siteAccessChecking.message);
  release(false);await tick();assert.equal(h.nodes.get('allow-site').hidden,false);assert.equal(h.nodes.get('allow-site').disabled,false);
 });
 await test('Permission approvals arriving after logout cannot reveal controls or activate a page',async()=>{
  for(const id of ['allow-site','allow-all-sites']){
   const h=await harness({connected:true});let release;h.grants.requestPending=new Promise(resolve=>{release=resolve;});
   await h.click(id);await h.click('logout');await tick();release(true);await tick();
   assert.ok(h.gates.every(el=>el.hidden));assert.equal(h.nodes.get('permission-card').hidden,true);assert.equal(h.nodes.get('account-card').hidden,false);
   assert.ok(!h.calls.includes('page.activate'));assert.ok(!h.calls.includes('models.list'));
  }
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
  assert.equal(h.nodes.get('account-title').textContent,'ChatGPT connected');assert.equal(h.nodes.get('target-language').value,'한국어 ∙ Korean');
  assert.equal(h.savedSettings.targetLanguage,'한국어');assert.equal(h.savedSettings.modelId,'test-model');
  assert.equal(h.nodes.get('instructions-text').value,'Unsaved instructions');assert.equal(h.nodes.get('excluded-sites').value,'draft.example');
  language.value='auto';await language.emit('change');assert.equal(h.document.documentElement.lang,'ko');
 });
 await test('Open UI follows language changes made in another extension screen',async()=>{
  const h=await harness({connected:true});h.savedSettings.uiLanguage='en';
  h.chrome.storage.onChanged.emit({settings:{newValue:{...h.savedSettings}}},'local');await tick();
  assert.equal(h.document.documentElement.lang,'en');assert.equal(h.nodes.get('account-title').textContent,'ChatGPT connected');
 });
 await test('Language list shows native and localized region names, keeps the browser language first, and saves the chosen region',async()=>{
  const h=await harness({options:true,connected:true,browserLanguage:'ko'});
  await h.click('language-toggle');await tick();const list=h.nodes.get('language-list');
  assert.equal(list.children[0].children[0].textContent,'한국어');assert.equal(list.children[0].children[1].textContent,catalogs.ko.browserLanguage.message);
  const labels=list.children.map(row=>row.children[0].textContent);
  for(const label of ['English (United States) ∙ 영어 (미국)','English (United Kingdom) ∙ 영어 (영국)','English (Australia) ∙ 영어 (호주)',
   'Português (Brasil) ∙ 포르투갈어 (브라질)','Português (Portugal) ∙ 포르투갈어 (포르투갈)'])assert.ok(labels.includes(label));
  const british=list.children.find(row=>row.children[0].textContent==='English (United Kingdom) ∙ 영어 (영국)');
  await british.emit('click');assert.equal(h.savedSettings.targetLanguage,'English (United Kingdom)');
  assert.equal(h.nodes.get('target-language').value,'English (United Kingdom) ∙ 영어 (영국)');
  h.nodes.get('ui-language').value='en';await h.nodes.get('ui-language').emit('change');
  assert.equal(h.savedSettings.targetLanguage,'English (United Kingdom)');assert.equal(h.nodes.get('target-language').value,'English (United Kingdom)');
 });
 await test('Language filtering accepts native names, localized countries, locale codes, and custom targets',async()=>{
  const h=await harness({connected:true,permission:true,browserLanguage:'ko'}),input=h.nodes.get('target-language'),list=h.nodes.get('language-list');
  for(const [query,expected] of [['Brasil','Português (Brasil) ∙ 포르투갈어 (브라질)'],['포르투갈','Português (Portugal) ∙ 포르투갈어 (포르투갈)'],['en-AU','English (Australia) ∙ 영어 (호주)']]){
   input.value=query;await input.emit('input');assert.ok(list.children.some(row=>row.children[0].textContent===expected));
  }
  await input.emit('keydown',{key:'ArrowDown',preventDefault(){}});await input.emit('keydown',{key:'Enter',preventDefault(){}});await tick();
  assert.equal(h.savedSettings.targetLanguage,'English (Australia)');
  input.value='English (plain language)';await input.emit('input');await input.emit('keydown',{key:'Enter',preventDefault(){}});await tick();
  assert.equal(h.savedSettings.targetLanguage,'English (plain language)');assert.equal(input.value,'English (plain language)');
 });
 await test('Options independently edit and clear page translation and restoration shortcuts',async()=>{
  const h=await harness({options:true,connected:true,browserLanguage:'en'});
  assert.equal(h.nodes.has('command-list'),false);assert.equal(h.nodes.has('open-shortcuts'),false);
  assert.ok(h.nodes.get('record-page').classList.contains('shortcut-button'));
  assert.equal(h.nodes.get('record-page').textContent,'Alt + T');
  assert.equal(h.nodes.get('record-restore').textContent,'Alt + R');
  for(const id of ['record-page','record-restore','record-block','record-cancel'])assert.ok(h.nodes.has(id));
  assert.equal(h.all.filter(el=>el.dataset.i18n==='commandTranslate').length,1);assert.equal(h.all.filter(el=>el.dataset.i18n==='commandRestore').length,1);
  assert.ok(!h.calls.includes('commands.list'));
  const button=h.nodes.get('record-page');await h.click('record-page');await tick();
  await button.emit('keydown',{altKey:false,ctrlKey:true,shiftKey:true,metaKey:false,code:'KeyY',preventDefault(){},stopPropagation(){}});
  await button.emit('keyup',{preventDefault(){}});
  assert.equal(h.savedSettings.pageShortcut.code,'KeyY');assert.equal(button.textContent,'Ctrl + Shift + Y');
  await h.click('clear-page');await tick();assert.equal(h.savedSettings.pageShortcut,null);assert.equal(button.textContent,'Not set');
  assert.equal(h.savedSettings.restoreShortcut.code,'KeyR');
  const restore=h.nodes.get('record-restore');await h.click('record-restore');await tick();
  await restore.emit('keydown',{altKey:false,ctrlKey:true,shiftKey:true,metaKey:false,code:'KeyO',preventDefault(){},stopPropagation(){}});
  await restore.emit('keyup',{preventDefault(){}});assert.equal(h.savedSettings.restoreShortcut.code,'KeyO');assert.equal(h.savedSettings.pageShortcut,null);
  await h.click('clear-restore');await tick();assert.equal(h.savedSettings.restoreShortcut,null);assert.equal(restore.textContent,'Not set');
 });
 await test('Popup displays the configured page shortcut without querying browser commands',async()=>{
  const h=await harness({connected:true});assert.equal(h.nodes.get('translate-key').textContent,'Alt + T');
  assert.equal(h.nodes.get('block-key').textContent,'Alt + 클릭');assert.equal(h.nodes.get('restore-key').textContent,'Alt + R');
  const english=await harness({connected:true,browserLanguage:'en'});assert.equal(english.nodes.get('block-key').textContent,'Alt + Click');
  assert.ok(!h.calls.includes('commands.list'));
 });
 await test('Saved language overrides also apply before sign-in',async()=>{
  const h=await harness({uiLanguage:'en',browserLanguage:'ko'});
  assert.equal(h.nodes.get('account-title').textContent,'Connect ChatGPT');assert.equal(h.nodes.get('open-options').getAttribute('title'),'Settings');
  assert.ok(h.gates.every(el=>el.hidden));
 });
 return {passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
}
