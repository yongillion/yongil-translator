import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
export async function packageExtension(){
 const files=[];
 async function walk(url,prefix=''){
  for(const entry of await readdir(url,{withFileTypes:true})){
   const name=prefix+entry.name,file=new URL(entry.name+(entry.isDirectory()?'/':''),url);
   if(entry.isDirectory())await walk(file,name+'/');else files.push({name,bytes:await readFile(file)});
  }
 }
 await walk(new URL('../extension/',import.meta.url));files.push({name:'LICENSE',bytes:await readFile(new URL('../LICENSE',import.meta.url))});files.sort((a,b)=>a.name.localeCompare(b.name));
 const crc=buffer=>{let c=0xffffffff;for(const b of buffer){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
 const records=[],directory=[];let offset=0;
 for(const f of files){
  const name=Buffer.from(f.name),hash=crc(f.bytes),header=Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(33,12);
  header.writeUInt32LE(hash,14);header.writeUInt32LE(f.bytes.length,18);header.writeUInt32LE(f.bytes.length,22);header.writeUInt16LE(name.length,26);
  records.push(header,name,f.bytes);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(33,14);
  central.writeUInt32LE(hash,16);central.writeUInt32LE(f.bytes.length,20);central.writeUInt32LE(f.bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
  directory.push(central,name);offset+=header.length+name.length+f.bytes.length;
 }
 const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
 const manifest=JSON.parse((files.find(f=>f.name==='manifest.json')).bytes.toString()),destination=new URL('../dist/',import.meta.url);
 await mkdir(destination,{recursive:true});
 const output=new URL('yongil-translator-'+manifest.version+'.zip',destination),bytes=Buffer.concat([...records,central,end]);await writeFile(output,bytes);
 return {file:output.pathname,files:files.length,bytes:bytes.length};
}
