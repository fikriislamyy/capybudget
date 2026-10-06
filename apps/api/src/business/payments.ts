import {Elysia} from 'elysia';import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {scope} from './routes';import {q,reject,uuid,owner,recordAudit} from './shared';import {client} from '../db';
import {protectedText} from '../security/business-fields';import {DokuClient,verifyDokuNotification,parseDokuPaymentStatus,assertDokuPayment,type DokuCredentials} from './doku';
import {recordPaymentAdjustment} from './payment-adjustments';import {reverseTransaction} from '../tracking/routes';import {addMoney,compareMoney,validPositiveAmount} from './money';import {recordInvoiceReceipt} from './receipts';import {workspaceToday} from '../tracking/recurrence';
import {PakasirClient,parsePakasirStatus,verifyPakasirNotification} from './pakasir';
// Existing credential columns are reused; the provider discriminator prevents
// interpreting historical DOKU Client IDs and Secret Keys as Pakasir credentials.
const pakasirCredentials=(row:any)=>({projectSlug:row.client_id,apiKey:row.secret_key,webhookSecret:row.webhook_secret,sandbox:row.sandbox});
const hash=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
const callbackPath=(id:string)=>'/api/payments/doku/'+id;
const publicConnectionColumns='id,provider,sandbox,client_id as "clientId",account_id as "accountId",category_id as "categoryId",disabled_at as "disabledAt",created_at as "createdAt"';
const requestColumns='id,(select provider from payment_connections c where c.id=payment_requests.connection_id) as provider,invoice_id as "invoiceId",amount::text,currency,account_id as "accountId",category_id as "categoryId",qris_only as "qrisOnly",checkout_method as "checkoutMethod",state,payment_url as "paymentUrl",provider_expiry as "providerExpiry",payment_id as "paymentId",failure_code as "failureCode",provider_status->\'checkoutError\' as "checkoutError",unapplied_transaction_id as "unappliedTransactionId",created_at as "createdAt"';
const credentials=(row:any):DokuCredentials=>({clientId:row.client_id,secretKey:row.secret_key,sandbox:row.sandbox});
export const businessPaymentRoutes=new Elysia({name:'business-payments'})
.get('/api/payments/qris/:token',async({params})=>{
 if(!/^[0-9a-f]{64}$/.test(params.token))return new Response(null,{status:404});
 const [bootstrap]=await client`select workspace_id from payment_requests where public_token=${params.token} and checkout_method='qris'`;
 if(!bootstrap)return new Response(null,{status:404});
 return internal(bootstrap.workspace_id,async tx=>{
  const [p]=await q(tx,`select p.id,p.amount::text,p.provider_fee::text,p.total_payment::text,p.qr_string,p.provider_expiry,p.state,p.provider_status,i.id as invoice_id,i.total::text as invoice_total,i.number,i.state as invoice_state,i.archived_at,c.sandbox from payment_requests p join invoices i on i.workspace_id=p.workspace_id and i.id=p.invoice_id join payment_connections c on c.workspace_id=p.workspace_id and c.id=p.connection_id where p.workspace_id=$1 and p.public_token=$2 and p.checkout_method='qris' and c.provider='pakasir'`,[bootstrap.workspace_id,params.token]);
  if(!p)return new Response(null,{status:404});
  const [invoice]=await q(tx,'select id,seller_snapshot from invoices where workspace_id=$1 and id=$2',[bootstrap.workspace_id,p.invoice_id]);
  const [receipts]=await q(tx,'select coalesce(sum(amount-refunded_amount) filter(where reversed_at is null),0)::text as amount from invoice_payments where workspace_id=$1 and invoice_id=$2',[bootstrap.workspace_id,p.invoice_id]);
  const confirmed=p.provider_status?.status==='SUCCESS',unavailable=p.invoice_state!=='issued'||p.archived_at||compareMoney(p.invoice_total,receipts.amount,0)<=0||compareMoney(p.amount,addMoney(p.invoice_total,'-'+receipts.amount,0),0)!==0;
  const expired=p.state==='expired'||(p.provider_expiry&&Date.parse(p.provider_expiry)<=Date.now());
  const state=p.state==='refunded'?'refunded':confirmed?'paid':unavailable?'unavailable':expired?'expired':p.state==='ready'?'pending':'preparing';
  return Response.json({payment:{amount:p.amount,currency:'IDR',fee:p.provider_fee,totalPayment:p.total_payment,invoiceNumber:p.number,businessName:invoice.seller_snapshot?.tradingName||invoice.seller_snapshot?.legalName||'Business',sandbox:p.sandbox,sandboxPlaceholder:Boolean(p.sandbox&&p.qr_string&&!p.qr_string.startsWith('000201')),state,expiresAt:p.provider_expiry,qrString:state==='pending'?p.qr_string:null}},{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 });
})
.post('/api/payments/qris/:token/simulate',async({params})=>{
 if(!/^[0-9a-f]{64}$/.test(params.token))return new Response(null,{status:404});
 const [bootstrap]=await client`select p.workspace_id,p.id from payment_requests p join payment_connections c on c.id=p.connection_id where p.public_token=${params.token} and p.checkout_method='qris' and c.provider='pakasir' and c.sandbox=true`;
 if(!bootstrap)return Response.json({message:'Simulation is available only for sandbox payments.'},{status:403});
 const ws=bootstrap.workspace_id;
 const prepared=await internal(ws,async(tx,actor)=>{
  const [p]=await q(tx,'select * from payment_requests where workspace_id=$1 and id=$2 for update',[ws,bootstrap.id]);
  const [c]=await q(tx,'select * from payment_connections where workspace_id=$1 and id=$2',[ws,p.connection_id]);
  if(c.provider!=='pakasir'||c.sandbox!==true)reject('Simulation is available only for sandbox payments.',403);
  if(p.provider_status?.status==='SUCCESS')return null;
  if(p.state!=='ready'||!p.provider_txn_id||!p.provider_expiry||Date.parse(p.provider_expiry)<=Date.now())reject('This sandbox payment is not available for simulation.',409);
  if(p.lease_until&&new Date(p.lease_until).getTime()>Date.now())reject('Payment confirmation is already running. Refresh shortly.',409);
  const [invoice]=await q(tx,"select total::text from invoices where workspace_id=$1 and id=$2 and state='issued' and archived_at is null",[ws,p.invoice_id]);
  const [paid]=await q(tx,'select coalesce(sum(amount-refunded_amount) filter(where reversed_at is null),0)::text as amount from invoice_payments where workspace_id=$1 and invoice_id=$2',[ws,p.invoice_id]);
  if(!invoice||compareMoney(invoice.total,paid.amount,0)<=0)reject('This invoice no longer needs a payment.',409);
  await q(tx,"update payment_requests set lease_until=now()+interval '2 minutes',next_check_at=now()+interval '2 minutes' where workspace_id=$1 and id=$2",[ws,p.id]);
  await recordAudit(tx,ws,actor.id,p.id,'payment_request','sandbox_simulation_requested',{});
  return {p,c};
 });
 if(!prepared)return Response.json({simulated:true,confirmed:true});
 try{
  const status=await new PakasirClient(pakasirCredentials(prepared.c)).simulate(prepared.p.provider_txn_id,{invoiceNumber:prepared.p.provider_reference,amount:addMoney(String(prepared.p.amount),'0',0)});
  await internal(ws,tx=>q(tx,"update payment_requests set provider_status=$3::jsonb,lease_until=null,next_check_at=now(),updated_at=now() where workspace_id=$1 and id=$2",[ws,prepared.p.id,JSON.stringify(status)]));
  // Mature requests post their receipt now; newer ones keep the normal 60-second
  // guard and are posted by the scheduler. Never fabricate a successful receipt.
  await reconcilePayment(ws,prepared.p.id,true);
  return Response.json({simulated:true,confirmed:status.status==='SUCCESS'});
 }catch{
  await internal(ws,tx=>q(tx,"update payment_requests set lease_until=null,next_check_at=now()+interval '30 seconds' where workspace_id=$1 and id=$2",[ws,prepared.p.id]));
  return Response.json({message:'Pakasir simulation could not be confirmed. Refresh payment status before trying again.'},{status:502});
 }
})
.get('/api/workspaces/:workspaceId/payment-connections',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 await owner(tx,params.workspaceId,actor.id);return {items:await q(tx,'select '+publicConnectionColumns+' from payment_connections where workspace_id=$1 order by created_at desc',[params.workspaceId])};
}))
.post('/api/workspaces/:workspaceId/payment-connections',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 const ws=params.workspaceId;await owner(tx,ws,actor.id);const b=await request.json() as any;
 if(typeof b.sandbox!=='boolean'||typeof b.projectSlug!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(b.projectSlug)||typeof b.apiKey!=='string'||!b.apiKey||b.apiKey.length>4096||/[\r\n]/.test(b.apiKey)||typeof b.webhookSecret!=='string'||!b.webhookSecret||b.webhookSecret.length>4096)reject('Enter the Pakasir project slug, API key, webhook secret, and project environment.');
 const [account]=await q(tx,"select id from accounts where workspace_id=$1 and id=$2 and currency='IDR' and archived_at is null and deleted_at is null",[ws,uuid(b.accountId)]),[category]=await q(tx,"select id from categories where workspace_id=$1 and id=$2 and type='income' and archived_at is null",[ws,uuid(b.categoryId)]);if(!account||!category)reject('Choose an active IDR receiving account and income category.');
 const [existing]=await q(tx,"select id from payment_connections where workspace_id=$1 and provider='pakasir' and sandbox=$2 and disabled_at is null",[ws,b.sandbox]);if(existing)reject('Disable the existing Pakasir connection for this environment before replacing it.',409);
 const id=randomUUID();await q(tx,'insert into payment_connections(id,workspace_id,provider,sandbox,client_id,secret_key,webhook_secret,account_id,category_id) values($1,$2,\'pakasir\',$3,$4,$5,$6,$7,$8)',[id,ws,b.sandbox,b.projectSlug,protectedText(b.apiKey,ws,id,'secret_key'),protectedText(b.webhookSecret,ws,id,'webhook_secret'),account.id,category.id]);await recordAudit(tx,ws,actor.id,id,'payment_connection','created',{sandbox:b.sandbox});return {id,notificationPath:'/api/payments/pakasir/'+id};
}))
.post('/api/workspaces/:workspaceId/payment-connections/:id/verify',async({request,params})=>{
 const prepared=await scope(request,params.workspaceId,async(tx,actor)=>{
  await owner(tx,params.workspaceId,actor.id);
  const [connection]=await q(tx,"select * from payment_connections where workspace_id=$1 and id=$2 and provider='pakasir' and disabled_at is null",[params.workspaceId,uuid(params.id)]);if(!connection)reject('Choose an active Pakasir connection.');
  const [payment]=await q(tx,'select id,provider_txn_id,provider_reference,amount::text from payment_requests where workspace_id=$1 and connection_id=$2 and provider_txn_id is not null order by created_at desc limit 1',[params.workspaceId,connection.id]);
  if(!payment)reject('Create a sandbox QRIS payment first. A status check cannot verify credentials without an existing provider transaction.',409);
  const [callback]=await q(tx,'select max(received_at) as received_at from payment_webhook_events where workspace_id=$1 and connection_id=$2 and payment_request_id=$3',[params.workspaceId,connection.id,payment.id]);
  return {connection,payment,callbackAt:callback.received_at};
 });
 if(prepared instanceof Response)return prepared;
 try{
  const status=await new PakasirClient(pakasirCredentials(prepared.connection)).status(prepared.payment.provider_txn_id);
  assertDokuPayment(status,{invoiceNumber:prepared.payment.provider_reference,amount:addMoney(prepared.payment.amount,'0',0),currency:'IDR'});
  // Repeat authorization after the network request; do not expose results to a removed owner.
  return scope(request,params.workspaceId,async(tx,actor)=>{await owner(tx,params.workspaceId,actor.id);await recordAudit(tx,params.workspaceId,actor.id,params.id,'payment_connection','status_verified',{sandbox:status.sandbox,status:status.status});return {checkedAt:new Date().toISOString(),sandbox:status.sandbox,status:status.status,providerVerified:true,callbackReceivedAt:prepared.callbackAt,complete:status.status==='SUCCESS'&&Boolean(prepared.callbackAt),message:prepared.callbackAt?'Provider reference, amount and environment verified; a matching authenticated callback was stored.':'Provider status verified. No matching authenticated callback has been stored; verify the public notification URL separately.'};});
 }catch{return Response.json({message:'Pakasir status verification failed. Check the connection credentials, project environment and provider transaction.'},{status:502});}
})
.delete('/api/workspaces/:workspaceId/payment-connections/:id',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 await owner(tx,params.workspaceId,actor.id);const [saved]=await q(tx,'update payment_connections set disabled_at=now() where workspace_id=$1 and id=$2 and disabled_at is null returning id',[params.workspaceId,uuid(params.id)]);if(!saved)reject('Connection not found.',404);await recordAudit(tx,params.workspaceId,actor.id,saved.id,'payment_connection','disabled',{});return {disabled:true};
}))
.get('/api/workspaces/:workspaceId/payment-channels',({request,params})=>scope(request,params.workspaceId,async tx=>({items:await q(tx,'select id,provider,sandbox from payment_connections where workspace_id=$1 and provider=\'pakasir\' and disabled_at is null order by sandbox desc',[params.workspaceId])})))
.get('/api/workspaces/:workspaceId/invoices/:invoiceId/payment-requests',({request,params})=>scope(request,params.workspaceId,async(tx)=>({items:await q(tx,'select '+requestColumns+' from payment_requests where workspace_id=$1 and invoice_id=$2 order by created_at desc limit 50',[params.workspaceId,uuid(params.invoiceId)])})))
.post('/api/workspaces/:workspaceId/invoices/:invoiceId/payment-requests',async({request,params})=>{
 const b=await request.json() as any,ws=params.workspaceId;
 // QRIS is the only method for newly created checkouts.
 b.qrisOnly=true;
 const prepared=await scope(request,ws,async(tx,actor)=>{
  if(typeof b.idempotencyKey!=='string'||b.idempotencyKey.length<8||b.idempotencyKey.length>200||typeof b.qrisOnly!=='boolean')reject('Provide a payment key and select payment channels.');
  const requestHash=hash(JSON.stringify({invoiceId:params.invoiceId,connectionId:b.connectionId,qrisOnly:b.qrisOnly}));
  const [invoice]=await q(tx,"select * from invoices where workspace_id=$1 and id=$2 and state='issued' and archived_at is null for update",[ws,uuid(params.invoiceId)]);if(!invoice||invoice.currency!=='IDR')reject('Pakasir requires an issued IDR invoice.');
  const [prior]=await q(tx,'select * from payment_requests where workspace_id=$1 and idempotency_key=$2',[ws,b.idempotencyKey]);if(prior){if(prior.request_hash!==requestHash)reject('Payment key belongs to another request.',409);return {existing:true,id:prior.id};}
  const [connection]=await q(tx,'select * from payment_connections where workspace_id=$1 and id=$2 and disabled_at is null',[ws,uuid(b.connectionId)]);if(!connection||connection.provider!=='pakasir')reject('Choose an active Pakasir connection.');
  const [paid]=await q(tx,'select coalesce(sum(amount-refunded_amount) filter(where reversed_at is null),0)::text as amount from invoice_payments where workspace_id=$1 and invoice_id=$2',[ws,invoice.id]);if(compareMoney(String(invoice.total),paid.amount,0)<=0)reject('This invoice is already paid.');const amount=addMoney(String(invoice.total),'-'+paid.amount,0);if(!/^[1-9]\d{0,11}$/.test(amount))reject('Pakasir requires a whole-rupiah amount.');
  if(Number(amount)<500||Number(amount)>10000000)reject('QRIS supports amounts from IDR 500 to IDR 10,000,000.');
  const [open]=await q(tx,"select id from payment_requests where workspace_id=$1 and invoice_id=$2 and state in ('creating','ready','uncertain')",[ws,invoice.id]);if(open)reject('A checkout already exists. Reconcile it before creating another.',409);
  const id=randomUUID(),reference='CB'+id.replaceAll('-','').slice(0,28),requestId=randomUUID();
  await q(tx,'insert into payment_requests(id,workspace_id,connection_id,invoice_id,account_id,category_id,amount,provider_reference,provider_request_id,idempotency_key,request_hash,qris_only,created_by,checkout_method,public_token) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,\'qris\',$14)',[id,ws,connection.id,invoice.id,connection.account_id,connection.category_id,amount,reference,requestId,b.idempotencyKey,requestHash,true,actor.id,randomBytes(32).toString('hex')]);return {existing:false,id,connection,input:{invoiceNumber:reference,amount,requestId,qrisOnly:b.qrisOnly}};
 });
 if(prepared instanceof Response)return prepared;
 if(!prepared.existing){
  try{await createPakasirCheckout(ws,prepared.id,prepared.connection,prepared.input!);}
  catch(error){
   const candidate=(error as {code?:unknown})?.code;
   const code=typeof candidate==='string'&&/^(?:PAYMENT_PROVIDER_(?:UNAVAILABLE|RATE_LIMITED|FAILED|HTTP_[0-9]{3})|INVALID_PAYMENT_PROVIDER_RESPONSE|INVALID_PAYMENT_AMOUNT|INVALID_PAYMENT_PROVIDER_INPUT)$/.test(candidate)?candidate:'CHECKOUT_OUTCOME_UNCERTAIN';
   const details=(error as {providerErrors?:string[]})?.providerErrors??[];
   console.error('Pakasir checkout creation did not return a usable link.',{paymentRequestId:prepared.id,code,details});
   await internal(ws,async tx=>{await q(tx,"update payment_requests set state='uncertain',failure_code=$3,provider_status=$4::jsonb,updated_at=now() where workspace_id=$1 and id=$2 and state='creating'",[ws,prepared.id,code,JSON.stringify({checkoutError:details})]);});
  }
 }
 return scope(request,ws,async tx=>({request:(await q(tx,'select '+requestColumns+' from payment_requests where workspace_id=$1 and id=$2',[ws,prepared.id]))[0]}));
})
.post('/api/workspaces/:workspaceId/payment-requests/:id/reconcile',async({request,params})=>{
 const checked=await scope(request,params.workspaceId,async tx=>{const [record]=await q(tx,'select id,created_at from payment_requests where workspace_id=$1 and id=$2',[params.workspaceId,uuid(params.id)]);if(!record)reject('Payment request not found.',404);if(Date.now()-new Date(record.created_at).getTime()<60000)reject('Wait at least 60 seconds before checking the payment provider.',409);return record;});if(checked instanceof Response)return checked;
 await reconcilePayment(params.workspaceId,checked.id,true);
 return scope(request,params.workspaceId,async tx=>({request:(await q(tx,'select '+requestColumns+' from payment_requests where workspace_id=$1 and id=$2',[params.workspaceId,checked.id]))[0]}));
})
.post('/api/workspaces/:workspaceId/payment-requests/:id/match',({request,params})=>scope(request,params.workspaceId,async(tx,actor,w)=>{
 const [p]=await q(tx,"select * from payment_requests where workspace_id=$1 and id=$2 and state='reconciliation' for update",[params.workspaceId,uuid(params.id)]);if(!p||p.payment_id||p.unapplied_transaction_id||!p.provider_status||p.provider_status.status!=='SUCCESS')reject('Match is available only for an unposted successful payment.',409);const b=await request.json() as any;
 const result=await recordInvoiceReceipt(tx,params.workspaceId,actor,{invoiceId:p.invoice_id,amount:addMoney(String(p.amount),'0',0),accountId:p.account_id,categoryId:p.category_id,paidOn:b.paidOn,reference:'Gateway '+p.provider_reference,idempotencyKey:'doku-match-'+p.id,existingTransactionId:uuid(b.transactionId)});
 await q(tx,"update payment_requests set state='paid',payment_id=$3,failure_code=null,updated_at=now() where workspace_id=$1 and id=$2",[params.workspaceId,p.id,result.payment.id]);return {payment:result.payment};
}))
.post('/api/workspaces/:workspaceId/payment-requests/:id/net-match',({request,params})=>scope(request,params.workspaceId,async(tx,actor,w)=>{
 const b=await request.json() as any,ws=params.workspaceId,id=uuid(params.id),source=uuid(b.transactionId);
 if(b.confirm!==true||!validPositiveAmount(b.feeAmount,0))reject('Confirm the actual gross settlement and positive whole-rupiah fee.');
 const fingerprint=hash(JSON.stringify({source,feeAmount:b.feeAmount,categoryId:b.categoryId,paidOn:b.paidOn}));
 const [p]=await q(tx,'select * from payment_requests where workspace_id=$1 and id=$2 for update',[ws,id]);if(!p)reject('Payment request unavailable.',404);
 if(p.net_settlement_hash){if(p.net_settlement_hash!==fingerprint)reject('Settlement was already matched differently.',409);return {replayed:true};}
 if(p.state!=='reconciliation'||p.payment_id||p.unapplied_transaction_id||p.provider_status?.status!=='SUCCESS')reject('Match a verified successful payment awaiting reconciliation.',409);
 if(compareMoney(b.feeAmount,String(p.amount),0)>=0)reject('The fee must be less than the gross receipt.');
 const [t]=await q(tx,"select * from transactions where workspace_id=$1 and id=$2 and type='income' and deleted_at is null for update",[ws,source]);
 if(!t||t.account_id!==p.account_id||t.currency!=='IDR'||t.occurred_at!==b.paidOn||compareMoney(addMoney(String(t.amount),b.feeAmount,0),String(p.amount),0)!==0)reject('Net bank income plus the verified fee must equal the gross gateway receipt, in the same account and date.');
 const [journal]=await q(tx,"select id from journal_entries j where workspace_id=$1 and transaction_id=$2 and reason in ('create','restore') and not exists(select 1 from journal_entries r where r.reverses_entry_id=j.id) for update",[ws,source]);if(!journal)reject('Source bank movement has no reversible journal.',409);
 await reverseTransaction(tx,ws,actor,source,b.paidOn);
 await q(tx,'update transactions set deleted_at=now(),deleted_by=$3,version=version+1,updated_at=now() where workspace_id=$1 and id=$2',[ws,source,actor.id]);
 const receipt=await recordInvoiceReceipt(tx,ws,actor,{invoiceId:p.invoice_id,amount:addMoney(String(p.amount),'0',0),paidOn:b.paidOn,accountId:p.account_id,categoryId:p.category_id,reference:'Gateway '+p.provider_reference,idempotencyKey:'doku-net-'+p.id});
 await q(tx,"update payment_requests set payment_id=$3,state='paid',failure_code=null,net_settlement_source_id=$4,net_settlement_hash=$5 where workspace_id=$1 and id=$2",[ws,id,receipt.payment.id,source,fingerprint]);
 const fee=await recordPaymentAdjustment(tx,ws,actor,w,id,{confirm:true,amount:b.feeAmount,paidOn:b.paidOn,categoryId:b.categoryId,reason:'Verified payment gateway net settlement fee',idempotencyKey:'doku-net-fee-'+id},false);
 await recordAudit(tx,ws,actor.id,id,'payment_request','net_settlement_matched',{sourceTransactionId:source,paymentId:receipt.payment.id,feeId:fee.id});return {payment:receipt.payment,fee};
}))
.post('/api/payments/doku/:connectionId',async({request,params})=>{
 if(!/^[0-9a-f-]{36}$/i.test(params.connectionId))return new Response(null,{status:404});
 const [bootstrap]=await client`select workspace_id from payment_connections where id=${params.connectionId}`;if(!bootstrap)return new Response(null,{status:404});
 let raw:Uint8Array;try{raw=await readBody(request);}catch{return new Response(null,{status:413});}
 try{return await internal(bootstrap.workspace_id,async tx=>{
  const [connection]=await q(tx,'select * from payment_connections where workspace_id=$1 and id=$2',[bootstrap.workspace_id,params.connectionId]);if(connection.provider!=='doku'||!verifyDokuNotification(credentials(connection),request.headers,raw,callbackPath(connection.id)))return new Response(null,{status:401});
  const status=parseDokuPaymentStatus(JSON.parse(Buffer.from(raw).toString('utf8'))),requestId=request.headers.get('Request-Id')!,bodyHash=hash(raw);
  const [record]=await q(tx,'select id,provider_request_id,amount::text from payment_requests where workspace_id=$1 and connection_id=$2 and provider_reference=$3',[bootstrap.workspace_id,connection.id,status.invoiceNumber]);
  if(record && (status.amount!==addMoney(record.amount,'0',0)||(status.originalRequestId&&status.originalRequestId!==record.provider_request_id)))return new Response(null,{status:409});
  const [event]=await q(tx,'insert into payment_webhook_events(workspace_id,connection_id,request_id,body_hash,payment_request_id,status) values($1,$2,$3,$4,$5,$6::jsonb) on conflict(connection_id,request_id) do nothing returning id',[bootstrap.workspace_id,connection.id,requestId,bodyHash,record?.id??null,JSON.stringify(status)]);
  if(!event){const [old]=await q(tx,'select body_hash from payment_webhook_events where workspace_id=$1 and connection_id=$2 and request_id=$3',[bootstrap.workspace_id,connection.id,requestId]);if(old.body_hash!==bodyHash)return new Response(null,{status:409});return Response.json({received:true});}
  if(record){await q(tx,"update payment_requests set next_check_at=now()+interval '60 seconds',state=case when state='paid' and $3='REFUNDED' then 'reconciliation' else state end,failure_code=case when $3='REFUNDED' and state<>'refunded' then 'REFUND_REVIEW_REQUIRED' else failure_code end where workspace_id=$1 and id=$2",[bootstrap.workspace_id,record.id,status.status]);}
  return Response.json({received:true});
 });}catch{return new Response(null,{status:400});}
},{parse:'none'})
.post('/api/payments/pakasir/:connectionId',async({request,params})=>{
 if(!/^[0-9a-f-]{36}$/i.test(params.connectionId))return new Response(null,{status:404});
 const [bootstrap]=await client`select workspace_id from payment_connections where id=${params.connectionId} and provider='pakasir'`;if(!bootstrap)return new Response(null,{status:404});
 let raw:Uint8Array;try{raw=await readBody(request);}catch{return new Response(null,{status:413});}
 try{return await internal(bootstrap.workspace_id,async tx=>{
 const [connection]=await q(tx,'select * from payment_connections where workspace_id=$1 and id=$2',[bootstrap.workspace_id,params.connectionId]);
 if(!verifyPakasirNotification(connection.webhook_secret,request.headers))return new Response(null,{status:401});
 const status=parsePakasirStatus(JSON.parse(Buffer.from(raw).toString('utf8')));
 const [record]=await q(tx,'select * from payment_requests where workspace_id=$1 and connection_id=$2 and provider_reference=$3',[bootstrap.workspace_id,connection.id,status.invoiceNumber]);
 if(!record)return new Response(null,{status:404});
 assertDokuPayment(status,{invoiceNumber:record.provider_reference,amount:addMoney(String(record.amount),'0',0),currency:'IDR'});
 if(status.sandbox!==connection.sandbox||(record.provider_txn_id&&status.txnId!==record.provider_txn_id))return new Response(null,{status:409});
 const bodyHash=hash(raw);await q(tx,'insert into payment_webhook_events(workspace_id,connection_id,request_id,body_hash,payment_request_id,status) values($1,$2,$3,$4,$5,$6::jsonb) on conflict(connection_id,request_id) do nothing',[bootstrap.workspace_id,connection.id,bodyHash,bodyHash,record.id,JSON.stringify(status)]);
 await q(tx,"update payment_requests set provider_txn_id=coalesce(provider_txn_id,$3),next_check_at=least(next_check_at,now()+interval '60 seconds') where workspace_id=$1 and id=$2",[bootstrap.workspace_id,record.id,status.txnId]);
 return Response.json({received:true});
 });}catch{return new Response(null,{status:400});}
},{parse:'none'});
async function readBody(request:Request){const reader=request.body?.getReader();if(!reader)throw new Error('Empty callback.');let size=0;const chunks:Uint8Array[]=[];try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536){await reader.cancel();throw new Error('Oversized callback.');}chunks.push(part.value);}}finally{reader.releaseLock();}return Buffer.concat(chunks);}
async function internal<T>(ws:string,run:(tx:Parameters<typeof q>[0],actor:{id:string;name:string},w:any)=>Promise<T>){return client.begin(async tx=>{const [w]=await tx.unsafe('select w.owner_user_id,w.timezone,u.name from workspaces w join "user" u on u.id=w.owner_user_id and u.account_status=\'active\' and u.email_verified=true join workspace_memberships m on m.workspace_id=w.id and m.user_id=w.owner_user_id and m.role=\'owner\' where w.id=$1 and w.archived_at is null',[ws]);if(!w)reject('Business unavailable.',404);await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[w.owner_user_id,ws]);return run(tx,{id:w.owner_user_id,name:w.name},w);});}
export async function reconcilePayment(ws:string,id:string,manual=false){
 const prepared=await internal(ws,async tx=>{const [p]=await q(tx,"select p.*,c.sandbox,c.provider from payment_requests p join payment_connections c on c.workspace_id=p.workspace_id and c.id=p.connection_id where p.workspace_id=$1 and p.id=$2 and p.created_at<=now()-interval '60 seconds' and (p.lease_until is null or p.lease_until<now()) and ($3 or p.next_check_at<=now()) for update of p",[ws,id,manual]);if(!p||['refunded','partially_refunded'].includes(p.state)||p.state==='expired'||(p.state==='paid'&&!manual))return null;await q(tx,"update payment_requests set lease_until=now()+interval '2 minutes',check_attempts=check_attempts+1,next_check_at=now()+interval '2 minutes' where workspace_id=$1 and id=$2",[ws,id]);return p;});if(!prepared||['refunded','partially_refunded'].includes(prepared.state))return;
 let status;try{const [connection]=await internal(ws,async tx=>q(tx,'select * from payment_connections where workspace_id=$1 and id=$2',[ws,prepared.connection_id]));if(connection.provider==='pakasir'){if(!prepared.provider_txn_id||!prepared.payment_url){const recovered=await createPakasirCheckout(ws,id,connection,{invoiceNumber:prepared.provider_reference,amount:addMoney(String(prepared.amount),'0',0),qrisOnly:prepared.qris_only});prepared.provider_txn_id=recovered.tokenId;status=recovered.status;}else status=await new PakasirClient(pakasirCredentials(connection)).status(prepared.provider_txn_id);}else status=await new DokuClient(credentials(connection)).status(prepared.provider_reference,randomUUID());assertDokuPayment(status,{invoiceNumber:prepared.provider_reference,amount:addMoney(String(prepared.amount),'0',0),currency:'IDR'});if(status.originalRequestId&&status.originalRequestId!==prepared.provider_request_id)throw new Error('Request mismatch.');}catch(error){
 const candidate=(error as {code?:unknown})?.code;
 const code=typeof candidate==='string'&&/^(?:PAYMENT_PROVIDER_(?:UNAVAILABLE|RATE_LIMITED|FAILED|HTTP_[0-9]{3})|INVALID_PAYMENT_PROVIDER_RESPONSE|INVALID_PAYMENT_AMOUNT|INVALID_PAYMENT_PROVIDER_INPUT)$/.test(candidate)?candidate:'STATUS_CHECK_FAILED';
 const details=(error as {providerErrors?:string[]})?.providerErrors??[];
 await internal(ws,async tx=>q(tx,"update payment_requests set lease_until=null,failure_code=$3,provider_status=case when state in ('creating','uncertain') then jsonb_build_object('checkoutError',$4::jsonb) else provider_status end,next_check_at=now()+interval '5 minutes' where workspace_id=$1 and id=$2",[ws,id,code,JSON.stringify(details)]));return;
 }
 await internal(ws,async(tx,actor,w)=>{const [p]=await q(tx,'select * from payment_requests where workspace_id=$1 and id=$2 for update',[ws,id]);let state=p.state,code:string|null=null;
  if(status.status==='PENDING'&&connectionIsPakasir(prepared)&&p.payment_url&&['creating','uncertain'].includes(state))state='ready';
  if(status.status==='SUCCESS'&&!p.payment_id&&!p.unapplied_transaction_id){
   try{const result=await tx.savepoint(sp=>recordInvoiceReceipt(sp,ws,actor,{invoiceId:p.invoice_id,amount:addMoney(String(p.amount),'0',0),accountId:p.account_id,categoryId:p.category_id,paidOn:workspaceToday(w.timezone),reference:'Gateway '+p.provider_reference,idempotencyKey:(prepared.provider==='pakasir'?'pakasir-':'doku-')+p.id,checkExistingIncome:true}));await q(tx,'update payment_requests set payment_id=$3 where workspace_id=$1 and id=$2',[ws,id,result.payment.id]);state='paid';}
   catch{state='reconciliation';code='RECEIPT_REVIEW_REQUIRED';}
  }else if(status.status==='SUCCESS'&&p.unapplied_transaction_id){state='reconciliation';code='UNAPPLIED_FUNDS_REVIEW_REQUIRED';}else if(status.status==='SUCCESS'&&p.payment_id){const [receipt]=await q(tx,'select reversed_at from invoice_payments where workspace_id=$1 and id=$2',[ws,p.payment_id]);if(receipt?.reversed_at){state='reconciliation';code='REVERSED_RECEIPT_REVIEW_REQUIRED';}else state='paid';}
  else if(status.status==='REFUNDED'){state='reconciliation';code='REFUND_REVIEW_REQUIRED';}
  else if(status.status==='EXPIRED'&&p.state!=='paid')state='expired';
  await q(tx,"update payment_requests set provider_status=$3::jsonb,state=$4,failure_code=$5,lease_until=null,next_check_at=now()+case when checkout_method='qris' then interval '30 seconds' else interval '5 minutes' end,updated_at=now() where workspace_id=$1 and id=$2",[ws,id,JSON.stringify(status),state,code]);
 });
}
export async function sweepPayments(){const rows=await client`select workspace_id,id from payment_requests where state in ('creating','ready','uncertain') and next_check_at<=now() and (lease_until is null or lease_until<now()) order by next_check_at limit 25`;for(const row of rows)try{await reconcilePayment(row.workspace_id,row.id);}catch{console.error('Payment reconciliation deferred.');}}
export function startPaymentScheduler(){let running=false;const tick=async()=>{if(running)return;running=true;try{await sweepPayments();}finally{running=false;}};void tick();const timer=setInterval(()=>void tick(),30000);timer.unref();}

