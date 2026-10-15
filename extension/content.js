(() => {
 if(globalThis.__yongilTranslator)return;
 globalThis.__yongilTranslator=true;
 const {t}=YTDocument;
 // Cache successful results for this document only; restoration keeps them, navigation discards them.
 const store=new YTDocument.SnapshotStore(),jobs=new Map(),cache=new Map();
 let settings=null,enabled=true,held=false,picking=false,hover=null,barVisible=false,lastError='',label='',skipped=0,href=location.href,epoch=0,starting=false;
 let labelMessage=null,errorMessage=null;
 function setPicking(active,notify=true){
  const leaving=picking&&!active;picking=active;
  if(leaving&&notify)void send('selection.finished').catch(()=>{});
  render();
 }
 function setLabel(key,values=[]){labelMessage={key,values};label=t(key,values);}
 function setError(key,values=[]){errorMessage={key,values};lastError=t(key,values);}
 const own=document.createElement('div');own.id='yongil-translator-ui';own.setAttribute('translate','no');
 const shadow=own.attachShadow({mode:'closed'});
 const style=document.createElement('style');style.textContent=":host{all:initial;font-family:system-ui,-apple-system,\"Segoe UI\",sans-serif;color-scheme:light dark;--bg:#fff;--fg:#202238;--muted:#676b80;--line:#e5e7f0;--accent:#4f46e5}\n@media(prefers-color-scheme:dark){:host{--bg:#202130;--fg:#f0f0fa;--muted:#b3b6cc;--line:#42445b;--accent:#aaa5ff}}\n:host([data-theme=\"dark\"]){--bg:#202130;--fg:#f0f0fa;--muted:#b3b6cc;--line:#42445b;--accent:#aaa5ff}\n:host([data-theme=\"light\"]){--bg:#fff;--fg:#202238;--muted:#676b80;--line:#e5e7f0;--accent:#4f46e5}\n*{box-sizing:border-box}[hidden]{display:none!important}\n.bar{position:fixed;z-index:2147483647;bottom:20px;right:20px;max-width:calc(100vw - 40px);display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:18px;box-shadow:0 8px 36px #11112a25;font-size:13px;line-height:1.4}\n.brand{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:linear-gradient(140deg,#4f46e5,#14b8a6);color:white;font-weight:800}\n.info{min-width:170px;max-width:360px;display:grid;gap:3px;margin-right:8px}.detail{font-size:12px;color:var(--muted)}\nbutton{font:inherit;cursor:pointer;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:7px 10px;min-height:32px}\nbutton:hover{border-color:var(--accent)}button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}button:disabled{opacity:.45;cursor:default}.close{border:0;color:var(--muted)}\n.outline{position:fixed;z-index:2147483645;pointer-events:none;border:2px solid #6366f1;background:#6366f112;border-radius:7px;box-shadow:0 0 0 3px #fff9}\n.hint{position:fixed;z-index:2147483646;font-size:12px;line-height:1.4;padding:6px 9px;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:10px;box-shadow:0 4px 20px #1112}\n.hint{pointer-events:none}";shadow.append(style);
 const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el;};
 const bar=make('section','bar');bar.setAttribute('aria-label','Yongil Translator');
 const brand=make('span','brand','Y'),info=make('div','info'),title=make('strong','','Yongil Translator'),detail=make('span','detail',t('pageToolbarDescription'));
 detail.setAttribute('role','status');detail.setAttribute('aria-live','polite');info.append(title,detail);bar.append(brand,info);
 function button(parent,text,action,cls=''){const b=make('button',cls,text);b.type='button';b.addEventListener('click',e=>{e.stopPropagation();action();});parent.append(b);return b;}
 const pickButton=button(bar,t('selectBlock'),()=>setPicking(!picking));
 const stopButton=button(bar,t('stop'),()=>stopAll());
 const retryButton=button(bar,t('retry'),()=>translatePage(true));
 const restoreButton=button(bar,t('restoreOriginal'),()=>restoreAll());
 const closeButton=button(bar,t('close'),()=>{barVisible=false;setPicking(false);},'close');
 const outline=make('div','outline'),hint=make('span','hint');
 shadow.append(bar,outline,hint);
 function mount(){if(!own.isConnected&&document.documentElement)document.documentElement.append(own);}
 const send=async(type,data={})=>{
  const r=await chrome.runtime.sendMessage({type,...data});
  if(!r?.ok){const e=new Error(r?.error?.message||t('connectionLost'));e.code=r?.error?.code;e.messageKey=r?.error?.messageKey;e.substitutions=r?.error?.substitutions;throw e;}
  return r.data;
 };
 const selectionUI=YTSelection({shadow,own,send,isEnabled:()=>enabled&&!held&&!picking});
 function isOwn(event){return event.composedPath().includes(own);}
 function blocked(el){
  if(!el||el===own||el.closest('script,style,noscript,template,pre,code,textarea,input,select,button,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[hidden],[aria-hidden="true"],[translate="no"],.notranslate,#yongil-translator-ui'))return true;
  for(let p=el;p&&p!==document.documentElement;p=p.parentElement){
   const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||s.opacity==='0')return true;
  }
  return false;
 }
 function blockElement(el){
  if(blocked(el))return null;
  let fallback=el;
  for(let p=el;p&&p!==document.body&&p!==document.documentElement;p=p.parentElement){
   if(/^(P|H[1-6]|LI|TD|TH|DT|DD|FIGCAPTION|BLOCKQUOTE|ARTICLE)$/.test(p.tagName))return p;
   if(['block','list-item','table-cell','flex','grid'].includes(getComputedStyle(p).display)){fallback=p;break;}
  }
  return fallback;
 }
 function scan(root=document){
  const groups=new Map();let visited=0;skipped=0;
  const walk=scope=>{
   const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT);
   let node;while((node=walker.nextNode())){
    if(++visited>60000){skipped++;break;}
    if(!node.nodeValue?.trim()||blocked(node.parentElement))continue;
    const el=blockElement(node.parentElement);if(!el)continue;
    if(node.nodeValue.length>16000){skipped++;continue;}
    if(!groups.has(el))groups.set(el,[]);groups.get(el).push(node);
   }
   for(const el of scope.querySelectorAll?.('*')||[]){if(el!==own&&el.shadowRoot&&!blocked(el))walk(el.shadowRoot);}
  };walk(root);return groups;
 }
 function blocksFor(elements){
  const groups=scan(),result=[];
  for(const [el,nodes] of groups){
   if(elements&&!elements.some(x=>x===el||x.contains(el)))continue;
   let chunk=[],size=0;
   const flush=()=>{if(chunk.length){result.push(store.register(el,chunk));chunk=[];size=0;}};
   for(const node of nodes){if(chunk.length&&(size+node.nodeValue.length>12000||chunk.length>=120))flush();chunk.push(node);size+=node.nodeValue.length;}
   flush();
  }
  return result.sort((a,b)=>Math.abs(a.element.getBoundingClientRect().top)-Math.abs(b.element.getBoundingClientRect().top));
 }
 function knownFor(el){return [...store.blocks.values()].filter(b=>b.element===el||el?.contains(b.element));}
 function isTranslated(el){return knownFor(el).some(b=>b.nodes.some(n=>n.ref.isConnected&&n.applied!==n.original&&n.ref.nodeValue===n.applied));}
 function status(){
  const all=[...store.blocks.values()];
  return {translated:store.translatedCount(),running:starting||jobs.size>0,picking,total:all.length,
   pending:all.filter(b=>['queued','translating'].includes(b.state)).length,
   failed:all.filter(b=>b.state==='failed').length,error:lastError,label};
 }
 const allChanged=()=>[...store.blocks.values()].some(b=>b.state==='changed');
 function render(){
  if(labelMessage)label=t(labelMessage.key,labelMessage.values);
  if(lastError&&errorMessage)lastError=t(errorMessage.key,errorMessage.values);
  own.lang=t('uiLocale');selectionUI.render();
  for(const [button,key] of [[pickButton,picking?'exitBlockSelection':'selectBlock'],[stopButton,'stop'],[retryButton,'retry'],[restoreButton,'restoreOriginal'],[closeButton,'close']])button.textContent=t(key);
  mount();const s=status();bar.hidden=!barVisible;own.dataset.theme=settings?.theme||'system';
  title.textContent=picking?t('selectBlockPrompt'):s.running?t('translating'):s.translated?t('translationVisible'):'Yongil Translator';
  detail.textContent=lastError||[label,s.running?t('pageProgress',[s.translated,s.pending]):s.translated?t('translatedBlocks',[s.translated]):t('originalText'),s.failed?t('progressFailed',[s.failed]):'',skipped?t('skippedText',[skipped]):''].filter(Boolean).join(' · ');
  stopButton.hidden=!s.running;retryButton.hidden=!s.failed;restoreButton.disabled=!s.translated&&!s.running&&!allChanged();
  pickButton.setAttribute('aria-pressed',String(picking));paintHover();
 }
 function paintHover(){
  const target=(held||picking)&&enabled?hover:null;
  if(!target?.isConnected){outline.hidden=true;hint.hidden=true;return;}
  const r=target.getBoundingClientRect();if(!r.width||!r.height){outline.hidden=true;hint.hidden=true;return;}
  outline.hidden=false;hint.hidden=false;
  Object.assign(outline.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
  hint.textContent=isTranslated(target)?t('clickRestoreBlock'):t('clickTranslateBlock');
  Object.assign(hint.style,{left:Math.max(8,Math.min(r.left,innerWidth-280))+'px',top:Math.max(8,r.top-34)+'px'});
 }
 function error(e){errorMessage=e.messageKey?{key:e.messageKey,values:e.substitutions||[]}:null;lastError=e.message||t('translationFailed');barVisible=true;render();}
 function cancelEmptyJobs(){
  for(const [id,job] of jobs)if(!job.tickets.some(t=>store.blocks.get(t.id)?.generation===t.generation&&['queued','translating'].includes(store.blocks.get(t.id)?.state))){
   job.cancelled=true;jobs.delete(id);void send('job.cancel',{jobId:id}).catch(()=>{});
  }
 }
 function restoreElement(el){
  let conflicts=0;for(const b of knownFor(el))conflicts+=store.restore(b).conflicts;
  cancelEmptyJobs();if(conflicts)setError('restoreConflicts',[conflicts]);else lastError='';
  setLabel('blockRestored');barVisible=true;render();
 }
 function stopAll(){
  selectionUI.stop();epoch++;starting=false;
  for(const [id,job] of jobs){job.cancelled=true;for(const t of job.tickets){const b=store.blocks.get(t.id);if(b&&b.generation===t.generation)store.cancel(b);}void send('job.cancel',{jobId:id}).catch(()=>{});}
  jobs.clear();setLabel('translationStopped');render();
 }
 function restoreAll(){
  stopAll();const {conflicts}=store.restoreAll();if(conflicts)setError('restoreConflicts',[conflicts]);else lastError='';
  setLabel('pageRestored');barVisible=true;render();
 }
 async function translatePage(failedOnly=false){
  if(starting||[...jobs.values()].some(j=>j.page))return;
  await translateElements(null,failedOnly);
 }
 async function translateElements(elements,failedOnly=false){
  if(!enabled)return;const localEpoch=epoch;barVisible=true;lastError='';starting=true;render();let id;
  try{
   const jobInfo=await send('job.begin');id=jobInfo.id;
   if(localEpoch!==epoch){await send('job.cancel',{jobId:id});return;}
   const selectedBlocks=blocksFor(elements).filter(b=>failedOnly?b.state==='failed':b.state!=='translated'||b.fingerprint!==jobInfo.fingerprint||b.nodes.some(n=>!n.ref.isConnected||n.ref.nodeValue!==n.applied));
   if(!selectedBlocks.length){setLabel(failedOnly?'nothingToRetry':'nothingToTranslate');await send('job.end',{jobId:id});return;}
   const tickets=[];
   for(const b of selectedBlocks){try{tickets.push(store.prepare(b,jobInfo.fingerprint));}catch(e){b.state='changed';b.error=e.message;}}
   const job={tickets,cancelled:false,page:!elements};jobs.set(id,job);starting=false;setLabel('translatingTo',[jobInfo.target]);render();
   const heartbeat=setInterval(()=>void send('job.ping').catch(()=>{}),20000);
   try{
    let offset=0,fatal=false;
    const active=()=>!job.cancelled&&!fatal&&localEpoch===epoch;
    const worker=async()=>{
     while(offset<tickets.length&&active()){
      const batch=[];let size=0;
      while(offset<tickets.length&&batch.length<8){
       const t=tickets[offset],length=t.nodes.reduce((n,x)=>n+x.text.length,0);
       if(batch.length&&size+length>16000)break;
       offset++;if(store.blocks.get(t.id)?.generation!==t.generation)continue;
       const b=store.blocks.get(t.id),cacheKey=JSON.stringify([jobInfo.fingerprint,t.nodes]);
       if(cache.has(cacheKey)){store.apply(t,cache.get(cacheKey));continue;}
       b.state='translating';batch.push(t);size+=length;
      }
      render();if(!batch.length)continue;
      try{
       const output=await send('job.batch',{jobId:id,blocks:batch.map(t=>({id:t.id,nodes:t.nodes}))});
       for(const t of batch){
        if(!active())break;
        if(store.apply(t,output[t.id])){
         const key=JSON.stringify([jobInfo.fingerprint,t.nodes]);cache.set(key,output[t.id]);
        }
       }
      }catch(e){
       if(!active())break;
       for(const t of batch)store.fail(t,e.message);
       if(['AUTH_REQUIRED','ACCOUNT_CHANGED','USAGE_LIMIT','MODEL','MODEL_REQUIRED','ACCESS','INTERRUPTED','EXCLUDED'].includes(e.code)){
        fatal=true;errorMessage=e.messageKey?{key:e.messageKey,values:e.substitutions||[]}:null;lastError=e.message;
        for(const t of tickets){const b=store.blocks.get(t.id);if(b&&['queued','translating'].includes(b.state))store.fail(t,e.message);}
        await send('job.cancel',{jobId:id}).catch(()=>{});
       }else if(e.code!=='CANCELLED'){errorMessage=e.messageKey?{key:e.messageKey,values:e.substitutions||[]}:null;lastError=e.message;}
      }
      render();
     }
    };
    await Promise.all(Array.from({length:Math.min(jobInfo.maxConcurrentBatches||8,tickets.length)},worker));
   }finally{clearInterval(heartbeat);jobs.delete(id);await send('job.end',{jobId:id}).catch(()=>{});}
  }catch(e){error(e);}
  finally{starting=false;render();}
 }
 function matching(event,key){
  return key&&event.altKey===key.alt&&event.shiftKey===key.shift&&event.ctrlKey===key.ctrl&&event.metaKey===key.meta&&(!key.code||event.code===key.code);
 }
 function editable(event){return event.composedPath().some(n=>n instanceof Element&&(n.matches('input,textarea,select,[role="textbox"]')||n.isContentEditable));}
 document.addEventListener('pointermove',e=>{
  if(isOwn(e))return;
  hover=blockElement(e.composedPath().find(n=>n instanceof Element));
  paintHover();
 },{passive:true,capture:true});
 document.addEventListener('keydown',e=>{
  if(!enabled||e.isComposing||editable(e))return;
  if(matching(e,settings?.cancelShortcut)&&(held||picking)){held=false;e.preventDefault();setPicking(false);return;}
  if(isOwn(e))return;
  if(matching(e,settings?.pageShortcut)){
   e.preventDefault();e.stopImmediatePropagation();held=false;paintHover();
   if(!e.repeat)void send('page.toggle').catch(error);return;
  }
  const modifier=/^(Alt|Shift|Control|Meta)(Left|Right)$/.test(e.code);
  held=matching(e,settings?.blockShortcut)&&(!!settings.blockShortcut.code||modifier);paintHover();
 },true);
 document.addEventListener('keyup',e=>{
  if(!settings?.blockShortcut)return;
  held=!settings.blockShortcut.code&&matching(e,settings.blockShortcut)&&!editable(e);paintHover();
 },true);
 document.addEventListener('click',e=>{
  const shortcut=settings?.blockShortcut;
  const shortcutHeld=shortcut&&(shortcut.code?held&&matching(e,{...shortcut,code:''}):matching(e,shortcut));
  if(!enabled||(!shortcutHeld&&!picking)||e.button!==0||isOwn(e)||editable(e))return;
  const el=blockElement(e.composedPath().find(n=>n instanceof Element));if(!el)return;
  e.preventDefault();e.stopImmediatePropagation();hover=el;
  if(isTranslated(el))restoreElement(el);else void translateElements([el]);render();
 },true);
 addEventListener('blur',()=>{held=false;paintHover();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){held=false;setPicking(false);}});
 addEventListener('scroll',paintHover,{passive:true,capture:true});addEventListener('resize',paintHover,{passive:true});
 chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id)return;
  switch(message.type){
   case 'content.enable':settings=message.settings;YTDocument.setLocale(message.locale);enabled=!settings.excludedSites.includes(location.hostname);lastError='';render();break;
   case 'page.translate':void translatePage();break;
   case 'page.retry':void translatePage(true);break;
   case 'page.restore':restoreAll();break;
   case 'page.stop':case 'job.stop':stopAll();break;
   case 'page.select':barVisible=true;setPicking(typeof message.active==='boolean'?message.active:!picking,false);break;
   case 'selection.cancel':held=false;setPicking(false,false);break;
   case 'page.status':break;
   case 'cache.clear':cache.clear();break;
   case 'settings.changed':settings=message.settings;YTDocument.setLocale(message.locale);enabled=!settings.excludedSites.includes(location.hostname);if(!enabled){held=false;setPicking(false);stopAll();selectionUI.close();}render();break;
   case 'permissions.changed':stopAll();selectionUI.close();enabled=false;held=false;picking=false;setError('permissionsChanged');render();break;
   default:return;
  }
  reply(status());
 });
 setInterval(()=>{
  if(href!==location.href){stopAll();selectionUI.close();store.restoreAll();store.blocks.clear();store.byElement=new WeakMap();cache.clear();href=location.href;hover=null;setLabel('pageChanged');lastError='';render();}
 },1000);
 send('content.init').then(data=>{settings=data.settings;YTDocument.setLocale(data.locale);enabled=!settings.excludedSites.includes(location.hostname);render();}).catch(e=>{enabled=false;error(e);});
})();