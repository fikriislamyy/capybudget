import { currencyScale } from './currency';
export { currencyScale } from './currency';
import { calculateTax, type TaxPolicy } from './tax-money';
export type InvoiceLineInput={description:string;quantity:string;unitPrice:string;discountAmount?:string;taxRate?:string;taxPolicy?:TaxPolicy};
export type CalculatedLine={description:string;quantity:string;unitPrice:string;discountAmount:string;taxRate:string;netAmount:string;taxAmount:string;totalAmount:string};
function scaled(value:string,scale:number):bigint{
  if(typeof value!=='string'||!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/.test(value))throw new Error('Enter a non-negative decimal with at most four decimal places.');
  const [whole,rawFraction='']=value.split('.'),fraction=rawFraction.slice(0,scale),excess=rawFraction.slice(scale);
  if(/[1-9]/.test(excess))throw new Error('This currency supports at most '+scale+' decimal places.');
  return BigInt(whole!)*10n**BigInt(scale)+BigInt((fraction+'0'.repeat(scale)).slice(0,scale)||'0');
}
function quantity(value:string):bigint{
  if(typeof value!=='string'||!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/.test(value))throw new Error('Enter a valid quantity.');
  const [whole,fraction='']=value.split('.');
  const result=BigInt(whole!)*10000n+BigInt((fraction+'0000').slice(0,4));
  if(result<=0n)throw new Error('Quantity must be greater than zero.');
  return result;
}
function rounded(numerator:bigint,denominator:bigint):bigint{return (numerator*2n+denominator)/(denominator*2n);}
function format(value:bigint,scale:number):string{
  const negative=value<0n,absolute=negative?-value:value,base=10n**BigInt(scale),whole=absolute/base;
  if(!scale)return (negative?'-':'')+whole.toString();
  return (negative?'-':'')+whole.toString()+'.'+(absolute%base).toString().padStart(scale,'0');
}
function signedScaled(value:string,scale:number){return value.startsWith('-')?-scaled(value.slice(1),scale):scaled(value,scale);}
function mulToCurrency(qty:bigint,price:bigint):bigint{
  // Price is already in currency minor units; only undo the quantity's 10^4 scale.
  return rounded(qty*price,10000n);
}
export function calculateInvoice(lines:InvoiceLineInput[],currency:string){
  const scale=currencyScale(currency);
  const limit=10n**BigInt(15+scale);
  if(!Array.isArray(lines)||lines.length<1||lines.length>100)throw new Error('Add between 1 and 100 invoice lines.');
  const calculated:CalculatedLine[]=lines.map((line)=>{
    if(typeof line.description!=='string'||!line.description.trim()||line.description.trim().length>500)throw new Error('Each line needs a description of 1 to 500 characters.');
    const qty=quantity(line.quantity),price=scaled(line.unitPrice,scale),gross=mulToCurrency(qty,price);
    const discount=scaled(line.discountAmount??'0',scale),rateText=line.taxRate??'0';
    if(!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/.test(rateText))throw new Error('Tax rate must be from 0 to 100 percent.');
    const rateUnits=BigInt(rateText.replace('.','')),rateScale=(rateText.split('.')[1]??'').length;
    const rate=rateUnits*10n**BigInt(4-rateScale);
    if(rate>1000000n)throw new Error('Tax rate must be from 0 to 100 percent.');
    if(discount>gross)throw new Error('A line discount cannot exceed its amount.');
    const taxable=gross-discount;
    const configured=line.taxPolicy?calculateTax(format(taxable,scale),currency,line.taxPolicy):null;
    const net=configured?scaled(configured.net,scale):taxable,tax=configured?scaled(configured.tax,scale):rounded(net*rate,1000000n);
    if(net+tax>=limit||net+discount>=limit)throw new Error('Invoice line amounts exceed the supported limit.');
    return {description:line.description.trim(),quantity:line.quantity,unitPrice:format(price,scale),discountAmount:format(discount,scale),taxRate:format(rate,4),netAmount:format(net,scale),taxAmount:format(tax,scale),totalAmount:format(net+tax,scale)};
  });
  const totals=calculated.reduce((acc,line)=>({subtotal:acc.subtotal+scaled(line.netAmount,scale)+scaled(line.discountAmount,scale),discount:acc.discount+scaled(line.discountAmount,scale),tax:acc.tax+scaled(line.taxAmount,scale),total:acc.total+scaled(line.totalAmount,scale)}),{subtotal:0n,discount:0n,tax:0n,total:0n});
  if(totals.total<=0n)throw new Error('An issued invoice must have a total greater than zero.');
  if(Object.values(totals).some(amount=>amount>=limit))throw new Error('Invoice totals exceed the supported limit.');
  return {lines:calculated,scale,subtotal:format(totals.subtotal,scale),discountTotal:format(totals.discount,scale),taxTotal:format(totals.tax,scale),total:format(totals.total,scale)};
}
export function validPositiveAmount(value:unknown,scale:number):value is string{
  if(typeof value!=='string')return false;
  try{return scaled(value,scale)>0n;}catch{return false;}
}
export function addMoney(a:string,b:string,scale:number){return format(signedScaled(a,scale)+signedScaled(b,scale),scale);}
export function compareMoney(a:string,b:string,scale:number){const aa=scaled(a,scale),bb=scaled(b,scale);return aa<bb?-1:aa>bb?1:0;}