function connectionIsPakasir(row:any){return row.provider==='pakasir';}
async function createPakasirCheckout(ws:string,id:string,connection:any,input:{invoiceNumber:string;amount:string;qrisOnly?:boolean}){
 const [saved]=await internal(ws,tx=>q(tx,'select checkout_method,public_token from payment_requests where workspace_id=$1 and id=$2',[ws,id]));
 const directQris=saved.checkout_method==='qris';
 const provider=new PakasirClient(pakasirCredentials(connection)),checkout=await provider.create({...input,directQris});
 await internal(ws,tx=>q(tx,'update payment_requests set provider_txn_id=$3 where workspace_id=$1 and id=$2',[ws,id,checkout.tokenId]));
 const status=await provider.status(checkout.tokenId);assertDokuPayment(status,{invoiceNumber:input.invoiceNumber,amount:input.amount,currency:'IDR'});
 await internal(ws,tx=>q(tx,"update payment_requests set state=case when state in ('creating','uncertain') then 'ready' else state end,payment_url=$3,provider_expiry=$4,qr_string=$5,provider_fee=$6,total_payment=$7,provider_status=$8::jsonb,failure_code=null,updated_at=now() where workspace_id=$1 and id=$2",[ws,id,directQris?'/pay/'+saved.public_token:checkout.paymentUrl,checkout.expiresAtProvider,checkout.qrString,checkout.fee,checkout.totalPayment,JSON.stringify(status)]));return {...checkout,status};
}

// Compatibility for existing scripts and legacy DOKU fixtures.
export const sweepDokuPayments=sweepPayments;
export const startDokuScheduler=startPaymentScheduler;
