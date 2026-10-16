(() => {
 if(globalThis.__yongilTranslator)return;
 globalThis.__yongilTranslator=true;
 const {t}=YTDocument;
 // Cache successful results for this document only; restoration keeps them, navigation discards them.
 const store=new YTDocument.SnapshotStore(),jobs=new Map(),cache=new Map();
 let settings=null,enabled=true,held=false,picking=false,hover=null,barVisible=false,lastError='',label='',skipped=0,href=location.href,epoch=0,starting=false;
 let labelMessage=null,errorMessage=null,viewportVersion=0;
 function setPicking(active,notify=true){
  const leaving=picking&&!active;picking=active;
  if(leaving&&notify)void send('selection.finished').catch(()=>{});
  render();
 }
 function setLabel(key,values=[]){labelMessage={key,values};label=t(key,values);}
 function setError(key,values=[]){errorMessage={key,values};lastError=t(key,values);}
 const own=document.createElement('div');own.id='yongil-translator-ui';own.setAttribute('translate','no');
 const shadow=own.attachShadow({mode:'closed'});
 const style=document.createElement('style');style.textContent=":host{all:initial;font-family:system-ui,-apple-system,\"Segoe UI\",sans-serif;color-scheme:light dark;--bg:#fff;--fg:#202238;--muted:#676b80;--line:#e5e7f0;--accent:#4f46e5}\n@media(prefers-color-scheme:dark){:host{--bg:#202130;--fg:#f0f0fa;--muted:#b3b6cc;--line:#42445b;--accent:#aaa5ff}}\n:host([data-theme=\"dark\"]){--bg:#202130;--fg:#f0f0fa;--muted:#b3b6cc;--line:#42445b;--accent:#aaa5ff}\n:host([data-theme=\"light\"]){--bg:#fff;--fg:#202238;--muted:#676b80;--line:#e5e7f0;--accent:#4f46e5}\n*{box-sizing:border-box}[hidden]{display:none!important}\n.bar{position:fixed;z-index:2147483647;bottom:20px;right:20px;max-width:calc(100vw - 40px);display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:16px 12px 12px;overflow:hidden;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:18px;box-shadow:0 8px 36px #11112a25;font-size:13px;line-height:1.4}\n.brand{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:linear-gradient(140deg,#4f46e5,#14b8a6);color:white;font-weight:800}\n.info{min-width:170px;max-width:360px;display:grid;gap:3px;margin-right:8px}.detail{font-size:12px;color:var(--muted)}\nbutton{font:inherit;cursor:pointer;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:7px 10px;min-height:32px}\nbutton:hover{border-color:var(--accent)}button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}button:disabled{opacity:.45;cursor:default}.close{border:0;color:var(--muted)}\n.outline{position:fixed;z-index:2147483645;pointer-events:none;border:2px solid #6366f1;background:#6366f112;border-radius:7px;box-shadow:0 0 0 3px #fff9}\n.hint{position:fixed;z-index:2147483646;font-size:12px;line-height:1.4;padding:6px 9px;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:10px;box-shadow:0 4px 20px #1112}\n.hint{pointer-events:none}";shadow.append(style);
 style.textContent+=".translation-progress{position:absolute;top:0;left:0;right:0;height:4px;background:var(--line);overflow:hidden;pointer-events:none}.translation-progress-fill{display:block;width:100%;height:100%;background:linear-gradient(90deg,var(--accent),#14b8a6);transform:scaleX(0);transform-origin:left center;transition:transform .18s ease}.translation-progress[data-indeterminate=\"true\"] .translation-progress-fill{width:35%;animation:translation-loading 1.2s ease-in-out infinite}.info-heading{display:flex;align-items:center;gap:6px 12px;flex-wrap:wrap}.block-count{font-size:12px;font-weight:650;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--accent)}button.primary{background:#4f46e5;border-color:#4f46e5;color:#fff}button.primary:hover{background:#4338ca}@keyframes translation-loading{from{transform:translateX(-110%)}to{transform:translateX(390%)}}@media(prefers-reduced-motion:reduce){.translation-progress-fill{transition:none}.translation-progress[data-indeterminate=\"true\"] .translation-progress-fill{animation:none;transform:translateX(90%)!important}}";
 style.textContent+=".bar{overflow:visible}.translation-progress{border-radius:18px 18px 0 0}.bar>.close{position:absolute;top:-13px;right:-13px;width:28px;height:28px;min-height:28px;padding:0;display:grid;place-items:center;border:1px solid var(--line);border-radius:50%;background:var(--bg);color:var(--muted);font:22px/1 system-ui,sans-serif;box-shadow:0 3px 10px #11112a25}.bar>.close:hover{color:var(--fg);border-color:var(--accent);background:var(--bg)}";
 const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el;};
 const bar=make('section','bar');bar.setAttribute('aria-label','Yongil Translator');
 const progress=make('div','translation-progress'),progressFill=make('span','translation-progress-fill');
 progress.setAttribute('role','progressbar');progress.setAttribute('aria-valuemin','0');progress.append(progressFill);
 const brand=make('span','brand','Y'),info=make('div','info'),title=make('strong','','Yongil Translator'),detail=make('span','detail',t('pageToolbarDescription'));
 const infoHeading=make('div','info-heading'),blockCount=make('span','block-count');
 blockCount.setAttribute('role','status');blockCount.setAttribute('aria-live','polite');blockCount.setAttribute('aria-atomic','true');
 detail.setAttribute('role','status');detail.setAttribute('aria-live','polite');infoHeading.append(title,blockCount);info.append(infoHeading,detail);bar.append(progress,brand,info);
 function button(parent,text,action,cls=''){const b=make('button',cls,text);b.type='button';b.addEventListener('click',e=>{e.stopPropagation();action();});parent.append(b);return b;}
 const translateButton=button(bar,t('translatePage'),()=>{if(!translateButton.disabled)void send('page.translate').catch(error);},'primary');
 const pickButton=button(bar,t('selectBlock'),()=>setPicking(!picking));
 const stopButton=button(bar,t('stop'),()=>stopAll());
 const retryButton=button(bar,t('retry'),()=>translatePage(true));
 const restoreButton=button(bar,t('restoreOriginal'),()=>restoreAll());
 const closeButton=button(bar,'×',()=>{barVisible=false;setPicking(false);},'close');
 const outline=make('div','outline'),hint=make('span','hint');
 shadow.append(bar,outline,hint);
 function mount(){if(!own.isConnected&&document.documentElement)document.documentElement.append(own);}
 const send=async(type,data={})=>{
  const r=await chrome.runtime.sendMessage({type,...data});
  if(!r?.ok){const e=new Error(r?.error?.message||t('connectionLost'));e.code=r?.error?.code;e.messageKey=r?.error?.messageKey;e.substitutions=r?.error?.substitutions;throw e;}
  return r.data;
 };
 function debug(event,blocks){if(settings?.developerMode)void send('log.event',{event,blocks}).catch(()=>{});}
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
  return result;
 }
 function prioritizePending(tickets,offset,order){
  const view=globalThis.visualViewport,left=view?.offsetLeft||0,top=view?.offsetTop||0;
  const right=left+(view?.width||document.documentElement.clientWidth||innerWidth);
  const bottom=top+(view?.height||document.documentElement.clientHeight||innerHeight);
  const priorities=new Map();
  const ranked=tickets.slice(offset).map(ticket=>{
   const element=store.blocks.get(ticket.id)?.element;
   if(!priorities.has(element)){
    const r=element?.getBoundingClientRect();
    let visible=false,distance=Infinity;
    if(r?.width>0&&r.height>0){
     visible=r.right>left&&r.left<right&&r.bottom>top&&r.top<bottom;
     distance=Math.hypot(Math.max(left-r.right,r.left-right,0),Math.max(top-r.bottom,r.top-bottom,0));
    }
    priorities.set(element,{visible,distance});
   }
   return {ticket,...priorities.get(element)};
  });
  // Measure each element once, then sort without more layout reads. Keep document order for ties.
  ranked.sort((a,b)=>Number(b.visible)-Number(a.visible)||a.distance-b.distance||order.get(a.ticket)-order.get(b.ticket));
  ranked.forEach(({ticket},index)=>{tickets[offset+index]=ticket;});
 }
 function viewportChanged(){
  viewportVersion++;paintHover();
 }
 function knownFor(el){return [...store.blocks.values()].filter(b=>b.element===el||el?.contains(b.element));}
 function isTranslated(el){return knownFor(el).some(b=>b.nodes.some(n=>n.ref.isConnected&&n.applied!==n.original&&n.ref.nodeValue===n.applied));}
 function status(){
  const all=[...store.blocks.values()].filter(b=>b.nodes.some(n=>n.ref.isConnected));
  const completed=all.filter(b=>b.state==='translated'&&b.nodes.every(n=>n.ref.isConnected&&n.ref.nodeValue===n.applied)).length;
  return {translated:store.translatedCount(),completed,running:starting||jobs.size>0,picking,total:all.length,
   pending:all.filter(b=>['queued','translating'].includes(b.state)).length,
   failed:all.filter(b=>b.state==='failed').length,error:lastError,label};
 }
 const allChanged=()=>[...store.blocks.values()].some(b=>b.state==='changed');
 function render(){
  if(labelMessage)label=t(labelMessage.key,labelMessage.values);
  if(lastError&&errorMessage)lastError=t(errorMessage.key,errorMessage.values);
  own.lang=t('uiLocale');selectionUI.render();
  for(const [button,key] of [[translateButton,'translatePage'],[pickButton,picking?'exitBlockSelection':'selectBlock'],[stopButton,'stop'],[retryButton,'retry'],[restoreButton,'restoreOriginal']])button.textContent=t(key);
  closeButton.setAttribute('aria-label',t('close'));closeButton.title=t('close');
  mount();const s=status();bar.hidden=!barVisible;own.dataset.theme=settings?.theme||'system';
  const countLabel=t('pageProgress',[s.completed,s.total]);
  blockCount.hidden=!s.total;blockCount.textContent=countLabel;
  progress.hidden=!s.running&&!s.total;progress.dataset.indeterminate=String(starting);
  progress.setAttribute('aria-label',t('translationProgress'));progress.setAttribute('aria-valuemax',String(s.total||1));
  if(starting){progress.removeAttribute('aria-valuenow');progress.setAttribute('aria-valuetext',t('translating'));}
  else{progress.setAttribute('aria-valuenow',String(s.completed));progress.setAttribute('aria-valuetext',countLabel);}
  progressFill.style.transform='scaleX('+(s.total?s.completed/s.total:0)+')';
  translateButton.disabled=!enabled||s.running;
  title.textContent=picking?t('selectBlockPrompt'):s.running?t('translating'):s.translated?t('translationVisible'):'Yongil Translator';
  detail.textContent=lastError||[label,!s.running?(s.translated?t('translatedBlocks',[s.translated]):t('originalText')):'',s.failed?t('progressFailed',[s.failed]):'',skipped?t('skippedText',[skipped]):''].filter(Boolean).join(' · ');
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
  viewportVersion++;
  debug('restore.block',knownFor(el).length);
  cancelEmptyJobs();if(conflicts)setError('restoreConflicts',[conflicts]);else lastError='';
  setLabel('blockRestored');barVisible=true;render();
 }
 function stopAll(){
  debug('translation.stopped');
  selectionUI.stop();epoch++;starting=false;
  for(const [id,job] of jobs){job.cancelled=true;for(const t of job.tickets){const b=store.blocks.get(t.id);if(b&&b.generation===t.generation)store.cancel(b);}void send('job.cancel',{jobId:id}).catch(()=>{});}
  jobs.clear();setLabel('translationStopped');render();
 }
 function restoreAll(){
  stopAll();const {conflicts}=store.restoreAll();if(conflicts)setError('restoreConflicts',[conflicts]);else lastError='';
  viewportVersion++;
  debug('restore.page',store.blocks.size);
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
    let offset=0,fatal=false,orderVersion=-1;
    const order=new Map(tickets.map((ticket,index)=>[ticket,index]));
    const active=()=>!job.cancelled&&!fatal&&localEpoch===epoch;
    const worker=async()=>{
     while(offset<tickets.length&&active()){
      // Reorder only unsent work after scrolling, resizing, or translated text changes layout.
      if(orderVersion!==viewportVersion){prioritizePending(tickets,offset,order);orderVersion=viewportVersion;}
      const batch=[];let size=0;
      while(offset<tickets.length&&batch.length<8){
       const t=tickets[offset],length=t.nodes.reduce((n,x)=>n+x.text.length,0);
       if(batch.length&&size+length>16000)break;
       offset++;if(store.blocks.get(t.id)?.generation!==t.generation)continue;
       const b=store.blocks.get(t.id),cacheKey=JSON.stringify([jobInfo.fingerprint,t.nodes]);
       if(cache.has(cacheKey)){if(store.apply(t,cache.get(cacheKey))){viewportVersion++;debug('cache.hit',1);}continue;}
       b.state='translating';batch.push(t);size+=length;
      }
      render();if(!batch.length)continue;
      try{
       const output=await send('job.batch',{jobId:id,blocks:batch.map(t=>({id:t.id,nodes:t.nodes}))});
       for(const t of batch){
        if(!active())break;
        if(store.apply(t,output[t.id])){
         viewportVersion++;
         debug('translation.applied',1);
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
    await Promise.all(Array.from({length:Math.min(jobInfo.maxConcurrentBatches||16,tickets.length)},worker));
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
  const pageCommand=matching(e,settings?.pageShortcut)?'page.translate':matching(e,settings?.restoreShortcut)?'page.restore':null;
  if(pageCommand){
   e.preventDefault();e.stopImmediatePropagation();held=false;paintHover();
   if(!e.repeat)void send(pageCommand).catch(error);return;
  }
  const modifier=/^(Alt|Shift|Control|Meta)(Left|Right)$/.test(e.code);
  held=matching(e,settings?.blockShortcut)&&(!!settings.blockShortcut.code||modifier);
  // A held Alt selection gesture should not move focus to the browser menu.
  if(held&&/^Alt(Left|Right)$/.test(e.code))e.preventDefault();
  paintHover();
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
 addEventListener('scroll',viewportChanged,{passive:true,capture:true});addEventListener('resize',viewportChanged,{passive:true});
 globalThis.visualViewport?.addEventListener('scroll',viewportChanged,{passive:true});
 globalThis.visualViewport?.addEventListener('resize',viewportChanged,{passive:true});
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
