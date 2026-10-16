import {ReadableStream} from 'node:stream/web';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import vm from 'node:vm';
import {defaults,sanitizeSettings,migrateSettings,shortcut,languageLabel} from '../extension/lib/settings.mjs';
import {validateBlocks,parseTranslation,readResponseStream,RequestQueue} from '../extension/lib/protocol.mjs';
import {callbackCode,pkceChallenge,REDIRECT,CLIENT_ID,verifyIdentity,base64url} from '../extension/lib/oauth.mjs';
const tests=[];
const test=(name,fn)=>tests.push({name,fn});
const source=await readFile(new URL('../extension/document-core.js',import.meta.url),'utf8');
const sandbox=vm.createContext({});new vm.Script(source).runInContext(sandbox);
const Store=sandbox.YTDocument.SnapshotStore;
const node=text=>({nodeValue:text,isConnected:true});
const sample=()=>{const s=new Store(),a=node('Hello '),b=node('world'),el={};return {s,a,b,block:s.register(el,[a,b]),el};};
const blocks=[{id:'b1',nodes:[{id:'n0',text:'Hello'}]}];
test('Browser locale is the explicit initial language',()=>{assert.equal(defaults('ko-KR').targetLanguage,'한국어');assert.equal(languageLabel('en-US'),'English');});
test('Editable custom target language survives validation',()=>assert.equal(sanitizeSettings({targetLanguage:'English (plain language)'}).targetLanguage,'English (plain language)'));
test('Settings import rejects credentials and unknown fields',()=>{assert.throws(()=>sanitizeSettings({accessToken:'private'}));assert.throws(()=>sanitizeSettings({schemaVersion:99}));});
test('Settings enforce instruction and input limits',()=>{assert.throws(()=>sanitizeSettings({instructions:'a'.repeat(4001)}));assert.throws(()=>sanitizeSettings({targetLanguage:' '}));});
test('Concurrency defaults, migration, imports, and bounds are validated',()=>{
 assert.equal(defaults().maxConcurrentBatches,8);assert.equal(sanitizeSettings({modelId:'existing'}).maxConcurrentBatches,8);
 for(const n of [1,8,16])assert.equal(sanitizeSettings({maxConcurrentBatches:n}).maxConcurrentBatches,n);
 for(const n of [0,17,1.5,'8',null,NaN,Infinity])assert.throws(()=>sanitizeSettings({maxConcurrentBatches:n}));
});
test('Block selection defaults to Ctrl+Alt on new settings and reset',()=>{
 assert.deepEqual(defaults().blockShortcut,{alt:true,shift:false,ctrl:true,meta:false,code:''});
 assert.equal(defaults().blockShortcutDefaultVersion,2);
 assert.deepEqual(sanitizeSettings({}).blockShortcut,defaults().blockShortcut);
});
test('Legacy block defaults migrate once while custom and disabled shortcuts are retained',()=>{
 const old={alt:true,shift:true,ctrl:false,meta:false,code:''};
 const migrated=migrateSettings({blockShortcut:old});assert.deepEqual(migrated.blockShortcut,defaults().blockShortcut);assert.equal(migrated.blockShortcutDefaultVersion,2);
 for(const blockShortcut of [null,{...old,ctrl:true},{...old,code:'KeyB'}])assert.deepEqual(migrateSettings({blockShortcut}).blockShortcut,blockShortcut);
 const explicit=sanitizeSettings({blockShortcut:old},migrated);assert.deepEqual(migrateSettings(explicit).blockShortcut,old);
 assert.deepEqual(sanitizeSettings({blockShortcut:old}).blockShortcut,old);
 assert.throws(()=>sanitizeSettings({blockShortcutDefaultVersion:3}));
});
test('Page toggle defaults to Ctrl+Alt+T and supports saved, imported, and disabled combinations',()=>{
 const expected={alt:true,shift:false,ctrl:true,meta:false,code:'KeyT'};
 assert.deepEqual(defaults().pageShortcut,expected);assert.deepEqual(sanitizeSettings({modelId:'existing'}).pageShortcut,expected);
 const custom={...expected,alt:false,shift:true,code:'KeyY'};
 assert.deepEqual(migrateSettings({pageShortcut:custom}).pageShortcut,custom);
 assert.deepEqual(sanitizeSettings(JSON.parse(JSON.stringify({pageShortcut:custom}))).pageShortcut,custom);
 assert.equal(sanitizeSettings({pageShortcut:null}).pageShortcut,null);
 assert.throws(()=>sanitizeSettings({pageShortcut:{...expected,code:''}}));
});
test('Shortcuts can be changed or cleared',()=>{assert.equal(shortcut(null),null);assert.equal(shortcut({alt:false,ctrl:true,shift:true,meta:false,code:'KeyY'}).code,'KeyY');});
test('No-key shortcuts without modifiers are rejected',()=>assert.throws(()=>shortcut({alt:false,ctrl:false,shift:false,meta:false,code:''})));
test('PKCE uses the RFC 7636 SHA256 test vector',async()=>assert.equal(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'));
test('OAuth callback requires exact host, port and path',()=>{assert.equal(callbackCode(REDIRECT+'?state=s&code=c','s'),'c');for(const url of ['http://localhost:1456/auth/callback?state=s&code=c','http://localhost:1455/auth/callback/evil?state=s&code=c','https://evil.test/?state=s&code=c'])assert.equal(callbackCode(url,'s'),null);});
test('OAuth missing, duplicate and wrong state are rejected',()=>{for(const q of ['code=c','state=bad&code=c','state=s&state=s&code=c','state=s&code=c&code=d'])assert.throws(()=>callbackCode(REDIRECT+'?'+q,'s'));});
test('OAuth denial is not exchanged as a code',()=>assert.throws(()=>callbackCode(REDIRECT+'?state=s&error=access_denied','s')));
test('Unverified ID tokens are rejected',async()=>await assert.rejects(verifyIdentity('a.b.c','s')));
test('Signed identity requires issuer, audience, nonce and expiry',async()=>{
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='test';jwk.use='sig';
 const issuer='https://auth.openai.com';
 const fetcher=async url=>({ok:true,json:async()=>url.endsWith('openid-configuration')?{issuer,jwks_uri:issuer+'/jwks'}:{keys:[jwk]}});
 const sign=async extra=>{const header=base64url(new TextEncoder().encode(JSON.stringify({alg:'RS256',kid:'test'}))),payload=base64url(new TextEncoder().encode(JSON.stringify({iss:issuer,aud:CLIENT_ID,exp:Date.now()/1000+60,nonce:'n',...extra})));
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(header+'.'+payload));return header+'.'+payload+'.'+base64url(signature);};
 assert.equal((await verifyIdentity(await sign({}), 'n',fetcher)).nonce,'n');
 for(const invalid of [{nonce:'wrong'},{aud:'other'},{iss:'https://evil.test'},{exp:1}])await assert.rejects(verifyIdentity(await sign(invalid),'n',fetcher));
});
test('Translation input rejects oversized and duplicate blocks',()=>{assert.throws(()=>validateBlocks([...blocks,...blocks]));assert.throws(()=>validateBlocks([{id:'b',nodes:[{id:'n',text:'a'.repeat(18001)}]}]));});
test('Response node ids are validated and ordered',()=>assert.deepEqual(parseTranslation('{"blocks":[{"id":"b1","nodes":[{"id":"n0","text":"안녕"}]}]}',blocks),{b1:['안녕']}));
test('Omitted, duplicated and blank translations are rejected',()=>{for(const nodes of [[],[{id:'n0',text:''}],[{id:'n0',text:'a'},{id:'n0',text:'b'}],[{id:'bad',text:'a'}]])assert.throws(()=>parseTranslation(JSON.stringify({blocks:[{id:'b1',nodes}]}),blocks));});
function stream(text,split=3){const bytes=new TextEncoder().encode(text);return new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=split)c.enqueue(bytes.slice(i,i+split));c.close();}});}
test('Streaming handles split UTF8 and CRLF boundaries',async()=>{const s='data: '+JSON.stringify({type:'response.output_text.delta',delta:'한국어'})+'\r\n\r\ndata: '+JSON.stringify({type:'response.completed',response:{status:'completed'}})+'\r\n\r\n';assert.equal(await readResponseStream(stream(s)), '한국어');});
test('Streaming requires a completion event',async()=>await assert.rejects(readResponseStream(stream('data: {"type":"response.output_text.delta","delta":"partial"}\n\n'))));
test('Failed or incomplete streams never apply partial output',async()=>{for(const type of ['response.failed','response.incomplete','error'])await assert.rejects(readResponseStream(stream('data: '+JSON.stringify({type})+'\n\n')));});
test('Block translation restores the exact original text',()=>{const {s,a,b,block}=sample(),t=s.prepare(block,'f');assert.equal(s.apply(t,['안녕 ','세계']),true);assert.equal(a.nodeValue,'안녕 ');s.restore(block);assert.equal(a.nodeValue,'Hello ');assert.equal(b.nodeValue,'world');});
test('Restored block rejects late results',()=>{const {s,a,block}=sample(),t=s.prepare(block,'f');s.restore(block);assert.equal(s.apply(t,['늦은 ','응답']),false);assert.equal(a.nodeValue,'Hello ');});
test('One block restoration leaves another batch result usable',()=>{const {s,a,block}=sample(),other=s.register({},[node('Another')]),t=s.prepare(block,'f'),u=s.prepare(other,'f');s.restore(block);assert.equal(s.apply(t,['늦은','응답']),false);assert.equal(s.apply(u,['다른 문장']),true);assert.equal(a.nodeValue,'Hello ');});
test('Page restoration includes separately translated blocks',()=>{const {s,block}=sample(),other=s.register({},[node('Another')]);s.apply(s.prepare(block,'f'),['안녕 ','세계']);s.apply(s.prepare(other,'f'),['다른 문장']);assert.equal(s.translatedCount(),2);s.restoreAll();assert.equal(s.translatedCount(),0);});
test('Retranslation uses original, not translated, input',()=>{const {s,block}=sample();s.apply(s.prepare(block,'f'),['안녕 ','세계']);assert.equal(s.prepare(block,'new').nodes[0].text,'Hello ');});
test('Site edits are never overwritten during restoration',()=>{const {s,a,b,block}=sample();s.apply(s.prepare(block,'f'),['안녕 ','세계']);a.nodeValue='Updated by site';const r=s.restore(block);assert.equal(r.conflicts,1);assert.equal(a.nodeValue,'Updated by site');assert.equal(b.nodeValue,'world');});
test('Detached nodes prevent stale response application',()=>{const {s,a,block}=sample(),t=s.prepare(block,'f');a.isConnected=false;assert.equal(s.apply(t,['안녕 ','세계']),false);});
test('Site modifications before completion reject entire block',()=>{const {s,a,b,block}=sample(),t=s.prepare(block,'f');a.nodeValue='New content';assert.equal(s.apply(t,['안녕 ','세계']),false);assert.equal(b.nodeValue,'world');});
test('Changing inline grouping preserves originals',()=>{const {s,a,b,block,el}=sample();s.apply(s.prepare(block,'f'),['안녕 ','세계']);const extra=node('!'),next=s.register(el,[a,b,extra]);assert.equal(s.prepare(next,'f').nodes[0].text,'Hello ');});
test('Stop invalidates inflight work while preserving applied text',()=>{const {s,a,block}=sample();s.apply(s.prepare(block,'f'),['안녕 ','세계']);const t=s.prepare(block,'g');s.cancel(block);assert.equal(s.apply(t,['changed','changed']),false);assert.equal(a.nodeValue,'안녕 ');});
test('Global queue respects its configured concurrency',async()=>{const q=new RequestQueue(2);let active=0,peak=0;await Promise.all(Array.from({length:7},(_,i)=>q.run('task'+i,async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;})));assert.equal(peak,2);});
test('Queue limit changes drain running work before starting more',async()=>{
 const q=new RequestQueue(3),releases=[];let started=0;
 const tasks=Array.from({length:6},(_,i)=>q.run('task'+i,()=>new Promise(resolve=>{started++;releases[i]=resolve;})));
 const tick=()=>new Promise(r=>setTimeout(r,0));await tick();assert.equal(started,3);
 q.setLimit(1);releases[0]();releases[1]();await tick();assert.equal(started,3);
 releases[2]();await tick();assert.equal(started,4);
 q.setLimit(2);await tick();assert.equal(started,5);
 releases[3]();releases[4]();await tick();assert.equal(started,6);releases[5]();await Promise.all(tasks);
 assert.throws(()=>q.setLimit(0));assert.throws(()=>q.setLimit(1.5));
});
test('Queue cancellation removes pending and aborts active work',async()=>{const q=new RequestQueue(1);const first=q.run('job:1',signal=>new Promise((resolve,reject)=>{if(signal.aborted)reject(new Error('cancelled'));else signal.addEventListener('abort',()=>reject(new Error('cancelled')));}));const second=q.run('job:2',()=>{throw Error('Should not start');});const outcomes=Promise.allSettled([first,second]);q.cancel('job:');assert.deepEqual((await outcomes).map(x=>x.status),['rejected','rejected']);});
test('Manifest uses local MV3 code and all icon files exist',async()=>{const m=JSON.parse(await readFile(new URL('../extension/manifest.json',import.meta.url),'utf8'));assert.equal(m.manifest_version,3);assert.equal(m.commands,undefined);assert.ok(!m.permissions.includes('activeTab'));assert.ok(!m.permissions.includes('nativeMessaging'));assert.ok(!m.permissions.includes('cookies'));for(const name of Object.values(m.icons)){const bytes=await readFile(new URL('../extension/'+name,import.meta.url));assert.equal(bytes.subarray(1,4).toString(),'PNG');}});
test('UI excludes the source-language auto-detection row',async()=>{const html=await readFile(new URL('../extension/popup.html',import.meta.url),'utf8');assert.ok(!html.includes('원본 언어'));assert.ok(html.includes('role="combobox"'));});
export async function runTests(){
 const results=[];for(const {name,fn} of tests){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.message});}}
 return {passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
}
