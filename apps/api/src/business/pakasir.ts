import {createHash,timingSafeEqual} from 'node:crypto';
import type {DokuPaymentStatus} from './doku';
export type PakasirCredentials={projectSlug:string;apiKey:string;webhookSecret:string;sandbox:boolean};
function invalid(message:string):never{throw Object.assign(new Error(message),{code:'INVALID_PAYMENT_PROVIDER_RESPONSE',providerErrors:[message]});}
function identifier(value:unknown):value is string{return typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);}
export function parsePakasirStatus(value:any):DokuPaymentStatus&{txnId:string;sandbox:boolean}{
 if(!value||!identifier(value.txn_id)||!identifier(value.order_id)||!Number.isSafeInteger(value.amount)||value.amount<500||value.amount>50000000||typeof value.is_sandbox!=='boolean'||!['pending','completed','canceled'].includes(value.status))invalid('Pakasir returned incomplete transaction details.');
 if(value.status==='completed'&&(typeof value.completed_at!=='string'||!Number.isFinite(Date.parse(value.completed_at))))invalid('Pakasir returned an invalid completion date.');
 return {txnId:value.txn_id,invoiceNumber:value.order_id,amount:String(value.amount),currency:'IDR',sandbox:value.is_sandbox,status:value.status==='completed'?'SUCCESS':value.status==='canceled'?'EXPIRED':'PENDING',...(value.completed_at?{transactionDate:value.completed_at}:{})};
}
export function verifyPakasirNotification(secret:string,headers:Headers){const supplied=headers.get('X-Secret');if(!secret||!supplied||supplied.length>4096)return false;return timingSafeEqual(createHash('sha256').update(secret).digest(),createHash('sha256').update(supplied).digest());}
// Reserve request slots without retaining credentials. Database leases serialize status
// checks for each checkout; provider 429 responses remain retryable across API replicas.
const slots=new Map<string,number>();
async function waitForSlot(slug:string,interval=550){const now=Date.now(),slot=Math.max(now,slots.get(slug)??0);if(slot-now>10000)throw Object.assign(new Error('Pakasir is busy.'),{code:'PAYMENT_PROVIDER_RATE_LIMITED'});slots.set(slug,slot+interval);if(slot>now)await new Promise(resolve=>setTimeout(resolve,slot-now));if(slots.size>1000)for(const [key,time] of slots)if(time<Date.now())slots.delete(key);}
export class PakasirClient{
 constructor(private credentials:PakasirCredentials){if(!identifier(credentials.projectSlug)||!credentials.apiKey||/[\r\n]/.test(credentials.apiKey)||typeof credentials.sandbox!=='boolean')throw Object.assign(new Error('Configure a Pakasir project and API key.'),{code:'INVALID_PAYMENT_PROVIDER_INPUT'});}
 private async request(path:string,body?:unknown,apiPrefix:'v2/'|''='v2/'):Promise<any>{
 if(path.startsWith('transaction-status/'))await waitForSlot(path,4100);
 await waitForSlot(this.credentials.projectSlug);
 let response:Response;try{response=await fetch('https://app.pakasir.com/api/'+apiPrefix+path,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'X-Api-Key':this.credentials.apiKey,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});}catch{throw Object.assign(new Error('Pakasir could not be reached.'),{code:'PAYMENT_PROVIDER_UNAVAILABLE'});}
 const reader=response.body?.getReader();if(!reader)invalid('Pakasir returned an empty response.');const chunks:Uint8Array[]=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();invalid('Pakasir returned an oversized response.');}chunks.push(value);}}finally{reader.releaseLock();}
 if(!response.ok)throw Object.assign(new Error('Pakasir could not complete this request.'),{code:response.status===429?'PAYMENT_PROVIDER_RATE_LIMITED':'PAYMENT_PROVIDER_HTTP_'+response.status});
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{invalid('Pakasir returned invalid JSON.');}
 }
 async create(input:{invoiceNumber:string;amount:string;qrisOnly?:boolean;directQris?:boolean}){
 if(!identifier(input.invoiceNumber)||!/^\d+$/.test(input.amount)||Number(input.amount)<500||Number(input.amount)>((input.qrisOnly||input.directQris)?10000000:50000000))throw Object.assign(new Error('Pakasir requires IDR 500–50,000,000, or up to IDR 10,000,000 for QRIS.'),{code:'INVALID_PAYMENT_AMOUNT'});
 const value=await this.request('create-transaction/'+this.credentials.projectSlug+'/'+input.invoiceNumber,{method:input.directQris?'qris':'payment_link',amount:Number(input.amount)});
 if(input.directQris){
  if(!value||typeof value!=='object'||Array.isArray(value))invalid('Pakasir returned an invalid QRIS response.');
  if(!identifier(value.txn_id))invalid('Pakasir QRIS response is missing a valid transaction ID.');
  if(value.project!==this.credentials.projectSlug)invalid('Pakasir QRIS project does not match the saved connection.');
  if(value.order_id!==input.invoiceNumber)invalid('Pakasir QRIS order reference does not match this payment request.');
  if(value.amount!==Number(input.amount))invalid('Pakasir QRIS amount does not match the invoice amount.');
  if(value.is_sandbox!==this.credentials.sandbox)invalid('Pakasir project sandbox setting does not match the connection environment.');
  if(value.payment_method!=='qris')invalid('Pakasir did not return the requested QRIS payment method.');
  // Sandbox currently supplies a sample payload, not a payable EMV QRIS code.
  // Keep real-payment validation strict; never infer sandbox mode from the QR.
  if(typeof value.qr_string!=='string'||!value.qr_string.trim()||value.qr_string.length>4096||(!this.credentials.sandbox&&!value.qr_string.startsWith('000201')))invalid('Pakasir returned an invalid QRIS payload.');
  // The live API uses expires_at; older examples use expired_at. Accept both,
  // but reject conflicting values rather than guessing the expiry.
  const expiresAt=value.expires_at??value.expired_at;
  if(typeof expiresAt!=='string'||!Number.isFinite(Date.parse(expiresAt))||(value.expires_at!==undefined&&value.expired_at!==undefined&&value.expires_at!==value.expired_at))invalid('Pakasir returned a missing, invalid, or conflicting QRIS expiry.');
  if(!Number.isSafeInteger(value.fee)||value.fee<0)invalid('Pakasir returned an invalid QRIS payment fee.');
  if(!Number.isSafeInteger(value.total_payment)||value.total_payment!==value.amount+value.fee)invalid('Pakasir QRIS total does not equal the invoice amount plus its payment fee.');
  return {tokenId:value.txn_id,paymentUrl:null,expiresAtProvider:expiresAt,qrString:value.qr_string,fee:String(value.fee),totalPayment:String(value.total_payment)};
 }
 if(!identifier(value?.txn_id)||typeof value.payment_link!=='string')invalid('Pakasir did not return a payment link.');
 let url:URL;try{url=new URL(value.payment_link);}catch{invalid('Pakasir returned an invalid payment URL.');}
 if(url.origin!=='https://app.pakasir.com'||url.username||url.password||url.search||url.hash||url.pathname!=='/pay-v2/'+value.txn_id)invalid('Pakasir returned an unexpected payment URL.');
 if(input.qrisOnly)url.searchParams.set('qris_only','1');
 return {tokenId:value.txn_id,paymentUrl:url.href,expiresAtProvider:null,qrString:null,fee:null,totalPayment:null};
 }
 /** Same sandbox action used by Pakasir's public PaymentV2 page.
  * Source: https://app.pakasir.com/assets/index-BXLuKK0g.js (2026-10-05).
  * Verify sandbox mode and persisted order details before and after the action.
  */
 async simulate(txnId:string,expected:{invoiceNumber:string;amount:string}){
  if(!this.credentials.sandbox)throw Object.assign(new Error('Payment simulation is available only in sandbox.'),{status:403});
  const before=await this.status(txnId);
  const matches=(value:Awaited<ReturnType<PakasirClient['status']>>)=>value.invoiceNumber===expected.invoiceNumber&&value.amount===expected.amount&&value.sandbox===true;
  if(!matches(before))invalid('The sandbox transaction does not match this payment request.');
  if(before.status==='SUCCESS')return before;
  if(before.status!=='PENDING')throw Object.assign(new Error('This sandbox payment is no longer pending.'),{status:409});
  await this.request('transactions/'+txnId+'/simulate',{},'');
  const after=await this.status(txnId);
  if(!matches(after))invalid('The simulated transaction does not match this payment request.');
  return after;
 }
 async status(txnId:string){if(!identifier(txnId))invalid('Missing Pakasir transaction ID.');const result=parsePakasirStatus(await this.request('transaction-status/'+this.credentials.projectSlug+'/'+txnId));if(result.txnId!==txnId||result.sandbox!==this.credentials.sandbox)invalid('Pakasir transaction or project environment does not match the connection.');return result;}
}
