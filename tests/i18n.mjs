import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import vm from 'node:vm';
import {catalogs,mockI18n,localeFetch} from './locale-fixtures.mjs';
import {defaults,sanitizeSettings,fingerprint} from '../extension/lib/settings.mjs';
export async function i18nTests(){
 const results=[];async function test(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.stack||e.message});}}
 await test('English and Korean catalogs have complete matching messages and substitutions',()=>{
  assert.deepEqual(Object.keys(catalogs.en).sort(),Object.keys(catalogs.ko).sort());
  for(const key of Object.keys(catalogs.en)){
   for(const lang of ['en','ko'])assert.ok(catalogs[lang][key].message.trim(),lang+': '+key);
   assert.deepEqual(catalogs.en[key].message.match(/\$[1-9]/g),catalogs.ko[key].message.match(/\$[1-9]/g),key);
  }
 });
 await test('Every static UI, runtime, and manifest message binding resolves',async()=>{
  const files=[];async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=new URL(entry.name+(entry.isDirectory()?'/':''),dir);if(entry.isDirectory()){if(entry.name!=='_locales')await walk(file);}else if(/\.(html|m?js|json)$/.test(entry.name))files.push(file);}}
  await walk(new URL('../extension/',import.meta.url));
  for(const file of files){const source=await readFile(file,'utf8');
   const keys=[...source.matchAll(/(?:\bt|setLabel|setError)\('([^']+)'/g),...source.matchAll(/data-i18n(?:-[\w-]+)?="([^"]+)"/g),...source.matchAll(/__MSG_(\w+)__/g),...source.matchAll(/new AppError\([^,]+,'([^']+)'/g)].map(m=>m[1]);
   for(const key of keys)assert.ok(catalogs.en[key],file.pathname+': '+key);
  }
  const manifest=JSON.parse(await readFile(new URL('../extension/manifest.json',import.meta.url),'utf8'));assert.equal(manifest.default_locale,'en');
 });
 await test('Language preference migrates, validates, and stays outside translation fingerprints',()=>{
  assert.equal(defaults().uiLanguage,'auto');assert.equal(sanitizeSettings({theme:'dark'}).uiLanguage,'auto');
  for(const uiLanguage of ['auto','en','ko'])assert.equal(sanitizeSettings({uiLanguage}).uiLanguage,uiLanguage);
  for(const uiLanguage of ['fr','',null,1])assert.throws(()=>sanitizeSettings({uiLanguage}));
  assert.equal(fingerprint(defaults()),fingerprint(sanitizeSettings({uiLanguage:'ko'})));
 });
 await test('Locale resolution honors explicit selection and English fallback with safe substitutions',async()=>{
  const chrome={i18n:mockI18n('ko-KR'),runtime:{getURL:p=>'chrome-extension://test/'+p}};
  const context=vm.createContext({chrome,fetch:localeFetch}),module=new vm.SourceTextModule(await readFile(new URL('../extension/lib/i18n.mjs',import.meta.url),'utf8'),{context});
  await module.link(()=>{});await module.evaluate();const api=module.namespace;
  for(const [preference,browser,expected] of [['auto','ko-KR','ko'],['auto','en-GB','en'],['auto','de','en'],['en','ko','en'],['ko','en','ko']])assert.equal(api.resolveUILanguage(preference,browser),expected);
  await api.configureLanguage('auto');assert.equal(api.t('restoreBlock'),'이 블록 원문 복원');
  await api.configureLanguage('en');assert.equal(api.t('restoreBlock'),'Restore this block');
  assert.equal(api.t('pageProgress',[3,2]),'3 translated · 2 pending');assert.equal(api.t('translatingTo',['$1 <b>custom</b>']),'Translating into $1 <b>custom</b>');
 });
 await test('On-page messages update in place and survive repeated content-script injection',async()=>{
  const source=await readFile(new URL('../extension/document-core.js',import.meta.url),'utf8'),context=vm.createContext({chrome:{i18n:mockI18n()}});
  vm.runInContext(source,context);const original=context.YTDocument,t=original.t;
  assert.equal(t('restoreBlock'),'이 블록 원문 복원');original.setLocale({language:'en',messages:catalogs.en});
  vm.runInContext(source,context);assert.equal(context.YTDocument,original);assert.equal(t('restoreBlock'),'Restore this block');
  original.setLocale({language:'ko',messages:catalogs.ko});assert.equal(t('restoreConflicts',[2]),'사이트가 변경한 2개 텍스트는 덮어쓰지 않았습니다.');
 });
 return {passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
}
