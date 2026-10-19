// Opt-in diagnostics stay in trusted extension storage. Never pass authentication material here.
export const LOG_KEY='developerLogs',MAX_LOG_ENTRIES=4000;
const DEFAULT_LOCAL_QUOTA_BYTES=10*1024*1024,STORAGE_HEADROOM=64*1024;
const byteLength=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const secretKey=/^(authorization|proxyauthorization|cookie|setcookie|apikey|xapikey|openaikey|anthropickey|claudekey|accesstoken|refreshtoken|idtoken|clientsecret|password|codeverifier)$/i;
export function redact(value){
 if(typeof value==='string')return value.replace(/Bearer\s+[^\s"<>]+/gi,'Bearer [REDACTED]').replace(/\bsk-[A-Za-z0-9_*-]{8,}/g,'[REDACTED]');
 if(Array.isArray(value))return value.map(redact);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,secretKey.test(key.replace(/[-_]/g,''))?'[REDACTED]':redact(item)]));
 return value;
}
export class DeveloperLog{
 constructor(storage,{maxEntries=MAX_LOG_ENTRIES,maxBytes=storage.QUOTA_BYTES??DEFAULT_LOCAL_QUOTA_BYTES,reservedBytes=STORAGE_HEADROOM,delay=250}={}){
  this.storage=storage;this.maxEntries=maxEntries;this.maxBytes=maxBytes;this.quotaBytes=maxBytes;this.reservedBytes=reservedBytes;this.delay=delay;
  this.enabled=false;this.entries=[];this.dropped=0;this.timer=null;this.revision=0;this.persisted=0;this.writes=Promise.resolve();
 }
 async init(){
  if(!this.ready)this.ready=this.storage.get(LOG_KEY).then(data=>{
   const saved=data[LOG_KEY];if(saved?.version===1&&Array.isArray(saved.entries)){this.entries=saved.entries;this.dropped=saved.dropped||0;}
  }).catch(()=>{});
  await this.ready;
 }
 async configure(enabled,maxEntries=this.maxEntries){
  await this.init();this.enabled=!!enabled;this.maxEntries=maxEntries;
  const trim=this.entries.length>maxEntries;if(trim)this.changed();
  if(!enabled||trim)await this.flush();
 }
 add(event,details={},level='info'){
  if(!this.enabled)return null;
  const id=crypto.randomUUID();this.entries.push({id,time:new Date().toISOString(),level,event,details});this.changed();return id;
 }
 update(id,details){
  if(!this.enabled||!id)return;
  const entry=this.entries.find(row=>row.id===id);if(entry){entry.details=details;this.changed();}
 }
 changed(){this.revision++;if(!this.timer)this.timer=setTimeout(()=>{this.timer=null;void this.flush();},this.delay);}
 async refreshBudget(){
  if(!this.storage.getBytesInUse)return;
  const [used,logs]=await Promise.all([this.storage.getBytesInUse(null),this.storage.getBytesInUse(LOG_KEY)]);
  // The native quota is shared with credentials, preferences and the model list.
  // Leave a small margin for concurrent token refreshes and settings updates.
  this.maxBytes=Math.max(0,this.quotaBytes-Math.max(0,used-logs)-this.reservedBytes);
 }
 bounded(){
  let removed=Math.max(0,this.entries.length-this.maxEntries);
  if(removed){this.entries=this.entries.slice(removed);this.dropped+=removed;}
  let entries=this.entries.map(redact);
  const sizes=entries.map(byteLength);let payload=sizes.reduce((sum,size)=>sum+size,0),start=0;
  const size=()=>LOG_KEY.length+byteLength({version:1,entries:[],dropped:this.dropped})+payload+Math.max(0,entries.length-start-1);
  while(start<entries.length&&size()>this.maxBytes){
   // Keep oversized diagnostics discoverable without exceeding the local storage budget.
   if(entries.length-start===1&&!entries[start].details?.omitted){
    const notice={...entries[start],details:{omitted:true,reason:'Entry exceeded the diagnostic storage limit'}};
    if(LOG_KEY.length+byteLength({version:1,entries:[notice],dropped:this.dropped+1})<=this.maxBytes){
     entries[start]=this.entries[start]=notice;this.dropped++;removed++;break;
    }
   }
   payload-=sizes[start++];this.dropped++;removed++;
  }
  if(start){entries=entries.slice(start);this.entries=this.entries.slice(start);}
  if(removed)this.changed();
  return {version:1,entries,dropped:this.dropped};
 }
 async snapshot(){await this.init();await this.refreshBudget().catch(()=>{this.storageError=true;});return {...this.bounded(),enabled:this.enabled,storageError:!!this.storageError,maxEntries:this.maxEntries,maxBytes:this.maxBytes};}
 async flush(){
  if(this.timer){clearTimeout(this.timer);this.timer=null;}
  await this.init();
  this.writes=this.writes.catch(()=>{}).then(async()=>{
   if(this.persisted===this.revision)return;
   for(let attempt=0;attempt<2;attempt++){
    try{
     await this.refreshBudget();const data=this.bounded(),revision=this.revision;
     if(!data.entries.length&&LOG_KEY.length+byteLength(data)>this.maxBytes&&this.storage.remove)await this.storage.remove(LOG_KEY);
     else await this.storage.set({[LOG_KEY]:data});
     this.persisted=revision;this.storageError=false;return;
    }catch(error){
     // Another trusted page may have saved settings since the quota check.
     if(!attempt&&/quota/i.test(error?.message||''))continue;
     this.storageError=true;return;
    }
   }
  });
  await this.writes;
 }
 async clear(){await this.init();this.entries=[];this.dropped=0;this.revision++;await this.flush();}
}
export const developerLog=new DeveloperLog({
 get QUOTA_BYTES(){return globalThis.chrome?.storage.local.QUOTA_BYTES??DEFAULT_LOCAL_QUOTA_BYTES;},
 get:keys=>chrome.storage.local.get(keys),set:value=>chrome.storage.local.set(value),remove:keys=>chrome.storage.local.remove(keys),
 getBytesInUse:keys=>chrome.storage.local.getBytesInUse?chrome.storage.local.getBytesInUse(keys):Promise.resolve(0)
});
