import { cancelThemeTransition } from './theme';
const privacyBase='capybudget-privacy-mode';
let privacyKey=privacyBase;
export function configurePrivacyMode(userId:string,defaultValue:boolean){privacyKey=privacyBase+':'+userId;memoryPreference=defaultValue;try{const saved=localStorage.getItem(privacyKey);if(saved===null)memoryPreference=defaultValue;else memoryPreference=saved==='true';}catch{memoryPreference=true;}return memoryPreference;}
const legacyReportsPrivacyKey='capybudget-reports-privacy';
let memoryPreference=true;
/** Conceal by default until the browser preference is known. Storage failures fail closed. */
export function readPrivacyMode(){
 if(typeof window==='undefined')return true;
 try{const saved=localStorage.getItem(privacyKey);if(saved!==null)return memoryPreference=saved==='true';
  if(privacyKey!==privacyBase)return memoryPreference;const legacy=localStorage.getItem(legacyReportsPrivacyKey);return memoryPreference=legacy===null?false:legacy==='true';
 }catch{return memoryPreference;}
}
export function writePrivacyMode(enabled:boolean){
 if(enabled)cancelThemeTransition();
 memoryPreference=enabled;
 try{localStorage.setItem(privacyKey,String(enabled));}catch{}
 window.dispatchEvent(new Event('capybudget-privacy-change'));
 if(privacyKey!==privacyBase)void fetch('/api/security/preferences',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({privacyDefault:enabled})}).catch(()=>{});
}
export const PRIVACY_CONTEXT='capybudget-privacy';
export type PrivacyState={hidden:boolean};
export function concealed(value:unknown,hidden:boolean){return hidden?'••••••':String(value??'');}
