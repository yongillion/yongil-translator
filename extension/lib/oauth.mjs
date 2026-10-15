import {t} from './i18n.mjs';
import {AppError} from './protocol.mjs';
export const AUTH_ORIGIN='https://auth.openai.com';
export const CLIENT_ID='app_EMoamEEZ73f0CkXaXp7hrann';
export const REDIRECT='http://localhost:1455/auth/callback';
export const base64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export function randomToken(){return base64url(crypto.getRandomValues(new Uint8Array(32)));}
export async function pkceChallenge(verifier){return base64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));}
export function callbackCode(url,state){
 let u;try{u=new URL(url);}catch{return null;}
 const expected=new URL(REDIRECT);
 if(u.origin!==expected.origin||u.pathname!==expected.pathname||u.username||u.password)return null;
 if(!state||u.searchParams.getAll('state').length!==1||u.searchParams.get('state')!==state)throw new AppError('AUTH_STATE','authState');
 if(u.searchParams.has('error'))throw new AppError('AUTH_DENIED','authDenied');
 if(u.searchParams.getAll('code').length!==1||!u.searchParams.get('code'))throw new AppError('AUTH_CODE','authCodeMissing');
 return u.searchParams.get('code');
}
export function authorizeURL(attempt){
 const u=new URL(AUTH_ORIGIN+'/oauth/authorize');
 u.search=new URLSearchParams({client_id:CLIENT_ID,response_type:'code',redirect_uri:REDIRECT,
 scope:'openid profile email offline_access',code_challenge:attempt.challenge,code_challenge_method:'S256',
 state:attempt.state,nonce:attempt.nonce,originator:'codex_cli_rs',codex_cli_simplified_flow:'true',id_token_add_organizations:'true'}).toString();
 return u.href;
}
function decodePart(part){
 const b64=part.replaceAll('-','+').replaceAll('_','/');
 return Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length/4)*4,'=')),x=>x.charCodeAt(0));
}
export async function verifyIdentity(token,nonce,fetcher=fetch){
 try{
  const parts=token.split('.');if(parts.length!==3)throw Error();
  const header=JSON.parse(new TextDecoder().decode(decodePart(parts[0])));
  const claims=JSON.parse(new TextDecoder().decode(decodePart(parts[1])));
  if(header.alg!=='RS256'||!header.kid)throw Error();
  const discovery=await fetcher(AUTH_ORIGIN+'/.well-known/openid-configuration',{credentials:'omit',signal:AbortSignal.timeout(15000)});
  if(!discovery.ok)throw Error();
  const config=await discovery.json();const jwksURL=new URL(config.jwks_uri);
  if(jwksURL.origin!==AUTH_ORIGIN||claims.iss!==config.issuer)throw Error();
  const keyResponse=await fetcher(jwksURL.href,{credentials:'omit',signal:AbortSignal.timeout(15000)});if(!keyResponse.ok)throw Error();
  const keys=await keyResponse.json();const jwk=keys.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.use||k.use==='sig'));if(!jwk)throw Error();
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodePart(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error();
  const now=Date.now()/1000;
  if(!Number.isFinite(claims.exp)||claims.exp<=now||claims.iat>now+60||!(Array.isArray(claims.aud)?claims.aud:[claims.aud]).includes(CLIENT_ID)||(nonce&&claims.nonce!==nonce))throw Error();
  return claims;
 }catch{throw new AppError('AUTH_IDENTITY','authIdentity');}
}
