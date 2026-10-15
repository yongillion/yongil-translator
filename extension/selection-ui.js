/* Text-selection translations stay in a movable dialog and never replace page text. */
(function(scope){
 if(scope.YTSelection)return;
 scope.YTSelection=function({shadow,own,send,isEnabled}){
  const {t}=scope.YTDocument;
  let text='',anchor=null,generation=0,jobId=null,heartbeat=null,drag=null,state='idle',result='',failure=null;
  const make=(tag,className)=>{const el=document.createElement(tag);el.className=className;return el;};
  const style=make('style','');style.textContent=".selection-trigger{position:fixed;z-index:2147483647;box-shadow:0 4px 20px #1113;background:var(--bg);color:var(--fg)}.selection-dialog{position:fixed;z-index:2147483647;width:420px;height:280px;min-width:min(240px,calc(100vw - 16px));min-height:160px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);resize:both;overflow:auto;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 48px #1114;font:13px/1.6 system-ui,sans-serif;box-sizing:border-box}.selection-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0;padding:10px 12px;border-bottom:1px solid var(--line);cursor:move;touch-action:none;user-select:none}.selection-heading strong{font-size:13px}.selection-close{border:0;padding:2px 8px;min-height:28px;font-size:20px}.selection-output{flex:1;min-height:0;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:16px;user-select:text}.selection-resize-note{font-size:10px;color:var(--muted);padding:0 20px 10px 16px;flex-shrink:0}";
  const trigger=make('button','selection-trigger');trigger.type='button';trigger.hidden=true;
  const dialog=make('section','selection-dialog');dialog.hidden=true;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','false');dialog.setAttribute('aria-labelledby','yt-selection-title');
  const heading=make('div','selection-heading'),title=make('strong',''),closeButton=make('button','selection-close'),output=make('div','selection-output'),note=make('small','selection-resize-note');
  title.id='yt-selection-title';closeButton.type='button';closeButton.textContent='×';output.setAttribute('role','status');output.setAttribute('aria-live','polite');
  heading.append(title,closeButton);dialog.append(heading,output,note);shadow.append(style,trigger,dialog);
  function render(){
   if(!isEnabled())trigger.hidden=true;
   trigger.textContent=t('translateSelection');title.textContent=t('selectionResult');heading.title=t('selectionMove');
   closeButton.setAttribute('aria-label',t('close'));closeButton.title=t('close');note.textContent=t('selectionResize');
   dialog.lang=t('uiLocale');output.setAttribute('aria-busy',String(state==='loading'));
   const displayed=state==='loading'?t('translating'):state==='stopped'?t('translationStopped'):state==='error'?(failure?.messageKey?t(failure.messageKey,failure.substitutions||[]):failure?.message||t('translationFailed')):result;
   if(output.textContent!==displayed)output.textContent=displayed;
  }
  function clampPosition(el,left,top){
   const r=el.getBoundingClientRect();el.style.left=Math.max(8,Math.min(left,innerWidth-r.width-8))+'px';el.style.top=Math.max(8,Math.min(top,innerHeight-r.height-8))+'px';
  }
  function cancel(){generation++;if(heartbeat!==null){clearInterval(heartbeat);heartbeat=null;}if(jobId){void send('job.cancel',{jobId}).catch(()=>{});jobId=null;}}
  function close(){cancel();state='idle';dialog.hidden=true;trigger.hidden=true;drag=null;text='';result='';failure=null;render();}
  function stop(){if(state==='loading'){cancel();state='stopped';render();}}
  function protectedElement(node){
   const element=node?.nodeType===1?node:node?.parentElement;
   return !element||element===own||!!element.closest('input,textarea,select,button,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[translate="no"],.notranslate,script,style,pre,code');
  }
  function capture(event){
   if(event.composedPath().includes(own))return;
   trigger.hidden=true;
   if(!isEnabled()||event.button!==0||event.altKey||event.ctrlKey||event.metaKey)return;
   const selection=window.getSelection();
   if(!selection||selection.isCollapsed||!selection.rangeCount||protectedElement(selection.anchorNode)||protectedElement(selection.focusNode))return;
   const range=selection.getRangeAt(0),container=range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;
   for(const editor of container?.querySelectorAll('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[translate="no"],.notranslate,pre,code')||[])if(range.intersectsNode(editor))return;
   const value=selection.toString();if(!value.trim())return;
   text=value;anchor=range.getBoundingClientRect();trigger.hidden=false;render();
   clampPosition(trigger,Number.isFinite(event.clientX)?event.clientX:anchor.left,Number.isFinite(event.clientY)?event.clientY+12:anchor.bottom+8);
  }
  async function translate(){
   if(!isEnabled())return;
   cancel();const request=generation,source=text;trigger.hidden=true;failure=null;result='';state='loading';
   const opening=dialog.hidden;dialog.hidden=false;render();if(opening)clampPosition(dialog,anchor?.left||16,(anchor?.bottom||16)+16);
   closeButton.focus({preventScroll:true});
   if(!source.trim()||source.length>16000){state='error';failure={messageKey:source.trim()?'selectionTooLong':'selectionEmpty'};render();return;}
   let id;
   try{
    const info=await send('job.begin');id=info.id;
    if(request!==generation){await send('job.cancel',{jobId:id}).catch(()=>{});return;}
    jobId=id;heartbeat=setInterval(()=>void send('job.ping').catch(()=>{}),20000);
    const translated=await send('job.batch',{jobId:id,blocks:[{id:'selection',nodes:[{id:'text',text:source}]}]});
    if(request!==generation)return;
    if(typeof translated?.selection?.[0]!=='string')throw Object.assign(new Error(t('resultTextMissing')),{messageKey:'resultTextMissing'});
    result=translated.selection[0];state='complete';render();
   }catch(e){if(request===generation){failure=e;state='error';render();}}
   finally{
    if(request===generation){if(heartbeat!==null)clearInterval(heartbeat);heartbeat=null;jobId=null;}
    if(id)await send('job.end',{jobId:id}).catch(()=>{});
   }
  }
  trigger.addEventListener('pointerdown',e=>e.preventDefault());
  trigger.addEventListener('click',e=>{e.stopPropagation();void translate();});closeButton.addEventListener('click',close);
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}});
  heading.addEventListener('pointerdown',e=>{
   if(e.button!==0||e.composedPath().includes(closeButton))return;
   const r=dialog.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};heading.setPointerCapture(e.pointerId);e.preventDefault();
  });
  heading.addEventListener('pointermove',e=>{if(drag?.id===e.pointerId)clampPosition(dialog,drag.left+e.clientX-drag.x,drag.top+e.clientY-drag.y);});
  const finishDrag=e=>{if(drag?.id===e.pointerId){if(heading.hasPointerCapture(e.pointerId))heading.releasePointerCapture(e.pointerId);drag=null;}};
  heading.addEventListener('pointerup',finishDrag);heading.addEventListener('pointercancel',finishDrag);heading.addEventListener('lostpointercapture',()=>{drag=null;});
  document.addEventListener('pointerup',capture,{capture:true,passive:true});
  document.addEventListener('selectionchange',()=>{if(window.getSelection()?.isCollapsed)trigger.hidden=true;});
  addEventListener('scroll',()=>{trigger.hidden=true;},{capture:true,passive:true});
  addEventListener('resize',()=>{trigger.hidden=true;if(!dialog.hidden){const r=dialog.getBoundingClientRect();clampPosition(dialog,r.left,r.top);}});
  render();return {render,close,stop};
 };
})(globalThis);
