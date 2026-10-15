import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const allowed=new Map([['/fixture.html','fixture.html'],['/fixture-frame.html','fixture-frame.html']]);
createServer(async(req,res)=>{const name=allowed.get(new URL(req.url,'http://localhost').pathname);if(!name){res.writeHead(404);res.end('Not found');return;}try{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(await readFile(new URL('../tests/'+name,import.meta.url)));}catch{res.writeHead(500);res.end('Fixture unavailable');}}).listen(3185,'127.0.0.1',()=>console.log('Test fixture: http://localhost:3185/fixture.html'));
