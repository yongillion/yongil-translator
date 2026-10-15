import {deflateSync} from 'node:zlib';
export function iconPng(size){
 const scale=4,n=size*scale,raw=new Uint8Array(n*n*4);
 const rounded=(x,y,l,t,w,h,r)=>{const dx=Math.max(l+r-x,0,x-(l+w-r)),dy=Math.max(t+r-y,0,y-(t+h-r));return x>=l&&x<=l+w&&y>=t&&y<=t+h&&dx*dx+dy*dy<=r*r;};
 const segment=(x,y,ax,ay,bx,by,width)=>{const d=(bx-ax)**2+(by-ay)**2,t=Math.max(0,Math.min(1,((x-ax)*(bx-ax)+(y-ay)*(by-ay))/d));return (x-ax-(bx-ax)*t)**2+(y-ay-(by-ay)*t)**2<=(width/2)**2;};
 const mix=(a,b,t)=>a.map((v,i)=>Math.round(v*(1-t)+b[i]*t));
 for(let py=0;py<n;py++)for(let px=0;px<n;px++){
  const x=(px+.5)*128/n,y=(py+.5)*128/n;let color=[0,0,0,0];
  if(rounded(x,y,12,14,68,82,17))color=[...mix([52,216,190],[13,148,136],Math.min(1,(x+y)/200)),255];
  if(segment(x,y,27,38,54,38,6)||(size>20&&segment(x,y,27,52,43,52,6)))color=[255,255,255,255];
  if(rounded(x,y,40,28,80,92,21))color=[244,247,255,255];
  if(rounded(x,y,44,32,72,84,17))color=[...mix([113,100,241],[67,56,202],Math.min(1,(y-32)/84)),255];
  if(segment(x,y,61,61,95,61,6)||segment(x,y,85,51,95,61,6)||segment(x,y,95,61,85,71,6)||(size>20&&segment(x,y,61,88,90,88,6)))color=[255,255,255,255];
  raw.set(color,(py*n+px)*4);
 }
 const scan=Buffer.alloc(size*(size*4+1));
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  let alpha=0,rgb=[0,0,0];
  for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const i=((y*scale+dy)*n+x*scale+dx)*4,a=raw[i+3]/255;alpha+=a;for(let c=0;c<3;c++)rgb[c]+=raw[i+c]*a;}
  const i=y*(size*4+1)+1+x*4;for(let c=0;c<3;c++)scan[i+c]=alpha?Math.round(rgb[c]/alpha):0;scan[i+3]=Math.round(alpha/(scale*scale)*255);
 }
 const crc=data=>{let c=0xffffffff;for(const b of data){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
 const chunk=(tag,data)=>{const t=Buffer.from(tag),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);t.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([t,data])),data.length+8);return out;};
 const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
}
