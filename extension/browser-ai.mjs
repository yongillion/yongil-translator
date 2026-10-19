const frame=document.getElementById('engine');
let port,closing=false,frameReady=false;
function post(message){try{port?.postMessage(message);}catch{}}
function connect(){
 if(closing||!frameReady)return;
 port=chrome.runtime.connect({name:'browser-ai-background'});
 port.onMessage.addListener(message=>frame.contentWindow.runBrowserAI(message,post));
 port.onDisconnect.addListener(()=>{void chrome.runtime.lastError;frame.contentWindow.runBrowserAI({type:'stop',provider:'chrome'},post);frame.contentWindow.runBrowserAI({type:'stop',provider:'translator'},post);if(!closing)setTimeout(connect,500);});
 post({type:'host-ready'});
}
window.addEventListener('message',event=>{
 if(event.source!==frame.contentWindow||event.origin!==location.origin||event.data?.type!=='browser-ai-frame-ready'||frameReady)return;
 frameReady=true;connect();
});
// A module may finish before the parent installs its message listener.
if(typeof frame.contentWindow?.runBrowserAI==='function'){frameReady=true;connect();}
window.addEventListener('pagehide',()=>{closing=true;port?.disconnect();});
setInterval(()=>post({type:'heartbeat'}),20000);
