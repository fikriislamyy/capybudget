import {test,expect,beforeAll,afterAll} from 'bun:test';
import {randomUUID} from 'node:crypto';
import {hashPassword} from 'better-auth/crypto';
const enabled=process.env.BUSINESS_INTEGRATION==='1';
if(enabled&&!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))throw new Error('An isolated _test database is required.');
if(enabled){
 const {client}=await import('../../src/db');const {app}=await import('../../src/app');app.compile();
 const roles=['owner','accountant','staff','viewer','outsider'] as const;
 const people=new Map<string,{id:string,email:string,cookie:string}>();let ws='',otherWs='',ownDraft='',ownerDraft='';
 const password='IsolatedBusinessChecks!42';
 const request=async(role:string,path:string,method='GET',body?:unknown)=>app.handle(new Request('http://localhost:5173'+path,{method,headers:{cookie:people.get(role)!.cookie,origin:process.env.WEB_ORIGIN??'http://localhost:5173','content-type':'application/json','idempotency-key':randomUUID()},...(body===undefined?{}:{body:JSON.stringify(body)})}));
 const base=()=>'/api/workspaces/'+ws;
 beforeAll(async()=>{
  const hash=await hashPassword(password);
  for(const role of roles){const id='business-check-'+randomUUID(),email=id+'@example.test';
   await client`insert into "user"(id,name,email,email_verified) values(${id},${role},${email},true)`;
   await client`insert into account(id,account_id,provider_id,user_id,password) values(${randomUUID()},${id},'credential',${id},${hash})`;
   people.set(role,{id,email,cookie:''});const login=await request(role,'/api/auth/sign-in/email','POST',{email,password});
   expect(login.status,await login.clone().text()).toBe(200);people.get(role)!.cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
  }
  let result=await request('owner','/api/workspaces','POST',{kind:'business',name:'Collaboration fixture',currency:'IDR',timezone:'Asia/Jakarta'});expect(result.status,await result.clone().text()).toBe(201);ws=(await result.json()).workspace.id;
  const foreign=await request('outsider','/api/workspaces','POST',{kind:'business',name:'Other business',currency:'IDR',timezone:'Asia/Jakarta'});otherWs=(await foreign.json()).workspace.id;
  for(const role of ['accountant','staff','viewer'])await client`insert into workspace_memberships(workspace_id,user_id,role) values(${ws},${people.get(role)!.id},${role})`;
  result=await request('staff',base()+'/invoices','POST',{});expect(result.status,await result.clone().text()).toBe(201);ownDraft=(await result.json()).invoice.id;
  result=await request('owner',base()+'/invoices','POST',{});ownerDraft=(await result.json()).invoice.id;
 },30000);
 afterAll(async()=>{await client.end();});
 test('owner can inspect team while other roles cannot',async()=>{
  expect((await request('owner',base()+'/members')).status).toBe(200);
  for(const role of ['accountant','staff','viewer','outsider'])expect((await request(role,base()+'/members')).status).toBeOneOf([403,404]);
 });
 test('viewer financial reads are allowed and mutations denied',async()=>{
  expect((await request('viewer',base()+'/accounts')).status).toBe(200);
  for(const resource of ['accounts','categories','invoices','bills','budgets','goals','business-tax/rates','invitations']){
   expect((await request('viewer',base()+'/'+resource,'POST',{})).status,resource).toBe(403);
  }
 });
 test('staff see only their own drafts and cannot access issued financial data',async()=>{
  const result=await request('staff',base()+'/invoices');expect(result.status).toBe(200);const items=(await result.json()).items;
  expect(items.map((i:any)=>i.id)).toContain(ownDraft);expect(items.map((i:any)=>i.id)).not.toContain(ownerDraft);
  expect((await request('staff',base()+'/invoices/'+ownerDraft)).status).toBe(404);
  expect((await request('staff',base()+'/invoices/'+ownDraft)).status).toBe(200);
  for(const path of ['/accounts','/transactions','/reports/runs','/business-audit','/invoices/'+ownDraft+'/issue','/invoices/'+ownDraft+'/send','/invoices/'+ownDraft+'/payments'])expect((await request('staff',base()+path,path.includes('/invoices/')?'POST':'GET',path.includes('/invoices/')?{}:undefined)).status).toBe(403);
 });
 test('accountant cannot change tax, membership or provider administration',async()=>{
  for(const [path,method] of [['/business-tax','PATCH'],['/business-profile','PATCH'],['/invitations','POST'],['/members/'+people.get('staff')!.id,'PATCH']])expect((await request('accountant',base()+path!,method!,{})).status).toBe(403);
  expect((await request('accountant',base()+'/business-audit')).status).toBe(200);
 });
 test('foreign workspace IDs never grant access',async()=>{
  expect((await request('owner','/api/workspaces/'+otherWs+'/invoices')).status).toBe(404);
  expect((await request('outsider',base()+'/business-profile')).status).toBe(404);
 });
 test('invites bind the verified email, are hashed, and accept idempotently',async()=>{
  const result=await request('owner',base()+'/invitations','POST',{email:people.get('outsider')!.email,role:'viewer'});expect(result.status,await result.clone().text()).toBe(200);const invite=await result.json(),token=invite.url.split('#')[1];
  const [stored]=await client`select token_hash,email_snapshot from business_invitations where id=${invite.id}`;expect(stored!.token_hash).not.toBe(token);expect(stored!.email_snapshot).not.toContain(people.get('outsider')!.email);
  expect((await request('staff','/api/business/invitations/accept','POST',{token})).status).toBe(409);
  for(let i=0;i<2;i++){const accepted=await request('outsider','/api/business/invitations/accept','POST',{token});expect(accepted.status,await accepted.clone().text()).toBe(200);expect((await accepted.json()).workspaceId).toBe(ws);}
  const rows=await client`select role from workspace_memberships where workspace_id=${ws} and user_id=${people.get('outsider')!.id}`;expect(rows).toHaveLength(1);expect(rows[0]!.role).toBe('viewer');
 });
 test('revocation is effective on the next request',async()=>{
  const id=people.get('outsider')!.id;
  expect((await request('owner',base()+'/members/'+id,'DELETE')).status).toBe(200);
  expect((await request('outsider',base()+'/invoices')).status).toBe(404);
 });
 test('last business owner is protected by the database',async()=>{
  let refused=false;try{await client`delete from workspace_memberships where workspace_id=${ws} and user_id=${people.get('owner')!.id}`;}catch{refused=true;}expect(refused).toBe(true);
  expect((await request('owner',base()+'/members/'+people.get('owner')!.id,'DELETE')).status).toBe(409);
 });

 test('directory contact encryption, catalog SKU uniqueness and invoice snapshots',async()=>{
  let r=await request('owner',base()+'/contacts','POST',{name:'Snapshot customer',kind:'both',details:{email:'snapshot@example.test',phone:'123',address:{street:'Street',city:'City',country:'ID'}}});expect(r.status,await r.clone().text()).toBe(201);const contact=(await r.json()).contact;
  const [stored]=await client`select details from business_contacts where id=${contact.id}`;expect(JSON.stringify(stored!.details)).not.toContain('snapshot@example.test');
  r=await request('owner',base()+'/catalog','POST',{name:'Consulting',sku:'CONSULT-1',kind:'service',unit:'hour',unitPrice:'50000',currency:'IDR'});expect(r.status,await r.clone().text()).toBe(201);const item=(await r.json()).item;
  expect((await request('staff',base()+'/catalog','POST',{})).status).toBe(403);
  expect((await request('viewer',base()+'/contacts','PATCH',{})).status).toBeOneOf([403,404]);
  expect((await request('owner',base()+'/catalog','POST',{name:'Duplicate',sku:'consult-1',kind:'service',unit:'hour',unitPrice:'1',currency:'IDR'})).status).toBe(409);
  r=await request('owner',base()+'/invoices','POST',{contactId:contact.id,recipient:contact.details,lines:[{catalogItemId:item.id,catalogVersion:item.version,description:item.description,quantity:'2',unitPrice:'50000'}]});expect(r.status,await r.clone().text()).toBe(201);const invoice=(await r.json()).invoice;expect(invoice.total).toBe('100000.0000');expect(invoice.lines[0].catalogSnapshot.sku).toBe('CONSULT-1');
  expect((await request('owner',base()+'/catalog/'+item.id,'PATCH',{version:item.version,name:'Changed',sku:'CONSULT-1',kind:'service',unit:'hour',unitPrice:'70000',currency:'IDR'})).status).toBe(200);
  r=await request('owner',base()+'/invoices/'+invoice.id,'PATCH',{version:invoice.version,lines:invoice.lines});expect(r.status,await r.clone().text()).toBe(200);const preserved=(await r.json()).invoice;expect(preserved.lines[0].catalogSnapshot.name).toBe('Consulting');expect(preserved.total).toBe('100000.0000');
 });

 test('Pakasir callback authentication, durable replay and idempotent invoice receipt',async()=>{
  const {reconcilePayment}=await import('../../src/business/payments');
  let r=await request('owner',base()+'/business-profile','PATCH',{legalName:'Fixture business',tradingName:'',contactEmail:'fixture@example.test',phone:'',taxId:'',address:{street:'Street',city:'City',country:'ID'}});expect(r.status,await r.clone().text()).toBe(200);
  r=await request('owner',base()+'/accounts','POST',{name:'Pakasir bank',kind:'bank',currency:'IDR',openingBalance:'0'});expect(r.status,await r.clone().text()).toBe(201);const account=(await r.json()).account;
  const categories=(await (await request('owner',base()+'/categories')).json()).items;const category=categories.find((c:any)=>c.type==='income');
  r=await request('owner',base()+'/payment-connections','POST',{projectSlug:'sandbox-fixture',apiKey:'isolated-test-secret',webhookSecret:'isolated-webhook-secret',sandbox:true,accountId:account.id,categoryId:category.id});expect(r.status,await r.clone().text()).toBe(200);const connection=await r.json();
  const [stored]=await client`select secret_key from payment_connections where id=${connection.id}`;expect(stored!.secret_key).not.toContain('isolated-test-secret');
  const connections=await request('owner',base()+'/payment-connections');expect(await connections.text()).not.toContain('secret_key');expect((await request('accountant',base()+'/payment-connections')).status).toBe(403);
  r=await request('owner',base()+'/invoices','POST',{issueDate:'2020-01-01',dueDate:'2020-01-10',recipient:{name:'Buyer',email:'buyer@example.test',address:{street:'Buyer St',city:'City',country:'ID'}},lines:[{description:'Consulting',quantity:'1',unitPrice:'50000'}]});expect(r.status).toBe(201);const invoice=(await r.json()).invoice;
  r=await request('owner',base()+'/invoices/'+invoice.id+'/issue','POST',{version:invoice.version});expect(r.status,await r.clone().text()).toBe(200);
  const originalFetch=globalThis.fetch;let reference='';
  globalThis.fetch=(async(input:any,options:any)=>{
   const url=String(input);if(!url.startsWith('https://app.pakasir.com/api/v2/'))throw new Error('Unexpected network request in payment fixture.');
   expect(options.headers['X-Api-Key']).toBe('isolated-test-secret');
   if(options.method==='POST'){expect(JSON.parse(options.body)).toEqual({method:'qris',amount:50000});reference=url.split('/').at(-1)!;return Response.json({txn_id:'fixture-token',project:'sandbox-fixture',order_id:reference,amount:50000,fee:1000,total_payment:51000,payment_method:'qris',qr_string:'000201fixture',expired_at:'2026-10-06T23:59:59Z',is_sandbox:true});}
   return Response.json({txn_id:'fixture-token',order_id:reference,amount:50000,is_sandbox:true,status:'completed',completed_at:'2026-10-04T01:00:00Z'});
  }) as typeof fetch;
  try{
   r=await request('owner',base()+'/invoices/'+invoice.id+'/payment-requests','POST',{connectionId:connection.id,qrisOnly:false,idempotencyKey:'fixture-'+randomUUID()});expect(r.status,await r.clone().text()).toBe(200);const payment=(await r.json()).request;expect(payment.state).toBe('ready');
   const raw=JSON.stringify({txn_id:'fixture-token',order_id:reference,amount:50000,is_sandbox:true,status:'completed',completed_at:'2026-10-04T01:00:00Z'}),path='/api/payments/pakasir/'+connection.id,headers={'X-Secret':'isolated-webhook-secret','content-type':'application/json'};
   const callback=()=>app.handle(new Request('http://localhost:5173'+path,{method:'POST',headers,body:raw}));
   expect((await app.handle(new Request('http://localhost:5173'+path,{method:'POST',headers:{...headers,'X-Secret':'invalid'},body:raw}))).status).toBe(401);
   for(let i=0;i<2;i++){const response=await callback();expect(response.status,await response.clone().text()).toBe(200);}
   expect((await client`select id from payment_webhook_events where connection_id=${connection.id}`).length).toBe(1);
   expect((await client`select id from invoice_payments where invoice_id=${invoice.id}`).length).toBe(0);
   await client`update payment_requests set created_at=now()-interval '2 minutes',next_check_at=now()-interval '1 second' where id=${payment.id}`;
   await reconcilePayment(ws,payment.id,true);await reconcilePayment(ws,payment.id,true);
   const [paid]=await client`select state,payment_id from payment_requests where id=${payment.id}`;expect(paid!.state).toBe('paid');expect(paid!.payment_id).toBeTruthy();
   const receipts=await client`select transaction_id from invoice_payments where invoice_id=${invoice.id}`;expect(receipts).toHaveLength(1);
   const [ledger]=await client`select sum(debit-credit)::text as balance,sum(base_debit-base_credit)::text as base_balance from journal_lines where workspace_id=${ws} and entry_id in (select id from journal_entries where transaction_id=${receipts[0]!.transaction_id})`;expect(Number(ledger!.balance)).toBe(0);expect(Number(ledger!.base_balance)).toBe(0);
   await client`update invoice_payments set paid_on='2020-01-02' where invoice_id=${invoice.id}`;
   const expense=categories.find((c:any)=>c.type==='expense');
   const fee={confirm:true,amount:'1000',paidOn:'2020-01-03',categoryId:expense.id,reason:'Actual fixture fee',idempotencyKey:'fee-'+randomUUID()};
   for(let i=0;i<2;i++){r=await request('accountant',base()+'/payment-requests/'+payment.id+'/fees','POST',fee);expect(r.status,await r.clone().text()).toBe(200);}
   expect((await client`select id from payment_request_fees where request_id=${payment.id}`).length).toBe(1);
   const refund={confirm:true,amount:'10000',paidOn:'2020-01-05',categoryId:expense.id,reason:'Actual fixture refund',idempotencyKey:'refund-'+randomUUID()};let refundId='';
   for(let i=0;i<2;i++){r=await request('accountant',base()+'/payment-requests/'+payment.id+'/refunds','POST',refund);expect(r.status,await r.clone().text()).toBe(200);refundId=(await r.json()).id;}
   const [adjusted]=await client`select refunded_amount::text from invoice_payments where invoice_id=${invoice.id}`;expect(Number(adjusted!.refunded_amount)).toBe(10000);
   let detail=(await (await request('owner',base()+'/invoices/'+invoice.id)).json()).invoice;expect(Number(detail.outstanding)).toBe(10000);
   expect((await request('viewer',base()+'/payment-requests/'+payment.id+'/refunds','POST',refund)).status).toBe(403);
   r=await request('owner',base()+'/payment-requests/'+payment.id+'/refunds','POST',{...refund,amount:'40001',idempotencyKey:'too-large-'+randomUUID()});expect(r.status).toBe(422);
   const [beforeRefund,afterRefund]=await Promise.all(['2020-01-03','2020-01-07'].map(date=>request('owner',base()+'/business-aging?asOf='+date).then(r=>r.json())));
   expect(beforeRefund.rows.some((r:any)=>r.id===invoice.id)).toBe(false);expect(Number(afterRefund.rows.find((r:any)=>r.id===invoice.id).outstanding)).toBe(10000);
   r=await request('owner',base()+'/projects','POST',{name:'Refund fixture'});expect(r.status).toBe(200);const project=await r.json();
   r=await request('owner',base()+'/projects/'+project.id+'/allocations','POST',{invoiceLineId:invoice.lines[0].id,amount:'50000'});expect(r.status,await r.clone().text()).toBe(200);
   r=await request('owner',base()+'/projects/'+project.id+'/profitability?from=2020-01-01&through=2020-01-07');expect(r.status,await r.clone().text()).toBe(200);expect(Number((await r.json()).totals[0].revenue)).toBe(40000);
   for(let i=0;i<2;i++){r=await request('accountant',base()+'/payment-requests/'+payment.id+'/adjustments/'+refundId+'/reverse','POST',{confirm:true,effectiveOn:'2020-01-10',reason:'Mistaken fixture refund record'});expect(r.status,await r.clone().text()).toBe(200);}
   detail=(await (await request('owner',base()+'/invoices/'+invoice.id)).json()).invoice;expect(Number(detail.outstanding)).toBe(0);
   const later=await (await request('owner',base()+'/business-aging?asOf=2020-01-12')).json();expect(later.rows.some((r:any)=>r.id===invoice.id)).toBe(false);
   const historical=await (await request('owner',base()+'/business-aging?asOf=2020-01-07')).json();expect(Number(historical.rows.find((r:any)=>r.id===invoice.id).outstanding)).toBe(10000);
   r=await request('owner',base()+'/projects/'+project.id+'/profitability?from=2020-01-01&through=2020-01-12');expect(r.status,await r.clone().text()).toBe(200);expect(Number((await r.json()).totals[0].revenue)).toBe(50000);

  }finally{globalThis.fetch=originalFetch;}
 },30000);

 test('net settlement replaces imported net income without changing the bank balance',async()=>{
  const {reconcilePayment}=await import('../../src/business/payments');const connection=(await (await request('owner',base()+'/payment-connections')).json()).items.find((c:any)=>!c.disabledAt);
  const categories=(await (await request('owner',base()+'/categories')).json()).items,expense=categories.find((c:any)=>c.type==='expense');
  let r=await request('owner',base()+'/invoices','POST',{recipient:{name:'Net buyer',email:'net@example.test',address:{street:'Street',city:'City',country:'ID'}},lines:[{description:'Net fixture',quantity:'1',unitPrice:'50000'}]});expect(r.status).toBe(201);const invoice=(await r.json()).invoice;
  r=await request('owner',base()+'/invoices/'+invoice.id+'/issue','POST',{version:invoice.version});expect(r.status).toBe(200);
  const originalFetch=globalThis.fetch;let reference='';globalThis.fetch=(async(input:any,options:any)=>{const url=String(input);if(!url.startsWith('https://app.pakasir.com/api/v2/'))throw new Error('Unexpected network call.');if(options.method==='POST'){reference=url.split('/').at(-1)!;return Response.json({txn_id:'net-fixture',project:'sandbox-fixture',order_id:reference,amount:50000,fee:1000,total_payment:51000,payment_method:'qris',qr_string:'000201fixture',expired_at:'2026-10-06T23:59:59Z',is_sandbox:true});}return Response.json({txn_id:'net-fixture',order_id:reference,amount:50000,is_sandbox:true,status:'completed',completed_at:'2026-10-04T01:00:00Z'});}) as typeof fetch;
  try{
   r=await request('owner',base()+'/invoices/'+invoice.id+'/payment-requests','POST',{connectionId:connection.id,qrisOnly:false,idempotencyKey:'net-'+randomUUID()});expect(r.status,await r.clone().text()).toBe(200);const payment=(await r.json()).request;
   r=await request('owner',base()+'/transactions','POST',{type:'income',amount:'49000',date:invoice.issueDate,accountId:connection.accountId,categoryId:connection.categoryId,merchant:'Imported net settlement'});expect(r.status,await r.clone().text()).toBe(201);const source=await r.json();
   const balance=async()=>Number((await (await request('owner',base()+'/accounts')).json()).items.find((a:any)=>a.id===connection.accountId).balance);const before=await balance();
   await client`update payment_requests set created_at=now()-interval '2 minutes',next_check_at=now()-interval '1 second' where id=${payment.id}`;await reconcilePayment(ws,payment.id,true);
   const [held]=await client`select state,payment_id from payment_requests where id=${payment.id}`;expect(held!.state).toBe('reconciliation');expect(held!.payment_id).toBeNull();expect(await balance()).toBe(before);
   const body={confirm:true,transactionId:source.id,paidOn:invoice.issueDate,feeAmount:'1000',categoryId:expense.id};
   for(let i=0;i<2;i++){r=await request('accountant',base()+'/payment-requests/'+payment.id+'/net-match','POST',body);expect(r.status,await r.clone().text()).toBe(200);}
   expect(await balance()).toBe(before);expect((await client`select id from invoice_payments where invoice_id=${invoice.id}`).length).toBe(1);expect((await client`select id from payment_request_fees where request_id=${payment.id}`).length).toBe(1);
   const details=(await (await request('owner',base()+'/invoices/'+invoice.id)).json()).invoice;expect(Number(details.outstanding)).toBe(0);
   expect((await request('owner',base()+'/transactions/'+source.id+'/restore','POST',{})).status).toBe(422);
  }finally{globalThis.fetch=originalFetch;}
 },30000);

 test('concurrent manual receipts cannot exceed the final invoice balance',async()=>{
  const connection=(await (await request('owner',base()+'/payment-connections')).json()).items.find((c:any)=>!c.disabledAt);
  let r=await request('owner',base()+'/invoices','POST',{recipient:{name:'Concurrent buyer',email:'concurrent@example.test',address:{street:'Street',city:'City',country:'ID'}},lines:[{description:'Concurrent fixture',quantity:'1',unitPrice:'50000'}]});const invoice=(await r.json()).invoice;
  r=await request('owner',base()+'/invoices/'+invoice.id+'/issue','POST',{version:invoice.version});expect(r.status).toBe(200);
  const body={amount:'30000',paidOn:invoice.issueDate,accountId:connection.accountId,categoryId:connection.categoryId};
  const responses=await Promise.all([request('owner',base()+'/invoices/'+invoice.id+'/payments','POST',{...body,idempotencyKey:randomUUID()}),request('accountant',base()+'/invoices/'+invoice.id+'/payments','POST',{...body,idempotencyKey:randomUUID()})]);expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
  const receipts=await client`select amount::text from invoice_payments where invoice_id=${invoice.id}`;expect(receipts).toHaveLength(1);expect(Number(receipts[0]!.amount)).toBe(30000);
  const current=(await (await request('owner',base()+'/invoices/'+invoice.id)).json()).invoice;expect(Number(current.outstanding)).toBe(20000);
 });

 test('recurring invoices stay anchored, use unique occurrences and default to drafts',async()=>{
  const {prepareRecurringInvoices,processRecurringInvoice}=await import('../../src/business/recurring');
  const source=(await (await request('owner',base()+'/invoices?limit=100')).json()).items.find((i:any)=>i.state==='issued');
  const r=await request('owner',base()+'/recurring-invoices','POST',{name:'Month-end fixture',invoiceId:source.id,anchorDate:'2026-01-31',frequency:'month',interval:1,dueDays:14,endDate:'2026-03-31',autoIssue:false,autoSend:false});expect(r.status,await r.clone().text()).toBe(200);const template=await r.json();
  await prepareRecurringInvoices(ws,people.get('owner')!.id);await prepareRecurringInvoices(ws,people.get('owner')!.id);
  let occurrences=(await (await request('owner',base()+'/recurring-invoices/'+template.id+'/occurrences')).json()).items;
  expect(occurrences.map((o:any)=>o.scheduledOn).sort()).toEqual(['2026-01-31','2026-02-28','2026-03-31']);
  const occurrence=occurrences[0];await Promise.all([processRecurringInvoice(ws,occurrence.id,people.get('owner')!.id),processRecurringInvoice(ws,occurrence.id,people.get('owner')!.id)]);
  occurrences=(await (await request('owner',base()+'/recurring-invoices/'+template.id+'/occurrences')).json()).items;
  const generated=occurrences.find((o:any)=>o.id===occurrence.id);expect(generated.state).toBe('draft');expect(generated.invoiceId).toBeTruthy();
  const invoice=(await (await request('owner',base()+'/invoices/'+generated.invoiceId)).json()).invoice;expect(invoice.state).toBe('draft');expect(invoice.issueDate).toBe(occurrence.scheduledOn);
  expect((await request('viewer',base()+'/recurring-invoices/'+template.id,'PATCH',{active:false,version:1})).status).toBe(403);
 });
 test('vendor partial settlement, dated reversal, aging and project allocation bounds',async()=>{
  let r=await request('owner',base()+'/contacts','POST',{name:'Vendor fixture',kind:'vendor',details:{email:'vendor@example.test'}});const vendor=(await r.json()).contact;
  r=await request('owner',base()+'/vendor-bills','POST',{vendorId:vendor.id,supplierNumber:'SUP-'+randomUUID(),issueDate:'2026-09-01',dueDate:'2026-09-15',currency:'IDR',lines:[{description:'Office cost',quantity:'1',unitPrice:'100000'}]});expect(r.status,await r.clone().text()).toBe(200);let bill=(await r.json()).bill;
  r=await request('owner',base()+'/vendor-bills/'+bill.id,'PATCH',{version:bill.version,vendorId:vendor.id,supplierNumber:bill.supplier_number,issueDate:'2026-09-01',dueDate:'2026-09-15',currency:'IDR',lines:[{description:'Office cost edited',quantity:'1',unitPrice:'100000'}]});expect(r.status,await r.clone().text()).toBe(200);
  r=await request('owner',base()+'/vendor-bills/'+bill.id+'/issue','POST');expect(r.status,await r.clone().text()).toBe(200);
  const accounts=(await (await request('owner',base()+'/accounts')).json()).items;const account=accounts.find((a:any)=>a.currency==='IDR');const category=(await (await request('owner',base()+'/categories')).json()).items.find((c:any)=>c.type==='expense');
  const body={amount:'40000',paidOn:'2026-09-10',accountId:account.id,categoryId:category.id,idempotencyKey:'vendor-'+randomUUID()};
  for(let i=0;i<2;i++){r=await request('owner',base()+'/vendor-bills/'+bill.id+'/payments','POST',body);expect(r.status,await r.clone().text()).toBe(200);}
  bill=(await (await request('owner',base()+'/vendor-bills/'+bill.id)).json()).bill;expect(bill.payments).toHaveLength(1);expect(bill.outstanding).toBe('60000');
  const [payment]=await client`select transaction_id from vendor_bill_payments where id=${bill.payments[0].id}`;
  const [record]=await client`select version from transactions where id=${payment!.transaction_id}`;
  expect((await request('owner',base()+'/transactions/'+payment!.transaction_id,'DELETE',{version:record!.version})).status).toBe(422);
  r=await request('owner',base()+'/projects','POST',{name:'Office allocation'});const project=await r.json();
  r=await request('owner',base()+'/projects/'+project.id+'/allocations','POST',{transactionId:payment!.transaction_id,amount:'40000'});expect(r.status,await r.clone().text()).toBe(200);
  r=await request('owner',base()+'/projects','POST',{name:'Other allocation'});const other=await r.json();
  expect((await request('owner',base()+'/projects/'+other.id+'/allocations','POST',{transactionId:payment!.transaction_id,amount:'1'})).status).toBe(422);
  r=await request('owner',base()+'/projects/'+project.id+'/profitability?from=2026-09-01&through=2026-09-30');expect(r.status,await r.clone().text()).toBe(200);const profit=await r.json();expect(profit.totals[0].cost).toBe('40000.0000');expect(profit.totals[0].marginPercent).toBeNull();
  r=await request('owner',base()+'/vendor-bills/'+bill.id+'/payments/'+bill.payments[0].id+'/reverse','POST',{reason:'Fixture reversal',effectiveOn:'2026-09-20'});expect(r.status,await r.clone().text()).toBe(200);
  for(const [date,outstanding] of [['2026-09-19','60000.0000'],['2026-09-20','100000.0000']]){r=await request('owner',base()+'/business-aging?asOf='+date);expect(r.status,await r.clone().text()).toBe(200);const aging=await r.json();expect(aging.rows.find((row:any)=>row.id===bill.id).outstanding).toBe(outstanding);}
  r=await request('owner',base()+'/projects/'+project.id+'/profitability?from=2026-09-01&through=2026-09-30');expect((await r.json()).totals[0].cost).toBe('0.0000');
 });
 test('tax reminders honor preferences and resolve after completion',async()=>{
  const {evaluateWorkspaceNotifications}=await import('../../src/notifications/scheduler');const {workspaceToday}=await import('../../src/tracking/recurrence');const now=new Date(),today=workspaceToday('Asia/Jakarta',now);const evaluation=new Date(today+'T05:00:00Z');
  let r=await request('accountant',base()+'/business-tax/reminders','POST',{name:'Configured tax deadline',dueOn:today});expect(r.status,await r.clone().text()).toBe(200);const reminder=await r.json();
  const [workspace]=await client`select id,owner_user_id,timezone,kind from workspaces where id=${ws}`;
  await evaluateWorkspaceNotifications(workspace!,evaluation);await evaluateWorkspaceNotifications(workspace!,evaluation);
  let notices=await client`select id,resolved_at from finance_notifications where workspace_id=${ws} and source_id=${reminder.id}`;expect(notices).toHaveLength(1);expect(notices[0]!.resolved_at).toBeNull();
  r=await request('accountant',base()+'/business-tax/reminders/'+reminder.id+'/complete','POST',{});expect(r.status).toBe(200);await evaluateWorkspaceNotifications(workspace!,evaluation);
  notices=await client`select id,resolved_at from finance_notifications where workspace_id=${ws} and source_id=${reminder.id}`;expect(notices[0]!.resolved_at).toBeTruthy();
  r=await request('owner',base()+'/notification-preferences','PUT',{channels:{'tax-reminder':{in_app:false}}});expect(r.status).toBe(200);
  r=await request('accountant',base()+'/business-tax/reminders','POST',{name:'Disabled tax deadline',dueOn:today});const disabled=await r.json();await evaluateWorkspaceNotifications(workspace!,evaluation);
  expect((await client`select id from finance_notifications where workspace_id=${ws} and source_id=${disabled.id}`).length).toBe(0);
 });

 test.skipIf(process.env.BUSINESS_MAILPIT!=='1')('automatic recurring invoice sends one real PDF to local Mailpit',async()=>{
  const {prepareRecurringInvoices,processRecurringInvoice,sweepRecurringInvoices}=await import('../../src/business/recurring');const {sendInvoicePdf,loadInvoiceDelivery}=await import('../../src/business/worker');
  const email='recurring-'+randomUUID()+'@example.test';let r=await request('owner',base()+'/invoices','POST',{recipient:{name:'Mailpit buyer',email,address:{street:'Street',city:'City',country:'ID'}},lines:[{description:'Recurring email fixture',quantity:'1',unitPrice:'25000'}]});expect(r.status).toBe(201);const invoice=(await r.json()).invoice;
  r=await request('owner',base()+'/recurring-invoices','POST',{name:'Local email fixture',invoiceId:invoice.id,anchorDate:invoice.issueDate,frequency:'month',interval:1,dueDays:14,endDate:invoice.issueDate,autoIssue:true,autoSend:true});expect(r.status,await r.clone().text()).toBe(200);const template=await r.json();
  await prepareRecurringInvoices(ws,people.get('owner')!.id);const [occurrence]=await client`select id from recurring_invoice_occurrences where template_id=${template.id}`;expect(occurrence).toBeTruthy();
  await processRecurringInvoice(ws,occurrence!.id,people.get('owner')!.id);await processRecurringInvoice(ws,occurrence!.id,people.get('owner')!.id);
  const [scheduled]=await client`select state,invoice_id from recurring_invoice_occurrences where id=${occurrence!.id}`;expect(scheduled!.state).toBe('queued');
  const deliveries=await client`select id,state from invoice_deliveries where invoice_id=${scheduled!.invoice_id}`;expect(deliveries).toHaveLength(1);
  const message={kind:'invoice-delivery' as const,to:email,invoiceNumber:'',workspaceId:ws,deliveryId:deliveries[0]!.id,requestedBy:people.get('owner')!.id,locale:'en' as const,expiresAt:Date.now()+60000};
  expect(await sendInvoicePdf(message)).toBe(true);expect(await sendInvoicePdf(message)).toBe(false);
  const captured=await (await fetch('http://localhost:8025/api/v1/search?'+new URLSearchParams({query:'to:'+email}))).json();expect(captured.messages).toHaveLength(1);const detail=await (await fetch('http://localhost:8025/api/v1/message/'+captured.messages[0].ID)).json();expect(detail.Attachments.some((a:any)=>a.ContentType==='application/pdf')).toBe(true);
  await sweepRecurringInvoices();const [sent]=await client`select state from recurring_invoice_occurrences where id=${occurrence!.id}`;expect(sent!.state).toBe('sent');
  // Revoke the requesting actor's role; queued work must stop before SMTP.
  await client`update invoice_deliveries set state='queued',requested_by=${people.get('accountant')!.id} where id=${deliveries[0]!.id}`;await client`update workspace_memberships set role='viewer' where workspace_id=${ws} and user_id=${people.get('accountant')!.id}`;
  const revoked={...message,requestedBy:people.get('accountant')!.id};expect(await loadInvoiceDelivery(revoked)).toBeNull();
  await client`update workspace_memberships set role='accountant' where workspace_id=${ws} and user_id=${people.get('accountant')!.id}`;await client`update invoice_deliveries set state='accepted',requested_by=${people.get('owner')!.id} where id=${deliveries[0]!.id}`;
 },30000);

 test('non-superuser RLS blocks foreign rows, viewer writes and staff financial reads',async()=>{
  // This role has SQL privileges but no BYPASSRLS; application guards are not involved.
  await client.unsafe("do $$ begin if not exists(select 1 from pg_roles where rolname='capybudget_business_rls_test') then create role capybudget_business_rls_test nologin nosuperuser nobypassrls; end if; end $$");
  await client.unsafe('grant usage on schema public to capybudget_business_rls_test');
  await client.unsafe('grant select,insert,update,delete on all tables in schema public to capybudget_business_rls_test');
  const scoped=async(role:string,run:(tx:any)=>Promise<void>)=>client.begin(async tx=>{await tx.unsafe('set local role capybudget_business_rls_test');await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[people.get(role)!.id,ws]);await run(tx);});
  await scoped('viewer',async tx=>{expect((await tx.unsafe('select id from invoices where workspace_id=$1',[ws])).length).toBeGreaterThan(0);expect((await tx.unsafe('select id from invoices where workspace_id=$1',[otherWs])).length).toBe(0);let denied=false;try{await tx.savepoint((sp:any)=>sp.unsafe('update business_projects set name=name where workspace_id=$1 returning id',[ws]));}catch(e){denied=(e as any).code==='42501';}expect(denied).toBe(true);expect((await tx.unsafe('delete from payment_request_fees where workspace_id=$1 returning id',[ws])).length).toBe(0);});
  await scoped('staff',async tx=>{const drafts=await tx.unsafe('select id from invoices where workspace_id=$1',[ws]);expect(drafts.map((d:any)=>d.id)).toContain(ownDraft);expect(drafts.map((d:any)=>d.id)).not.toContain(ownerDraft);expect((await tx.unsafe('select id from accounts where workspace_id=$1',[ws])).length).toBe(0);});
  await scoped('accountant',async tx=>{expect((await tx.unsafe('select id from vendor_bills where workspace_id=$1',[ws])).length).toBeGreaterThan(0);});
 });

 test('transfer promotes the new owner and preserves the former owner as accountant',async()=>{
  const result=await request('owner',base()+'/members/transfer-owner','POST',{userId:people.get('accountant')!.id,confirm:true});expect(result.status,await result.clone().text()).toBe(200);
  const [w]=await client`select owner_user_id from workspaces where id=${ws}`;expect(w!.owner_user_id).toBe(people.get('accountant')!.id);
  expect((await request('owner',base()+'/invitations','POST',{})).status).toBe(403);
  expect((await request('accountant',base()+'/members')).status).toBe(200);
 });
 test('former owner erasure removes identity and access while keeping business history',async()=>{
  const former=people.get('owner')!.id;const {eraseSubject}=await import('../../src/privacy/deletion');
  await client`update "user" set account_status='deletion_pending' where id=${former}`;
  await eraseSubject(former,[]);
  const [subject]=await client`select name,email,account_status from "user" where id=${former}`;
  expect(subject!.account_status).toBe('deleted');expect(subject!.name).toBe('Former member');expect(subject!.email).not.toBe(people.get('owner')!.email);
  expect((await client`select 1 from account where user_id=${former}`).length).toBe(0);
  expect((await client`select 1 from session where user_id=${former}`).length).toBe(0);
  expect((await client`select 1 from workspace_memberships where user_id=${former}`).length).toBe(0);
  expect((await request('accountant',base()+'/invoices/'+ownerDraft)).status).toBe(200);
 });

}
