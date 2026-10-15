import {readFile,readdir} from 'node:fs/promises';
import vm from 'node:vm';
export async function check(){
 const results=[];async function walk(url){
  for(const entry of await readdir(url,{withFileTypes:true})){
   const file=new URL(entry.name+(entry.isDirectory()?'/':''),url);
   if(entry.isDirectory())await walk(file);
   else if(/\.(m?js)$/.test(entry.name)){
    const code=await readFile(file,'utf8');
    if(entry.name.endsWith('.mjs'))new vm.SourceTextModule(code,{identifier:file.href});else new vm.Script(code,{filename:file.href});
    results.push(file.href);
   }
  }
 }await walk(new URL('../extension/',import.meta.url));return {syntaxFiles:results.length};
}
