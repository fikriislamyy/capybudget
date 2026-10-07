import {fromUnits,toUnits} from '../money';
import {shiftDate,validDate} from './calculations';
/** Locale grammar is explicit; ambiguous separators are left for the user's review. */
export function amountToken(token:string,currency:string,locale:'en'|'id'){
 let normalized=token.trim().toLowerCase().replace(/^(rp\.?|idr|usd|\$)\s*/,'');
 // Providers sometimes copy the adjacent currency as part of the amount span.
 // Accept that literal suffix only when it matches the selected currency.
 const suffix=normalized.match(/(?:\s+|(?<=\d|k))([a-z]{3})$/);
 if(suffix){if(suffix[1]!==currency.toLowerCase())return null;normalized=normalized.slice(0,suffix.index).trim();}
 const shorthand=normalized.match(/^(\d+(?:[.,]\d{1,4})?)\s*(k|rb|ribu|jt|juta|m)$/);
 if(shorthand){if(currency!=='IDR'||locale!=='id'&&!['k','m'].includes(shorthand[2]!))return null;const multiplier=['jt','juta','m'].includes(shorthand[2]!)?1000000n:1000n;try{return fromUnits(toUnits(shorthand[1]!.replace(',','.'))*multiplier);}catch{return null;}}
 let amount=normalized;if(locale==='id'){if(/^\d{1,3}(\.\d{3})+(,\d{1,4})?$/.test(amount))amount=amount.replaceAll('.','').replace(',','.');else if(/^\d+(,\d{1,4})?$/.test(amount))amount=amount.replace(',','.');else return null;}else{if(/^\d{1,3}(,\d{3})+(\.\d{1,4})?$/.test(amount))amount=amount.replaceAll(',','');else if(!/^\d+(\.\d{1,4})?$/.test(amount))return null;}
 try{const units=toUnits(amount);return units>0n?fromUnits(units):null;}catch{return null;}
}
export function extractedEntry(value:unknown,text:string,today:string,currency:string,locale:'en'|'id'){
 const v=value as Record<string,unknown>,names=['type','amountToken','currency','dateToken','accountName','categoryName','merchant'];if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!names.includes(k))||names.some(k=>typeof v[k]!=='string')||!['income','expense','unknown'].includes(String(v.type)))throw new RangeError('Language extraction was not valid. Use manual entry.');
 const contains=(s:string)=>!s||text.toLocaleLowerCase().includes(s.toLocaleLowerCase());if(!contains(String(v.amountToken))||!contains(String(v.dateToken)))throw new RangeError('Extracted amount or date was not in the input. Review manually.');
 const chosenCurrency=String(v.currency||currency).toUpperCase(),amount=amountToken(String(v.amountToken),chosenCurrency,locale),token=String(v.dateToken).toLowerCase();let date:string|null=null;
 if(['today','hari ini'].includes(token))date=today;else if(['yesterday','kemarin'].includes(token))date=shiftDate(today,-1);else if(validDate(token))date=token;else if(/^\d{2}-\d{2}-\d{4}$/.test(token)){const [d,m,y]=token.split('-');const candidate=`${y}-${m}-${d}`;if(validDate(candidate))date=candidate;}
 const unresolved:string[]=[];if(!amount)unresolved.push('amount');if(!date)unresolved.push('date');if(v.type==='unknown')unresolved.push('type');if(!/^[A-Z]{3}$/.test(chosenCurrency))unresolved.push('currency');
 return {fields:{type:v.type==='unknown'?'':v.type,amount:amount??'',date:date??'',currency:chosenCurrency,accountName:String(v.accountName).slice(0,100),categoryName:String(v.categoryName).slice(0,100),merchant:contains(String(v.merchant))?String(v.merchant).slice(0,200):''},unresolved};
}
