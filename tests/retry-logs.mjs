import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {ReadableStream} from 'node:stream/web';
import {DeveloperLog,LOG_KEY,redact} from '../extension/lib/logger.mjs';
const input=[{id:'b1',nodes:[{id:'n0',text:'Original paragraph'}]}];
const valid=JSON.stringify({blocks:[{id:'b1',nodes:[{id:'n0',text:'Translated paragraph'}]}]});
function storage(){return {data:{},async get(key){return {[key]:this.data[key]};},async set(data){Object.assign(this.data,JSON.parse(JSON.stringify(data)));}};}
function quotaStorage(quota=4096){
 const disk=storage();disk.QUOTA_BYTES=quota;
 const bytes=data=>Object.entries(data).reduce((sum,[key,value])=>sum+key.length+new TextEncoder().encode(JSON.stringify(value)).length,0);
 disk.getBytesInUse=async key=>bytes(key===null?disk.data:disk.data[key]===undefined?{}:{[key]:disk.data[key]});
 disk.set=async data=>{if(bytes({...disk.data,...data})>quota)throw Error('QUOTA_BYTES exceeded');Object.assign(disk.data,JSON.parse(JSON.stringify(data)));};
 disk.remove=async key=>{delete disk.data[key];};return disk;
}
function response(text=valid,type='response.completed'){
 const event={type,response:{status:type==='response.completed'?'completed':'incomplete',output:[{content:[{type:'output_text',text}]}]}};
 const body=new TextEncoder().encode('data: '+JSON.stringify(event)+'\n\n');
 return {ok:true,status:200,body:new ReadableStream({start(c){c.enqueue(body);c.close();}})};
}
async function providerHarness(sequence,options={}){
 const calls=[],logs=[],auth={accessToken:'SECRET_ACCESS_TOKEN',accountId:'test',connectionId:'connection'},delays=[];
 const logger={enabled:true,add(event,details,level){logs.push({event,details,level});return String(logs.length-1);},update(id,details){if(id!==null)logs[Number(id)].details=details;},async flush(){}};
 const timers=new Map();let timerId=0;
 const context=vm.createContext({crypto,AbortController,DOMException,TextEncoder,TextDecoder,Math,URL,
  setTimeout(fn,ms){const id=++timerId;if(ms===120000){timers.set(id,()=>{timers.delete(id);fn();});return id;}delays.push(ms);options.onDelay?.();timers.set(id,setTimeout(fn,0));return id;},
  clearTimeout(id){if(typeof timers.get(id)!=='function')clearTimeout(timers.get(id));timers.delete(id);},
  fetch:async(url,init)=>{calls.push({url,init});const item=sequence[Math.min(calls.length-1,sequence.length-1)];if(typeof item==='function')return item(init,()=>{for(const timer of timers.values())if(typeof timer==='function')timer();});if(item instanceof Error)throw item;return item();}
 });
 const files=new Map();
 async function load(url){
  if(!files.has(url.href))files.set(url.href,(async()=>{
   if(url.pathname.endsWith('/auth.mjs'))return new vm.SyntheticModule(['getAuth'],function(){this.setExport('getAuth',async()=>auth);},{context});
   if(url.pathname.endsWith('/logger.mjs'))return new vm.SyntheticModule(['developerLog'],function(){this.setExport('developerLog',logger);},{context});
   return new vm.SourceTextModule(await readFile(url,'utf8'),{context,identifier:url.href});
  })());return files.get(url.href);
 }
 const module=await load(new URL('../extension/lib/provider.mjs',import.meta.url));await module.link((specifier,parent)=>load(new URL(specifier,parent.identifier)));await module.evaluate();
 const controller=new AbortController();
 return {calls,logs,delays,controller,auth,run:(maxRetries=4)=>module.namespace.translate(options.blocks||input,{modelId:'luna-test',targetLanguage:'Korean',instructionsEnabled:true,instructions:'Keep the tone friendly.',maxRetries},'connection',controller.signal)};
}
export async function retryLogTests(){
 const results=[];async function test(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.stack||e.message});}}
 await test('Invalid JSON is requested again with the same original input and recorded in diagnostics',async()=>{
  const h=await providerHarness([()=>response('Not JSON'),()=>response()]);const output=await h.run();
  assert.equal(output.b1[0],'Translated paragraph');assert.equal(h.calls.length,2);
  const bodies=h.calls.map(call=>JSON.parse(call.init.body));assert.equal(bodies[0].input[0].content[0].text,bodies[1].input[0].content[0].text);
  assert.ok(bodies[1].instructions.includes('previous response'));assert.ok(bodies[1].instructions.includes('Keep the tone friendly.'));
  assert.ok(h.logs.some(row=>row.event==='translation.response'&&row.details.text==='Not JSON'));
  assert.ok(h.logs.some(row=>row.event==='translation.retry'&&row.details.retry===1));
  assert.ok(h.logs.some(row=>row.event==='http.request'&&row.details.payload.model==='luna-test'));
  assert.ok(!JSON.stringify(h.logs).includes('SECRET_ACCESS_TOKEN'));
 });
 await test('Reported eight-block response succeeds on the first request with raw diagnostics preserved',async()=>{
  const fixture=JSON.parse(await readFile(new URL('./fixtures/luna-extra-closers.json',import.meta.url),'utf8'));
  const h=await providerHarness([()=>response(fixture.responseText)],{blocks:fixture.requested}),output=await h.run(0);
  assert.equal(h.calls.length,1);assert.equal(h.delays.length,0);assert.equal(Object.keys(output).length,8);assert.equal(output.b17[0],'목록');
  const raw=h.logs.find(row=>row.event==='translation.response');assert.equal(raw.details.state,'validated');assert.equal(raw.details.text,fixture.responseText);
  assert.equal(raw.details.events.at(-1).response.output[0].content[0].text,fixture.responseText);
  assert.equal(raw.details.recovery.removedCharacters,2);assert.ok(h.logs.some(row=>row.event==='translation.recovered'&&row.level==='warn'));
  assert.ok(!h.logs.some(row=>row.event==='translation.retry'||row.event==='translation.error'));
 });
 await test('An unrecoverable response still retries and a later extra-closing response completes without more requests',async()=>{
  const h=await providerHarness([()=>response('Invalid JSON'),()=>response(valid+']}')]);assert.equal((await h.run()).b1[0],'Translated paragraph');assert.equal(h.calls.length,2);
  const bodies=h.calls.map(call=>JSON.parse(call.init.body));assert.equal(bodies[0].input[0].content[0].text,bodies[1].input[0].content[0].text);
  assert.ok(bodies[0].instructions.includes('Close each array and object exactly once'));
  assert.ok(bodies[1].instructions.includes('Do not append any characters after the root object closes'));
  assert.equal(h.logs.filter(row=>row.event==='translation.recovered').length,1);
 });
 await test('Trailing closers never turn missing blocks into a successful or recovered response',async()=>{
  const h=await providerHarness([()=>response('{"blocks":[]}]}')]);await assert.rejects(h.run(1),e=>e.messageKey==='resultBlockCount');assert.equal(h.calls.length,2);
  assert.ok(!h.logs.some(row=>['translation.recovered','translation.validated'].includes(row.event)));
 });
 await test('Four retries mean five total attempts; zero disables automatic retries',async()=>{
  for(const [limit,count]of [[4,5],[0,1],[1,2]]){
   const h=await providerHarness([()=>response('Invalid JSON')]);await assert.rejects(h.run(limit),e=>e.code==='RESULT');assert.equal(h.calls.length,count);assert.equal(h.delays.length,count-1);
  }
 });
 await test('Stream output appears in diagnostics before the final response completes',async()=>{
  let streamController;
  const h=await providerHarness([()=>({ok:true,status:200,body:new ReadableStream({start(controller){streamController=controller;}})})]);
  const running=h.run();await new Promise(resolve=>setTimeout(resolve,0));
  streamController.enqueue(new TextEncoder().encode('data: '+JSON.stringify({type:'response.output_text.delta',delta:valid.slice(0,10)})+'\n\n'));
  await new Promise(resolve=>setTimeout(resolve,0));
  const live=h.logs.find(row=>row.event==='translation.response');assert.equal(live.details.state,'streaming');assert.equal(live.details.events[0].delta,valid.slice(0,10));
  streamController.enqueue(new TextEncoder().encode('data: '+JSON.stringify({type:'response.completed',response:{status:'completed',output:[{content:[{type:'output_text',text:valid}]}]}})+'\n\n'));streamController.close();
  await running;assert.equal(live.details.text,valid);
 });
 await test('Schema errors, incomplete streams, network failures, and server failures retry through validation',async()=>{
  for(const bad of [()=>response('{"blocks":[]}'),()=>response('', 'response.incomplete'),new Error('Network down'),()=>({ok:false,status:503,text:async()=>'{"error":"temporary"}'})]){
   const h=await providerHarness([bad,()=>response()]);await h.run();assert.equal(h.calls.length,2);
  }
 });
 await test('Rate limits, denied access and invalid model requests do not consume all retry attempts',async()=>{
  for(const status of [429,403,400]){const h=await providerHarness([()=>({ok:false,status,text:async()=>'{"error":"denied"}'})]);await assert.rejects(h.run());assert.equal(h.calls.length,1);}
 });
 await test('Cancelling retry backoff prevents every subsequent request',async()=>{
  let controller;const h=await providerHarness([()=>response('Invalid')],{onDelay:()=>controller.abort()});controller=h.controller;
  await assert.rejects(h.run(),e=>e.name==='AbortError');assert.equal(h.calls.length,1);
 });
 await test('A timed-out attempt retries, while explicit cancellation never retries',async()=>{
  const timed=await providerHarness([(init,timeout)=>new Promise((resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(new Error('abort')));timeout();}),()=>response()]);
  await timed.run();assert.equal(timed.calls.length,2);assert.ok(timed.logs.some(row=>row.details.code==='TIMEOUT'));
  const stopped=await providerHarness([()=>response()]);stopped.controller.abort();await assert.rejects(stopped.run(),e=>e.name==='AbortError');assert.equal(stopped.calls.length,0);
 });
 await test('A connection change during retry backoff stops resending private page text',async()=>{
  let auth;const h=await providerHarness([()=>response('Invalid')],{onDelay:()=>{auth.connectionId='other';}});auth=h.auth;
  await assert.rejects(h.run(),e=>e.code==='ACCOUNT_CHANGED');assert.equal(h.calls.length,1);
 });
 await test('Diagnostic history is opt-in, persists across logger restarts, and excludes credential fields',async()=>{
  const disk=storage(),log=new DeveloperLog(disk);await log.configure(false);log.add('ignored',{text:'Private'});await log.flush();assert.equal(disk.data[LOG_KEY],undefined);
  await log.configure(true);log.add('test',{access_token:'secret',nested:{refreshToken:'secret',Authorization:'Bearer abc',Cookie:'session=abc'},text:'Input',output:'Output'});
  await log.flush();assert.ok(!JSON.stringify(disk.data).includes('secret'));assert.ok(!JSON.stringify(disk.data).includes('session=abc'));
  const next=new DeveloperLog(disk);await next.configure(true);const data=await next.snapshot();assert.equal(data.entries.length,1);assert.equal(data.entries[0].details.text,'Input');assert.equal(data.entries[0].details.output,'Output');
  await next.configure(false);next.add('ignored');await next.flush();assert.equal((await next.snapshot()).entries.length,1);
  assert.equal(redact('Bearer SAMPLE_TOKEN'),'Bearer [REDACTED]');
 });
 await test('Live response updates retain one entry and clearing cannot resurrect an in-flight entry',async()=>{
  const disk=storage(),log=new DeveloperLog(disk);await log.configure(true);const id=log.add('response',{text:'a'});log.update(id,{text:'ab'});await log.flush();
  assert.equal(disk.data[LOG_KEY].entries.length,1);assert.equal(disk.data[LOG_KEY].entries[0].details.text,'ab');
  await log.clear();log.update(id,{text:'late private output'});await log.flush();assert.equal(disk.data[LOG_KEY].entries.length,0);
 });
 await test('Entry and byte limits evict old history and report oversized entries',async()=>{
  const log=new DeveloperLog(storage(),{maxEntries:2,maxBytes:1000});await log.configure(true);
  for(const name of ['one','two','three'])log.add(name);await log.flush();let data=await log.snapshot();assert.deepEqual(data.entries.map(row=>row.event),['two','three']);assert.equal(data.dropped,1);
  log.add('large',{text:'x'.repeat(2000)});await log.flush();data=await log.snapshot();assert.equal(data.entries.length,1);assert.equal(data.entries[0].details.omitted,true);
  assert.ok(new TextEncoder().encode(JSON.stringify(data.entries)).length<=1000);
 });
 await test('Storage failures preserve live diagnostics and recover on the next flush',async()=>{
  const disk=storage(),save=disk.set;disk.set=async()=>{throw Error('Quota');};const log=new DeveloperLog(disk);await log.configure(true);log.add('test',{text:'keep'});await log.flush();
  assert.equal((await log.snapshot()).storageError,true);assert.equal((await log.snapshot()).entries[0].details.text,'keep');
  disk.set=save;await log.flush();assert.equal((await log.snapshot()).storageError,false);assert.equal(disk.data[LOG_KEY].entries.length,1);
 });
 await test('Default retention keeps 4,000 entries and permits logs larger than the old 4 MiB cap',async()=>{
  const disk=quotaStorage(10*1024*1024),log=new DeveloperLog(disk);await log.configure(true);
  for(let index=0;index<4005;index++)log.add('event '+index);await log.flush();
  let data=await log.snapshot();assert.equal(data.maxEntries,4000);assert.equal(data.entries.length,4000);assert.equal(data.entries[0].event,'event 5');assert.equal(data.dropped,5);
  log.add('large',{text:'x'.repeat(5*1024*1024)});await log.flush();data=await log.snapshot();
  assert.equal(data.entries.at(-1).details.text.length,5*1024*1024);assert.equal(data.entries.length,4000);assert.equal(data.storageError,false);
  const manifest=JSON.parse(await readFile(new URL('../extension/manifest.json',import.meta.url),'utf8'));assert.ok(!manifest.permissions.includes('unlimitedStorage'));
 });
 await test('Native quota accounting includes other data, Unicode payloads and the full log envelope',async()=>{
  const disk=quotaStorage();await disk.set({settings:{instructions:'Keep me'},auth:{accessToken:'Keep credentials'}});
  const before=JSON.stringify(disk.data),log=new DeveloperLog(disk,{reservedBytes:128});await log.configure(true,1000000);
  for(let index=0;index<10;index++)log.add('event '+index,{text:'한글😀'.repeat(70)});await log.flush();
  const data=await log.snapshot();assert.equal(data.storageError,false);assert.ok(data.entries.length<10);assert.equal(data.entries.at(-1).event,'event 9');
  assert.ok(await disk.getBytesInUse(null)<=disk.QUOTA_BYTES-128);assert.equal(JSON.stringify({settings:disk.data.settings,auth:disk.data.auth}),before);
  await log.clear();assert.equal((await log.snapshot()).entries.length,0);assert.equal(disk.data.auth.accessToken,'Keep credentials');
 });
 await test('Quota changes during a write trigger pruning and retry without losing the newest log',async()=>{
  const disk=quotaStorage(),log=new DeveloperLog(disk,{reservedBytes:128});await log.configure(true);
  for(let index=0;index<4;index++)log.add('event '+index,{text:'x'.repeat(700)});
  const save=disk.set;let attempts=0;disk.set=async data=>{if(!attempts++)disk.data.settings={instructions:'y'.repeat(1600)};return save(data);};
  await log.flush();const data=await log.snapshot();assert.equal(attempts,2);assert.equal(data.storageError,false);assert.equal(data.entries.at(-1).event,'event 3');assert.ok(data.dropped>0);
  assert.ok(await disk.getBytesInUse(null)<=disk.QUOTA_BYTES-128);
 });
 await test('A fully occupied shared quota removes logs without touching settings or authentication',async()=>{
  const disk=quotaStorage(256);await disk.set({settings:'x'.repeat(240)});
  const log=new DeveloperLog(disk,{reservedBytes:0});await log.configure(true);log.add('event',{text:'too little space'});await log.flush();
  const data=await log.snapshot();assert.equal(data.entries.length,0);assert.equal(data.dropped,1);assert.equal(data.storageError,false);assert.equal(disk.data[LOG_KEY],undefined);assert.equal(disk.data.settings.length,240);
 });
 await test('Reducing the entry limit trims retained history immediately, even with recording disabled',async()=>{
  const disk=storage(),log=new DeveloperLog(disk);await log.configure(true,1000000);
  for(const event of ['one','two','three','four'])log.add(event);await log.flush();
  await log.configure(true,2);assert.deepEqual(disk.data[LOG_KEY].entries.map(row=>row.event),['three','four']);
  await log.configure(false,1);assert.deepEqual(disk.data[LOG_KEY].entries.map(row=>row.event),['four']);
  await log.configure(true,1000000);log.add('five');await log.flush();assert.equal((await log.snapshot()).maxEntries,1000000);assert.equal(disk.data[LOG_KEY].entries.length,2);
 });
 return {passed:results.filter(row=>row.passed).length,failed:results.filter(row=>!row.passed).length,results};
}
