// Build the public privacy page from the canonical Markdown. No network access.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {iconPng} from './icon-renderer.mjs';
const root=new URL('../',import.meta.url);
await mkdir(new URL('store/assets/',root),{recursive:true});
await writeFile(new URL('store/assets/brand-source-512.png',root),iconPng(512));
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const inline=value=>escape(value).replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g,'<a href="$2">$1</a>').replace(/`([^`]+)`/g,'<code>$1</code>');
const markdown=await readFile(new URL('PRIVACY.md',root),'utf8');
const html=markdown.trim().split(/\r?\n\s*\r?\n/).map(block=>{
 if(block.startsWith('# '))return '<h1>'+inline(block.slice(2))+'</h1>';
 if(block.startsWith('## '))return '<h2>'+inline(block.slice(3))+'</h2>';
 if(block.startsWith('- '))return '<ul>'+block.split(/\r?\n/).map(line=>'<li>'+inline(line.slice(2))+'</li>').join('')+'</ul>';
 return '<p>'+inline(block.replace(/\r?\n/g,' '))+'</p>';
}).join('\n');
await mkdir(new URL('docs/',root),{recursive:true});
await writeFile(new URL('docs/privacy.html',root),`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy — Yongil Translator</title><style>
:root{color-scheme:light dark;font-family:system-ui,sans-serif;line-height:1.75}body{max-width:820px;margin:50px auto;padding:0 24px;color:#26263d;background:#fafbff}a{color:#5146df}h1{font-size:38px;line-height:1.2;letter-spacing:-1px}h2{font-size:23px;margin-top:38px}li{margin:10px 0}nav,footer{font-size:13px;color:#666b80}footer{border-top:1px solid #dce0ec;padding-top:20px;margin-top:40px}@media(prefers-color-scheme:dark){body{background:#191923;color:#e9e8f5}a{color:#b2aaff}}
</style></head><body><nav><a href="https://github.com/yongillion/yongil-translator">Yongil Translator · GitHub</a></nav><main>
${html}
</main><footer>Independent open-source software. Generated from the repository's PRIVACY.md.</footer></body></html>\n`);
console.log('Created docs/privacy.html from PRIVACY.md');
