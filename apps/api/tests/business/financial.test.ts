import {test,expect} from 'bun:test';
import {calculateInvoice} from '../../src/business/money';
import {DokuClient,signDokuRequest,verifyDokuNotification,parseDokuPaymentStatus,assertDokuPayment} from '../../src/business/doku';
import {createHash,createHmac} from 'node:crypto';
const credentials={clientId:'sandbox-fixture',secretKey:'isolated-test-secret',sandbox:true};
test('USD quantity and price scaling and rounding are exact',()=>{
 expect(calculateInvoice([{description:'Work',quantity:'2',unitPrice:'10.50'}],'USD').total).toBe('21.00');
 expect(calculateInvoice([{description:'Work',quantity:'0.3333',unitPrice:'10.00'}],'USD').total).toBe('3.33');
 expect(()=>calculateInvoice([{description:'Overflow',quantity:'999999999999999',unitPrice:'999999999999999'}],'IDR')).toThrow();
});
test('configured inclusive and fractional exclusive tax preserve the total',()=>{
 const policy={rate:'12',baseNumerator:11,baseDenominator:12,inclusive:false};
 const result=calculateInvoice([{description:'Service',quantity:'1',unitPrice:'100000',taxPolicy:policy}],'IDR');
 expect(result.taxTotal).toBe('11000');expect(result.total).toBe('111000');
 const included=calculateInvoice([{description:'Service',quantity:'1',unitPrice:'111000',taxPolicy:{...policy,inclusive:true}}],'IDR');
 expect(included.lines[0]!.netAmount).toBe('100000');expect(included.total).toBe('111000');
});
test('DOKU signatures cover the exact bytes and the expected route',()=>{
 const body=JSON.stringify({order:{invoice_number:'CB-FIXTURE',amount:50000},transaction:{status:'SUCCESS'}});
 const fields={requestId:'fixture-request',requestTimestamp:'2026-10-04T01:00:00Z',requestTarget:'/api/payments/doku/fixture',body};
 const canonical=['Client-Id:sandbox-fixture','Request-Id:fixture-request','Request-Timestamp:2026-10-04T01:00:00Z','Request-Target:'+fields.requestTarget,'Digest:'+createHash('sha256').update(body).digest('base64')].join('\n');
 expect(signDokuRequest(credentials,fields)).toBe('HMACSHA256='+createHmac('sha256',credentials.secretKey).update(canonical).digest('base64'));
 const headers=new Headers({'Client-Id':credentials.clientId,'Request-Id':fields.requestId,'Request-Timestamp':fields.requestTimestamp,Signature:signDokuRequest(credentials,fields)});
 expect(verifyDokuNotification(credentials,headers,Buffer.from(body),fields.requestTarget)).toBe(true);
 expect(verifyDokuNotification(credentials,headers,Buffer.from(body+' '),fields.requestTarget)).toBe(false);
 expect(verifyDokuNotification(credentials,headers,Buffer.from(body),'/wrong')).toBe(false);
 const get=signDokuRequest(credentials,{...fields,body:undefined});expect(get).not.toBe(signDokuRequest(credentials,fields));
});
test('DOKU settlement must match the stored order, amount and successful status',()=>{
 const paid=parseDokuPaymentStatus({order:{invoice_number:'CB-FIXTURE',amount:50000},transaction:{status:'SUCCESS'}});
 expect(assertDokuPayment(paid,{invoiceNumber:'CB-FIXTURE',amount:'50000',currency:'IDR'})).toBe(true);
 expect(()=>assertDokuPayment(paid,{invoiceNumber:'other',amount:'50000',currency:'IDR'})).toThrow();
 expect(()=>assertDokuPayment(paid,{invoiceNumber:'CB-FIXTURE',amount:'40000',currency:'IDR'})).toThrow();
 expect(assertDokuPayment({...paid,status:'REFUNDED'},{invoiceNumber:'CB-FIXTURE',amount:'50000',currency:'IDR'})).toBe(false);
});

test('DOKU staging checkout links are accepted only in sandbox',async()=>{
 const originalFetch=globalThis.fetch;
 let url='https://staging.doku.com/checkout-link-v2/fixture-token';
 globalThis.fetch=(async()=>Response.json({response:{order:{invoice_number:'CB-FIXTURE',amount:'50000',currency:'IDR'},payment:{token_id:'fixture-token',expired_date:'20261005235959',url}}})) as typeof fetch;
 try{
  const input={invoiceNumber:'CB-FIXTURE',amount:'50000',requestId:'fixture-request'};
  expect((await new DokuClient(credentials).create(input)).paymentUrl).toBe(url);
  await expect(new DokuClient({...credentials,sandbox:false}).create(input)).rejects.toThrow('unrecognized host');
  for(const badUrl of ['https://staging.doku.com.attacker.example/checkout-link-v2/fixture-token','http://staging.doku.com/checkout-link-v2/fixture-token','https://staging.doku.com/checkout-link-v2/fixture-token?redirect=elsewhere']){
   url=badUrl;
   await expect(new DokuClient(credentials).create(input)).rejects.toThrow('unexpected checkout URL');
  }
 }finally{globalThis.fetch=originalFetch;}
});
