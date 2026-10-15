import {t} from './i18n.mjs';
import {AppError} from './protocol.mjs';
import {AUTH_ORIGIN,CLIENT_ID,REDIRECT,randomToken,pkceChallenge,authorizeURL,callbackCode,verifyIdentity} from './oauth.mjs';
let exchange=null,refreshing=null;
const local=chrome.storage.local,session=chrome.storage.session;
export const storageReady=Promise.all([local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})]);
async function tokenRequest(fields){
 let r;try{r=await fetch(AUTH_ORIGIN+'/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CLIENT_ID,...fields}),credentials:'omit',signal:AbortSignal.timeout(25000)});}
 catch{throw new AppError('AUTH_NETWORK','authNetwork');}
 if(!r.ok)throw new AppError('AUTH_EXPIRED','authExpired');
 const data=await r.json();if(typeof data.access_token!=='string'||data.access_token.length<10)throw new AppError('AUTH_RESPONSE','authResponse');
 return data;
}
export async function authStatus(){
 await storageReady;
 const [{auth,authError},{loginAttempt}]=await Promise.all([local.get(['auth','authError']),session.get('loginAttempt')]);
 if(loginAttempt&&loginAttempt.expiresAt>Date.now())return {state:'signing_in'};
 if(!auth)return {state:authError?'reauth_required':'signed_out',message:authError?t(authError.messageKey||'authReconnect',authError.substitutions||[]):''};
 return {state:'connected',email:auth.email||'',accountId:auth.accountId,connectionId:auth.connectionId};
}
export async function startLogin(){
 await storageReady;await cancelLogin();
 const verifier=randomToken(),epoch=randomToken();
 const attempt={verifier,state:randomToken(),nonce:randomToken(),challenge:await pkceChallenge(verifier),expiresAt:Date.now()+300000,epoch,tabId:null,claimed:false};
 await local.set({authEpoch:epoch});await local.remove('authError');
 await session.set({loginAttempt:attempt});
 const tab=await chrome.tabs.create({url:'about:blank',active:true});
 attempt.tabId=tab.id;await session.set({loginAttempt:attempt});
 await chrome.alarms.create('login-watch',{periodInMinutes:0.5});
 await chrome.tabs.update(tab.id,{url:authorizeURL(attempt)});
 return {state:'signing_in'};
}
export async function cancelLogin(expectedState){
 const {loginAttempt}=await session.get('loginAttempt');
 if(expectedState&&loginAttempt?.state!==expectedState)return;
 await session.remove('loginAttempt');await chrome.alarms.clear('login-watch');
 if(loginAttempt?.tabId)await chrome.tabs.remove(loginAttempt.tabId).catch(()=>{});
}
export async function signOut(){
 await storageReady;await local.set({authEpoch:randomToken()});
 await local.remove(['auth','authError','modelCache']);await cancelLogin();
}
export async function observeLogin(tabId,url){
 if(exchange)return exchange;
 const {loginAttempt:a}=await session.get('loginAttempt');
 if(!a||a.tabId!==tabId||a.claimed)return;
 if(a.expiresAt<Date.now()){await local.set({authError:{messageKey:'authTimedOut'}});await cancelLogin();return;}
 let code;try{code=callbackCode(url,a.state);}catch(e){await local.set({authError:{messageKey:e.messageKey||'authLoginFailed',substitutions:e.substitutions||[]}});await cancelLogin();return;}
 if(!code)return;
 exchange=(async()=>{
  try{
   // Persist the claim before exchanging: duplicate navigation events cannot reuse a code.
   await session.set({loginAttempt:{...a,claimed:true}});
   const token=await tokenRequest({grant_type:'authorization_code',code,redirect_uri:REDIRECT,code_verifier:a.verifier});
   const identity=await verifyIdentity(token.id_token,a.nonce);
   const accountId=identity['https://api.openai.com/auth']?.chatgpt_account_id;
   if(typeof accountId!=='string'||!accountId)throw new AppError('AUTH_ACCOUNT','authAccount');
   const {authEpoch}=await local.get('authEpoch');if(authEpoch!==a.epoch)return;
   if(typeof token.refresh_token!=='string')throw new AppError('AUTH_RESPONSE','authRefreshMissing');
   await local.set({auth:{accessToken:token.access_token,refreshToken:token.refresh_token,
    expiresAt:Date.now()+Math.max(60,Math.min(Number(token.expires_in)||3600,86400))*1000,
    accountId,email:identity.email||identity['https://api.openai.com/profile']?.email||'',connectionId:a.epoch}});
   await local.remove(['authError','modelCache']);
  }catch(e){if((await local.get('authEpoch')).authEpoch===a.epoch)await local.set({authError:{messageKey:e.messageKey||'authLoginFailed',substitutions:e.substitutions||[]}});}
  finally{await cancelLogin(a.state);exchange=null;}
 })();return exchange;
}
export async function watchLogin(){
 const {loginAttempt:a}=await session.get('loginAttempt');if(!a)return;
 if(a.expiresAt<Date.now()){await local.set({authError:{messageKey:'authTimedOut'}});await cancelLogin();return;}
 try{const tab=await chrome.tabs.get(a.tabId);await observeLogin(a.tabId,tab.pendingUrl||tab.url||'');}catch{await cancelLogin();}
}
export async function getAuth(force=false){
 await storageReady;const {auth}=await local.get('auth');
 if(!auth)throw new AppError('AUTH_REQUIRED','authRequired');
 if(!force&&auth.expiresAt>Date.now()+90000)return auth;
 if(refreshing)return refreshing;
 refreshing=(async()=>{
  try{
   const token=await tokenRequest({grant_type:'refresh_token',refresh_token:auth.refreshToken});
   const {auth:current,authEpoch}=await local.get(['auth','authEpoch']);
   if(!current||current.connectionId!==auth.connectionId||authEpoch!==auth.connectionId)throw new AppError('AUTH_REQUIRED','authChanged');
   const next={...auth,accessToken:token.access_token,refreshToken:token.refresh_token||auth.refreshToken,expiresAt:Date.now()+Math.max(60,Math.min(Number(token.expires_in)||3600,86400))*1000};
   await local.set({auth:next});return next;
  }catch(e){
   const {auth:current}=await local.get('auth');
   if(e.code==='AUTH_EXPIRED'&&current?.connectionId===auth.connectionId){await local.remove('auth');await local.set({authError:{messageKey:e.messageKey||'authLoginFailed',substitutions:e.substitutions||[]}});}
   throw e;
  }finally{refreshing=null;}
 })();return refreshing;
}
