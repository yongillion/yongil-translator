/* Shared between the isolated content world and regression tests. No page globals are trusted. */
(function(scope){
 if(scope.YTDocument)return;
 let locale={messages:{}};
 function t(key,substitutions=[]){
  const values=(Array.isArray(substitutions)?substitutions:[substitutions]).map(String),message=locale.messages[key]?.message;
  return message!==undefined?message.replace(/\$([1-9])/g,(_,i)=>values[Number(i)-1]??''):scope.chrome?.i18n?.getMessage?.(key,values)||key;
 }
 function setLocale(next){if(next?.messages)locale=next;}
 class SnapshotStore {
  constructor(){this.blocks=new Map();this.byElement=new WeakMap();this.sequence=0;}
  register(element,nodes){
   let blocks=this.byElement.get(element)||[];
   const same=blocks.find(b=>b.nodes.length===nodes.length&&b.nodes.every((n,i)=>n.ref===nodes[i]));
   if(same)return same;
   // A site can regroup existing text nodes. Restore tracked overlaps before resnapshotting.
   const overlaps=blocks.filter(b=>b.nodes.some(n=>nodes.includes(n.ref)));
   for(const old of overlaps){this.restore(old);this.blocks.delete(old.id);}
   blocks=blocks.filter(b=>!overlaps.includes(b));
   const block={id:'b'+(++this.sequence),element,nodes:nodes.map((ref,i)=>({id:'n'+i,ref,original:ref.nodeValue,applied:ref.nodeValue})),generation:0,revision:0,state:'original',fingerprint:'',error:''};
   this.blocks.set(block.id,block);blocks.push(block);this.byElement.set(element,blocks);return block;
  }
  prepare(block,fingerprint){
   block.generation++;block.error='';
   let changed=false;
   for(const node of block.nodes){
    if(!node.ref.isConnected)throw Error(t('pageContentChanged'));
    if(node.ref.nodeValue!==node.applied){node.original=node.ref.nodeValue;node.applied=node.ref.nodeValue;changed=true;}
   }
   if(changed)block.revision++;
   block.state='queued';
   return {id:block.id,generation:block.generation,revision:block.revision,fingerprint,
    expected:block.nodes.map(n=>n.ref.nodeValue),nodes:block.nodes.map(n=>({id:n.id,text:n.original}))};
  }
  apply(ticket,values){
   const b=this.blocks.get(ticket.id);
   if(!b||b.generation!==ticket.generation||b.revision!==ticket.revision)return false;
   if(!Array.isArray(values)||values.length!==b.nodes.length||values.some(x=>typeof x!=='string'))return false;
   if(b.nodes.some((n,i)=>!n.ref.isConnected||n.ref.nodeValue!==ticket.expected[i])){
    b.generation++;b.state='changed';b.error=t('resultNotApplied');return false;
   }
   b.nodes.forEach((n,i)=>{n.ref.nodeValue=values[i];n.applied=values[i];});
   b.state='translated';b.fingerprint=ticket.fingerprint;b.error='';return true;
  }
  fail(ticket,message){
   const b=this.blocks.get(ticket.id);if(!b||b.generation!==ticket.generation)return;
   b.state='failed';b.error=message;
  }
  cancel(block){block.generation++;if(['queued','translating'].includes(block.state))block.state=block.nodes.some(n=>n.original!==n.applied)?'translated':'original';}
  restore(block){
   block.generation++;let conflicts=0;
   for(const n of block.nodes){
    if(n.applied===n.original){if(n.ref.isConnected&&n.ref.nodeValue!==n.original){n.original=n.ref.nodeValue;n.applied=n.original;}continue;}
    if(!n.ref.isConnected){conflicts++;continue;}
    if(n.ref.nodeValue===n.applied){n.ref.nodeValue=n.original;n.applied=n.original;}
    else if(n.ref.nodeValue!==n.original)conflicts++;
   }
   block.state=conflicts?'changed':'original';block.error=conflicts?t('partialRestore'):'';block.fingerprint='';
   return {conflicts};
  }
  restoreAll(){let conflicts=0;for(const b of this.blocks.values())conflicts+=this.restore(b).conflicts;return {conflicts};}
  translatedCount(){return [...this.blocks.values()].filter(b=>b.nodes.some(n=>n.ref.isConnected&&n.ref.nodeValue===n.applied&&n.applied!==n.original)).length;}
 }
 scope.YTDocument={SnapshotStore,t,setLocale};
})(globalThis);
