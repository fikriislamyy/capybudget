const privacyKey='capybudget-privacy-mode';
const legacyReportsPrivacyKey='capybudget-reports-privacy';

export function readPrivacyMode(){
  if(typeof window==='undefined')return false;
  const saved=localStorage.getItem(privacyKey);
  if(saved!==null)return saved==='true';
  const legacy=localStorage.getItem(legacyReportsPrivacyKey)==='true';
  if(legacy)localStorage.setItem(privacyKey,'true');
  return legacy;
}

export function writePrivacyMode(enabled:boolean){
  localStorage.setItem(privacyKey,String(enabled));
  window.dispatchEvent(new Event('capybudget-privacy-change'));
}
