import {protectedText,protectedJson,protectedContact,revealRow} from '../security/business-fields';
import { Elysia } from 'elysia';
import { createHash,randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { auth } from '../auth';
import { client } from '../db';
import { deleteAttachment,getAttachment,putAttachment } from '../tracking/storage';
import { workspaceToday } from '../tracking/recurrence';
import { addMoney,calculateInvoice,compareMoney,currencyScale,validPositiveAmount,type InvoiceLineInput } from './money';
import { renderInvoicePdf } from './pdf';
import { dispatchInvoiceDeliveries } from './worker';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,dateRe=/^\d{4}-\d{2}-\d{2}$/;
const q=async(tx:TransactionSql,s:string,v:unknown[]=[])=>{const rows=await tx.unsafe(s,v as never[]);return rows.map(row=>revealRow(row,String(row.workspace_id??v[0]??'')));};
const fail=(status:number,code:string,message:string)=>Response.json({code,message},{status,headers:{'Cache-Control':'no-store'}});
function reject(message:string,status=422,code='INVALID_INPUT'):never{throw Object.assign(new Error(message),{status,code});}
function validDate(v:unknown):v is string{return typeof v==='string'&&dateRe.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;}
function bounded(v:unknown,max:number,required=false):v is string{return typeof v==='string'&&v.length<=max&&(!required||!!v.trim());}
function validEmail(v:unknown):v is string{return typeof v==='string'&&v.length<=320&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);}
function cleanAddress(value:unknown){
 if(value==null)return {};if(typeof value!=='object'||Array.isArray(value))reject('Enter a valid address.');
 const v=value as Record<string,unknown>,out:Record<string,string>={};
 for(const key of ['street','city','region','postalCode','country'])if(v[key]!=null){if(!bounded(v[key],200))reject('Address fields must be 200 characters or fewer.');out[key]=String(v[key]).trim();}
 return out;
}
function recipient(value:unknown,complete=false){
 if(!value||typeof value!=='object'||Array.isArray(value))reject('Enter recipient details.');
 const v=value as Record<string,unknown>,name=typeof v.name==='string'?v.name.trim():'',mail=typeof v.email==='string'?v.email.trim():'';
 if(name.length>200||(complete&&!name))reject('Enter a recipient name up to 200 characters.');
 if(mail&&!validEmail(mail))reject('Enter a valid recipient email address.');
 if(complete&&!validEmail(mail))reject('A valid recipient email address is required before issue.');
 return {name,email:mail,address:cleanAddress(v.address),phone:bounded(v.phone,80)?v.phone.trim():'',taxId:bounded(v.taxId,100)?v.taxId.trim():''};
}
function mapError(e:unknown){const x=e as Error&{status?:number;code?:string};if(x.status)return fail(x.status,x.code??'REQUEST_FAILED',x.message);if(['23503','23505','23514','22P02'].includes(x.code??''))return fail(409,'DATA_CONFLICT','The record conflicts with existing finance data.');console.error('Business finance request failed',{sqlState:x.code??'unknown'});return fail(500,'INTERNAL_ERROR','The request could not be completed.');}
async function scope<T>(request:Request,ws:string,run:(tx:TransactionSql,user:{id:string;name:string;email:string},workspace:any)=>Promise<T>):Promise<T|Response>{
 if(!uuid.test(ws))return fail(400,'INVALID_WORKSPACE_ID','Workspace ID is invalid.');
 const session=await auth.api.getSession({headers:request.headers});if(!session)return fail(401,'AUTH_REQUIRED','Sign in to continue.');if(!session.user.emailVerified)return fail(403,'EMAIL_VERIFICATION_REQUIRED','Verify your email to continue.');
 try{return await client.begin(async tx=>{await q(tx,"select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[session.user.id,ws]);
 const [w]=await q(tx,'select w.kind,w.name,w.currency,w.timezone,p.* from workspaces w join workspace_memberships m on m.workspace_id=w.id and m.user_id=$2 left join business_profiles p on p.workspace_id=w.id where w.id=$1 and w.archived_at is null',[ws,session.user.id]);
 if(!w)reject('Workspace not found.',404,'WORKSPACE_NOT_FOUND');if(w.kind!=='business')reject('This action requires a business workspace.',403,'BUSINESS_WORKSPACE_REQUIRED');
 return run(tx,{id:session.user.id,name:session.user.name,email:session.user.email},w);}) as T|Response;}catch(e){return mapError(e);}
}
function addressReady(a:any){return !!(a&&a.street&&a.city&&a.country);}
function sellerSnapshot(w:any){return {legalName:w.legal_name,tradingName:w.trading_name,address:w.address,contactEmail:w.contact_email,phone:w.phone,taxId:w.tax_id,logoDocumentId:w.logo_document_id};}
async function linesFor(tx:TransactionSql,ws:string,id:string){return q(tx,'select id,position,description,quantity::text,unit_price::text as "unitPrice",discount_amount::text as "discountAmount",tax_rate::text as "taxRate",net_amount::text as "netAmount",tax_amount::text as "taxAmount",total_amount::text as "totalAmount" from invoice_lines where workspace_id=$1 and invoice_id=$2 order by position',[ws,id]);}
async function paidFor(tx:TransactionSql,ws:string,id:string){return (await q(tx,'select coalesce(sum(amount) filter(where reversed_at is null),0)::text as amount from invoice_payments where workspace_id=$1 and invoice_id=$2',[ws,id]))[0]!.amount as string;}
async function detail(tx:TransactionSql,ws:string,id:string):Promise<any>{
 if(!uuid.test(id))reject('Invoice ID is invalid.',400,'INVALID_ID');const [inv]=await q(tx,'select * from invoices where workspace_id=$1 and id=$2 and archived_at is null',[ws,id]);if(!inv)reject('Invoice not found.',404,'NOT_FOUND');
 const [paid,linesRaw,payments,deliveries,tz]=await Promise.all([paidFor(tx,ws,id),linesFor(tx,ws,id),
 q(tx,'select id,amount::text,currency,paid_on as "paidOn",reference,reversed_at as "reversedAt",reversal_reason as "reversalReason" from invoice_payments where workspace_id=$1 and invoice_id=$2 order by paid_on desc',[ws,id]),
 q(tx,'select id,state,attempts,error_code as "errorCode",accepted_at as "acceptedAt",created_at as "createdAt" from invoice_deliveries where workspace_id=$1 and invoice_id=$2 order by created_at desc limit 20',[ws,id]),
 q(tx,'select timezone from workspaces where id=$1',[ws])]);
 const scale=Number(inv.currency_scale),outstanding=compareMoney(String(inv.total),paid,scale)<=0?'0':addMoney(String(inv.total),'-'+paid,scale),today=workspaceToday(tz[0]!.timezone);
 const status=inv.state==='draft'?'draft':inv.state==='void'?'void':outstanding==='0'?'paid':compareMoney(paid,'0',scale)>0?'partially_paid':inv.due_date<today?'overdue':inv.first_sent_at?'sent':'issued';
 return {...inv,issueDate:inv.issue_date,dueDate:inv.due_date,expectedPaymentOn:inv.expected_payment_on,expectedAccountId:inv.expected_account_id,subtotal:String(inv.subtotal),discountTotal:String(inv.discount_total),taxTotal:String(inv.tax_total),total:String(inv.total),sellerSnapshot:inv.seller_snapshot,recipientSnapshot:inv.recipient_snapshot,paidAmount:paid,outstanding,status,lines:linesRaw as any[],payments,deliveries};
}
async function saveLines(tx:TransactionSql,ws:string,id:string,raw:unknown,currency:string){
 if(!Array.isArray(raw))reject('Invoice lines must be a list.');
 const input=raw.map((x:any)=>{if(!x||typeof x!=='object')reject('Enter valid invoice lines.');return {description:x.description,quantity:x.quantity,unitPrice:x.unitPrice,discountAmount:x.discountAmount??'0',taxRate:x.taxRate??'0'} as InvoiceLineInput;});
 const calc=calculateInvoice(input,currency);await q(tx,'delete from invoice_lines where workspace_id=$1 and invoice_id=$2',[ws,id]);
 for(let i=0;i<calc.lines.length;i++){const l=calc.lines[i]!;await q(tx,'insert into invoice_lines(workspace_id,invoice_id,position,description,quantity,unit_price,discount_amount,tax_rate,net_amount,tax_amount,total_amount) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[ws,id,i,l.description,l.quantity,l.unitPrice,l.discountAmount,l.taxRate,l.netAmount,l.taxAmount,l.totalAmount]);}
 await q(tx,'update invoices set subtotal=$3,discount_total=$4,tax_total=$5,total=$6 where workspace_id=$1 and id=$2',[ws,id,calc.subtotal,calc.discountTotal,calc.taxTotal,calc.total]);return calc;
}
async function audit(tx:TransactionSql,ws:string,user:string,id:string,action:string,before:any,after:any){
 await q(tx,"insert into audit_logs(workspace_id,actor_user_id,entity_type,entity_id,action,before,after) values($1,$2,'invoice',$3,$4,$5::jsonb,$6::jsonb)",[ws,user,id,action,before?protectedJson(before,ws,id,'before'):null,after?protectedJson(after,ws,id,'after'):null]);
}
async function issue(tx:TransactionSql,ws:string,user:string,id:string,version?:number){
 const [inv]=await q(tx,'select * from invoices where workspace_id=$1 and id=$2 and archived_at is null for update',[ws,id]);if(!inv)reject('Invoice not found.',404,'NOT_FOUND');
 if(inv.state!=='draft')reject('Only a draft invoice can be issued.',409,'INVALID_STATE');if(version!==undefined&&Number(inv.version)!==version)reject('Invoice changed. Reload and try again.',409,'VERSION_CONFLICT');
 const [profile]=await q(tx,'select * from business_profiles where workspace_id=$1',[ws]),to=recipient(inv.recipient_snapshot,true);
 if(!profile||!profile.legal_name?.trim()||!validEmail(profile.contact_email)||!addressReady(profile.address))reject('Complete the business legal name, email, and address before issuing.');
 if(!addressReady(to.address))reject('Add recipient street, city, and country before issuing.');
 if(!(await linesFor(tx,ws,id)).length||String(inv.total)==='0')reject('Add invoice lines with a positive total before issuing.');
 const [seq]=await q(tx,"insert into invoice_number_sequences(workspace_id,series,next_value) values($1,'INV',2) on conflict(workspace_id,series) do update set next_value=invoice_number_sequences.next_value+1 returning next_value-1 as allocated",[ws]);
 const number='INV-'+String(seq.allocated).padStart(6,'0'),seller=sellerSnapshot(profile);
 const [saved]=await q(tx,"update invoices set number=$3,state='issued',seller_snapshot=$4::jsonb,recipient_snapshot=$5::jsonb,issued_at=now(),version=version+1,updated_by=$6,updated_at=now() where workspace_id=$1 and id=$2 returning *",[ws,id,number,protectedContact(seller,ws,id,'seller_snapshot'),protectedContact(to,ws,id,'recipient_snapshot'),user]);
 await audit(tx,ws,user,id,'issue',null,{number,total:inv.total});return saved;
}
async function pdfInputs(ws:string,id:string){
 return client.begin(async tx=>{
  const [owner]=await q(tx,'select owner_user_id from workspaces where id=$1',[ws]);if(!owner)reject('Workspace not found.',404,'WORKSPACE_NOT_FOUND');
  await q(tx,"select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[owner.owner_user_id,ws]);
  const [inv]=await q(tx,'select * from invoices where workspace_id=$1 and id=$2 and archived_at is null',[ws,id]);if(!inv)reject('Invoice not found.',404,'NOT_FOUND');
  const lines=await linesFor(tx,ws,id) as any as any[];
  if(inv.state!=='draft'){const [doc]=await q(tx,"select id,object_key from business_documents where workspace_id=$1 and invoice_id=$2 and kind='invoice_pdf' and source_version=$3 and state='ready' limit 1",[ws,id,inv.version]);if(doc)return {inv,lines,doc};}
  if(inv.state==='draft'){const [profile]=await q(tx,'select * from business_profiles where workspace_id=$1',[ws]);inv.seller_snapshot=sellerSnapshot(profile??{});}
  return {inv,lines,doc:null};
 });
}
export async function ensurePdf(ws:string,id:string){
 const data=await pdfInputs(ws,id);
 if(data.doc)return data.doc;
 const seller=data.inv.seller_snapshot??{};
 if(seller.logoDocumentId){
  const logo=await client.begin(async tx=>{const [owner]=await q(tx,'select owner_user_id from workspaces where id=$1',[ws]);await q(tx,"select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[owner.owner_user_id,ws]);const [row]=await q(tx,"select object_key,mime_type from business_documents where workspace_id=$1 and id=$2 and kind='logo' and state='ready'",[ws,seller.logoDocumentId]);return row;});
  if(logo){const obj=await getAttachment(logo.object_key),bytes=await obj.Body!.transformToByteArray();seller.logoDataUri='data:'+logo.mime_type+';base64;'+Buffer.from(bytes).toString('base64');}
 }
 const bytes=await renderInvoicePdf({number:data.inv.number,state:data.inv.state,issueDate:String(data.inv.issue_date),dueDate:String(data.inv.due_date),currency:data.inv.currency,currencyScale:Number(data.inv.currency_scale),sellerSnapshot:data.inv.seller_snapshot,recipientSnapshot:data.inv.recipient_snapshot,notes:data.inv.notes,paymentInstructions:data.inv.payment_instructions,subtotal:String(data.inv.subtotal),discountTotal:String(data.inv.discount_total),taxTotal:String(data.inv.tax_total),total:String(data.inv.total),locale:data.inv.locale},data.lines);
 if(data.inv.state==='draft')return {id:null,bytes};
 const docId=randomUUID(),key='business/'+ws+'/invoices/'+id+'/'+data.inv.version+'/'+docId+'.pdf';await putAttachment(key,bytes,'application/pdf');
 try{return await client.begin(async tx=>{
  const owner=(await q(tx,'select owner_user_id from workspaces where id=$1',[ws]))[0];await q(tx,"select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[owner.owner_user_id,ws]);
  const [row]=await q(tx,"insert into business_documents(id,workspace_id,invoice_id,kind,source_version,template_version,object_key,mime_type,byte_size,checksum,state) values($1,$2,$3,'invoice_pdf',$4,1,$5,'application/pdf',$6,$7,'ready') on conflict(workspace_id,invoice_id,source_version,template_version) where kind='invoice_pdf' do nothing returning id,object_key",[docId,ws,id,data.inv.version,key,bytes.byteLength,createHash('sha256').update(bytes).digest('hex')]);
  if(row)return row;await deleteAttachment(key);const [old]=await q(tx,"select id,object_key from business_documents where workspace_id=$1 and invoice_id=$2 and kind='invoice_pdf' and source_version=$3 and state='ready' limit 1",[ws,id,data.inv.version]);if(!old)throw new Error('PDF document could not be stored.');return old;
 });}catch(e){await deleteAttachment(key).catch(()=>{});throw e;}
}

export const businessRoutes=new Elysia({name:'business-finance'})
 .get('/api/workspaces/:workspaceId/business-profile',({request,params})=>scope(request,params.workspaceId,async(tx,_actor,w)=>{
  return {legalName:w.legal_name,tradingName:w.trading_name??'',address:w.address??{},contactEmail:w.contact_email??'',phone:w.phone??'',taxId:w.tax_id??'',logoDocumentId:w.logo_document_id,fiscalYearStartMonth:w.fiscal_year_start_month??1,fiscalYearStartDay:w.fiscal_year_start_day??1,version:w.version??1};
 }))
 .patch('/api/workspaces/:workspaceId/business-profile',async({request,params})=>scope(request,params.workspaceId,async(tx,actor,w)=>{
  const b=await request.json() as Record<string,any>,version=Number(b.version??w.version??1);
  if(version!==Number(w.version??1))return fail(409,'VERSION_CONFLICT','This profile changed. Reload and retry.');
  const legal=b.legalName??w.legal_name,trading=b.tradingName??w.trading_name??null,mail=b.contactEmail??w.contact_email??null,phone=b.phone??w.phone??null,tax=b.taxId??w.tax_id??null,addr=b.address===undefined?w.address??{}:cleanAddress(b.address),month=Number(b.fiscalYearStartMonth??w.fiscal_year_start_month??1),day=Number(b.fiscalYearStartDay??w.fiscal_year_start_day??1);
  if(!bounded(legal,200,true)||!bounded(trading,200)||!bounded(phone,80)||!bounded(tax,100)||!(mail===null||validEmail(mail))||!Number.isInteger(month)||month<1||month>12||!Number.isInteger(day)||day<1||day>28)return fail(422,'INVALID_PROFILE','Check the business name, contact details, and fiscal year.');
  const [saved]=await q(tx,'update business_profiles set legal_name=$2,trading_name=$3,address=$4::jsonb,contact_email=$5,phone=$6,tax_id=$7,fiscal_year_start_month=$8,fiscal_year_start_day=$9,version=version+1,updated_at=now() where workspace_id=$1 returning legal_name as "legalName",trading_name as "tradingName",address,contact_email as "contactEmail",phone,tax_id as "taxId",logo_document_id as "logoDocumentId",fiscal_year_start_month as "fiscalYearStartMonth",fiscal_year_start_day as "fiscalYearStartDay",version',[params.workspaceId,legal, trading,protectedJson(addr,params.workspaceId,params.workspaceId,'address'),protectedText(mail,params.workspaceId,params.workspaceId,'contact_email'),protectedText(phone,params.workspaceId,params.workspaceId,'phone'),protectedText(tax,params.workspaceId,params.workspaceId,'tax_id'),month,day]);
  await q(tx,"insert into audit_logs(workspace_id,actor_user_id,entity_type,entity_id,action,after) values($1,$2,'business_profile',$1,'update',$3::jsonb)",[params.workspaceId,actor.id,protectedJson(saved,params.workspaceId,params.workspaceId,'after')]);return saved;
 }))
 .post('/api/workspaces/:workspaceId/business-profile/logo',async({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
  let form:FormData;try{form=await request.formData();}catch{return fail(422,'INVALID_FILE','Upload a PNG, JPEG, or WebP image.');}
  const file=form.get('file');if(!(file instanceof File)||file.size<1||file.size>2*1024*1024)return fail(422,'INVALID_FILE','Logo must be an image up to 2 MiB.');
  const bytes=new Uint8Array(await file.arrayBuffer()),head=Array.from(bytes.slice(0,12)),mime=head[0]===137&&head[1]===80&&head[2]===78?'image/png':head[0]===255&&head[1]===216?'image/jpeg':head[0]===82&&head[1]===73&&head[2]===70&&head[8]===87?'image/webp':null;if(!mime)return fail(422,'INVALID_FILE','The file contents are not a supported image.');
  const id=randomUUID(),key='business/'+params.workspaceId+'/logos/'+id;await putAttachment(key,bytes,mime);
  try{await q(tx,"insert into business_documents(id,workspace_id,kind,object_key,mime_type,byte_size,state) values($1,$2,'logo',$3,$4,$5,'ready')",[id,params.workspaceId,key,mime,bytes.byteLength]);await q(tx,'update business_profiles set logo_document_id=$2,version=version+1,updated_at=now() where workspace_id=$1',[params.workspaceId,id]);await q(tx,"insert into audit_logs(workspace_id,actor_user_id,entity_type,entity_id,action,after) values($1,$2,'business_profile',$1,'logo_updated',$3::jsonb)",[params.workspaceId,actor.id,protectedJson({logoDocumentId:id},params.workspaceId,params.workspaceId,'after')]);return Response.json({documentId:id},{status:201});}catch(e){await deleteAttachment(key).catch(()=>{});throw e;}
 }))
 .get('/api/workspaces/:workspaceId/business-documents/:documentId/download',({request,params})=>scope(request,params.workspaceId,async(tx)=>{
  if(!uuid.test(params.documentId))return fail(400,'INVALID_ID','Document ID is invalid.');const [doc]=await q(tx,"select object_key,mime_type from business_documents where workspace_id=$1 and id=$2 and state='ready'",[params.workspaceId,params.documentId]);if(!doc)return fail(404,'NOT_FOUND','Document not found.');
  const obj=await getAttachment(doc.object_key),bytes=await obj.Body!.transformToByteArray();return new Response(Buffer.from(bytes),{headers:{'Content-Type':doc.mime_type,'Content-Disposition':doc.mime_type==='application/pdf'?'attachment; filename="invoice.pdf"':'inline','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }))
 .get('/api/workspaces/:workspaceId/invoices',({request,params,query})=>scope(request,params.workspaceId,async(tx,_actor,w)=>{
  const page=Math.max(1,Number(query.page??1)||1),limit=Math.min(100,Math.max(1,Number(query.limit??25)||25)),search=(query.q??'').trim().slice(0,100),status=query.status??'all';
  if(!['all','draft','issued','sent','partially_paid','paid','overdue','void'].includes(status))return fail(422,'INVALID_STATUS','Choose a valid invoice status.');
  const today=workspaceToday(w.timezone);
  const rows=await q(tx,`with balances as (
   select i.id,i.number,i.state,i.issue_date as "issueDate",i.due_date as "dueDate",i.currency,i.currency_scale as "currencyScale",i.total::text,
   i.first_sent_at as "firstSentAt",i.recipient_snapshot as "recipientSnapshot",i.version,i.created_at,
   coalesce(sum(p.amount) filter(where p.reversed_at is null),0)::text as "paidAmount"
   from invoices i left join invoice_payments p on p.workspace_id=i.workspace_id and p.invoice_id=i.id
   where i.workspace_id=$1 and i.archived_at is null and ($2='' or i.number ilike '%'||$2||'%' or i.recipient_snapshot->>'name' ilike '%'||$2||'%')
   group by i.id
  ), derived as (
   select *,case when state='draft' then 'draft' when state='void' then 'void'
    when total::numeric <= "paidAmount"::numeric then 'paid' when "paidAmount"::numeric>0 then 'partially_paid'
    when "dueDate"<$3::date then 'overdue' when "firstSentAt" is not null then 'sent' else 'issued' end as status from balances
  ) select id,number,state,"issueDate","dueDate",currency,"currencyScale",total,"firstSentAt","recipientSnapshot",version,"paidAmount",status
  from derived where $4='all' or status=$4 order by created_at desc limit $5 offset $6`,[params.workspaceId,search,today,status,limit,(page-1)*limit]);
  return {items:rows.map((r:any)=>({...r,outstanding:compareMoney(r.total,r.paidAmount,Number(r.currencyScale))<=0?'0':addMoney(r.total,'-'+r.paidAmount,Number(r.currencyScale))})),page,limit};
 }))
 .post('/api/workspaces/:workspaceId/invoices',async({request,params})=>scope(request,params.workspaceId,async(tx,actor,w)=>{
  const b=await request.json() as Record<string,any>,to=recipient(b.recipient??{}),today=workspaceToday(w.timezone),issueDate=b.issueDate??today,dueDate=b.dueDate??issueDate;
  if(!validDate(issueDate)||!validDate(dueDate)||dueDate<issueDate)return fail(422,'INVALID_DATES','Enter a valid issue and due date.');
  const notes=b.notes??null,payment=b.paymentInstructions??null;if(!(notes===null||bounded(notes,4000))||!(payment===null||bounded(payment,2000)))return fail(422,'INVALID_INPUT','Invoice notes or payment instructions are too long.');
  const draftId=randomUUID();
  const [inv]=await q(tx,'insert into invoices(id,workspace_id,issue_date,due_date,currency,currency_scale,recipient_snapshot,locale,notes,payment_instructions,created_by,updated_by) values($11,$1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$10) returning id',[params.workspaceId,issueDate,dueDate,w.currency,currencyScale(w.currency),protectedContact(to,params.workspaceId,draftId,'recipient_snapshot'),b.locale==='id'?'id':'en',notes,protectedText(payment,params.workspaceId,draftId,'payment_instructions'),actor.id,draftId]);
  if(Array.isArray(b.lines)&&b.lines.length)await saveLines(tx,params.workspaceId,inv.id,b.lines,w.currency);await audit(tx,params.workspaceId,actor.id,inv.id,'draft_created',null,{});return Response.json({invoice:await detail(tx,params.workspaceId,inv.id)},{status:201});
 }))
 .get('/api/workspaces/:workspaceId/invoices/:invoiceId',({request,params})=>scope(request,params.workspaceId,async(tx)=>({invoice:await detail(tx,params.workspaceId,params.invoiceId)})))
 .patch('/api/workspaces/:workspaceId/invoices/:invoiceId/collection-forecast',async({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
  const body=await request.json() as {version?:number;expectedPaymentOn?:unknown;expectedAccountId?:unknown};
  if(!Number.isInteger(body.version)||(body.expectedPaymentOn!==undefined&&body.expectedPaymentOn!==null&&!validDate(body.expectedPaymentOn))||(body.expectedAccountId!==undefined&&body.expectedAccountId!==null&&!uuid.test(String(body.expectedAccountId))))return fail(422,'INVALID_FORECAST_SETTINGS','Provide the current invoice version and valid expected collection settings.');
  const [invoice]=await q(tx,'select id,state,version,currency,due_date as "dueDate" from invoices where workspace_id=$1 and id=$2 and archived_at is null for update',[params.workspaceId,params.invoiceId]);if(!invoice)return fail(404,'NOT_FOUND','Invoice not found.');if(invoice.state!=='issued')return fail(409,'INVALID_STATE','Collection assumptions can only be changed on issued invoices.');if(Number(invoice.version)!==body.version)return fail(409,'VERSION_CONFLICT','This invoice changed. Reload and retry.');
  if(body.expectedAccountId){const [account]=await q(tx,"select id from accounts where workspace_id=$1 and id=$2 and currency=$3 and kind in ('cash','bank','e_wallet','savings') and archived_at is null and deleted_at is null",[params.workspaceId,body.expectedAccountId,invoice.currency]);if(!account)return fail(422,'INVALID_ACCOUNT','Choose an active cash account in the invoice currency.');}
  const [updated]=await q(tx,'update invoices set expected_payment_on=case when $3::boolean then $4::date else expected_payment_on end,expected_account_id=case when $5::boolean then $6::uuid else expected_account_id end,version=version+1,updated_by=$7,updated_at=now() where workspace_id=$1 and id=$2 returning id,version,expected_payment_on as "expectedPaymentOn",expected_account_id as "expectedAccountId"',[params.workspaceId,params.invoiceId,body.expectedPaymentOn!==undefined,body.expectedPaymentOn??null,body.expectedAccountId!==undefined,body.expectedAccountId??null,actor.id]);
  await audit(tx,params.workspaceId,actor.id,params.invoiceId,'collection_forecast_updated',null,updated);return updated;
 }))
 .patch('/api/workspaces/:workspaceId/invoices/:invoiceId',async({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
  const b=await request.json() as Record<string,any>,[inv]=await q(tx,'select * from invoices where workspace_id=$1 and id=$2 and archived_at is null for update',[params.workspaceId,params.invoiceId]);if(!inv)return fail(404,'NOT_FOUND','Invoice not found.');if(inv.state!=='draft')return fail(409,'INVALID_STATE','Only drafts can be edited.');if(b.version!==undefined&&Number(b.version)!==Number(inv.version))return fail(409,'VERSION_CONFLICT','This invoice changed. Reload and retry.');
  const to=b.recipient===undefined?inv.recipient_snapshot:recipient(b.recipient),issueDate=b.issueDate??inv.issue_date,dueDate=b.dueDate??inv.due_date,notes=b.notes===undefined?inv.notes:b.notes,payment=b.paymentInstructions===undefined?inv.payment_instructions:b.paymentInstructions;if(!validDate(issueDate)||!validDate(dueDate)||dueDate<issueDate)return fail(422,'INVALID_DATES','Enter valid issue and due dates.');if(!(notes===null||bounded(notes,4000))||!(payment===null||bounded(payment,2000)))return fail(422,'INVALID_INPUT','Invoice notes or payment instructions are too long.');
  await q(tx,'update invoices set recipient_snapshot=$3::jsonb,issue_date=$4,due_date=$5,notes=$6,payment_instructions=$7,locale=$8,version=version+1,updated_by=$9,updated_at=now() where workspace_id=$1 and id=$2',[params.workspaceId,inv.id,protectedContact(to,params.workspaceId,inv.id,'recipient_snapshot'),issueDate,dueDate,notes,protectedText(payment,params.workspaceId,inv.id,'payment_instructions'),b.locale==='en'||b.locale==='id'?b.locale:inv.locale,actor.id]);
  if(b.lines!==undefined){if(!Array.isArray(b.lines))return fail(422,'INVALID_LINES','Invoice lines must be a list.');if(b.lines.length)await saveLines(tx,params.workspaceId,inv.id,b.lines,inv.currency);else{await q(tx,'delete from invoice_lines where workspace_id=$1 and invoice_id=$2',[params.workspaceId,inv.id]);await q(tx,'update invoices set subtotal=0,discount_total=0,tax_total=0,total=0 where workspace_id=$1 and id=$2',[params.workspaceId,inv.id]);}}
  await audit(tx,params.workspaceId,actor.id,inv.id,'draft_updated',null,{version:Number(inv.version)+1});return {invoice:await detail(tx,params.workspaceId,inv.id)};
 }))
 .delete('/api/workspaces/:workspaceId/invoices/:invoiceId',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
  const [row]=await q(tx,"update invoices set archived_at=now(),version=version+1,updated_at=now(),updated_by=$3 where workspace_id=$1 and id=$2 and state='draft' and archived_at is null returning id",[params.workspaceId,params.invoiceId,actor.id]);if(!row)return fail(409,'INVALID_STATE','Only a draft can be archived.');await audit(tx,params.workspaceId,actor.id,row.id,'draft_archived',null,null);return new Response(null,{status:204});
 }))
 .post('/api/workspaces/:workspaceId/invoices/:invoiceId/issue',async({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
  const b=await request.json().catch(()=>({})) as {version?:number},inv=await issue(tx,params.workspaceId,actor.id,params.invoiceId,b.version);return {invoice:await detail(tx,params.workspaceId,inv.id)};
 }))
 .post('/api/workspaces/:workspaceId/invoices/:invoiceId/void',async({request,params})=>scope(request,params.workspaceId,async(tx,actor,w)=>{
  const b=await request.json() as {reason?:unknown,effectiveOn?:unknown,version?:number},reason=typeof b.reason==='string'?b.reason.trim():'';if(!reason||reason.length>1000)return fail(422,'INVALID_REASON','Add a reason of up to 1000 characters.');
  const [inv]=await q(tx,'select * from invoices where workspace_id=$1 and id=$2 and archived_at is null for update',[params.workspaceId,params.invoiceId]);if(!inv)return fail(404,'NOT_FOUND','Invoice not found.');if(inv.state!=='issued')return fail(409,'INVALID_STATE','Only issued invoices can be voided.');if(b.version!==undefined&&Number(inv.version)!==b.version)return fail(409,'VERSION_CONFLICT','This invoice changed. Reload and retry.');if(compareMoney(await paidFor(tx,params.workspaceId,inv.id),'0',Number(inv.currency_scale))>0)return fail(409,'PAYMENT_EXISTS','Reverse its payments before voiding.');
  const on=b.effectiveOn??workspaceToday(w.timezone);if(!validDate(on))return fail(422,'INVALID_DATE','Enter a valid void date.');
  await q(tx,"update invoices set state='void',voided_at=now(),void_effective_on=$3,void_reason=$4,version=version+1,updated_by=$5,updated_at=now() where workspace_id=$1 and id=$2",[params.workspaceId,inv.id,on,reason,actor.id]);await q(tx,"update invoice_deliveries set state='cancelled',updated_at=now() where workspace_id=$1 and invoice_id=$2 and state in ('pending','queued','failed')",[params.workspaceId,inv.id]);await audit(tx,params.workspaceId,actor.id,inv.id,'void',null,{reason,effectiveOn:on});return {invoice:await detail(tx,params.workspaceId,inv.id)};
 }))
 .post('/api/workspaces/:workspaceId/invoices/:invoiceId/pdf',async({request,params})=>{
  const allowed=await scope(request,params.workspaceId,async()=>true);if(allowed instanceof Response)return allowed;
  const result=await ensurePdf(params.workspaceId,params.invoiceId);
  if('bytes'in result)return new Response(Buffer.from(result.bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="invoice-draft-preview.pdf"','Cache-Control':'private, no-store'}});
  const obj=await getAttachment(result.object_key);return new Response(Buffer.from(await obj.Body!.transformToByteArray()),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="invoice.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 })
 .post('/api/workspaces/:workspaceId/invoices/:invoiceId/send',async({request,params})=>{
  const body=await request.json().catch(()=>({})) as {recipient?:unknown,version?:number,idempotencyKey?:string};
  const issued=await scope(request,params.workspaceId,async(tx,actor)=>{let inv=await detail(tx,params.workspaceId,params.invoiceId);if(inv.state==='draft')inv=await detail(tx,params.workspaceId,(await issue(tx,params.workspaceId,actor.id,params.invoiceId,body.version)).id);return inv;});
  if(issued instanceof Response)return issued;if(issued.state==='void')return fail(409,'INVALID_STATE','A void invoice cannot be sent.');
  const to=body.recipient??issued.recipientSnapshot.email;if(!validEmail(to))return fail(422,'INVALID_RECIPIENT','Enter a valid email address.');
  const pdf=await ensurePdf(params.workspaceId,issued.id);if(!('id'in pdf)||!pdf.id)return fail(500,'PDF_FAILED','The invoice PDF could not be saved.');
  const key=body.idempotencyKey??request.headers.get('idempotency-key')??randomUUID();if(typeof key!=='string'||key.length>200)return fail(422,'INVALID_KEY','The send key is invalid.');
  const queued=await scope(request,params.workspaceId,async(tx,actor)=>{
   const [found]=await q(tx,'select id,state,recipient_snapshot from invoice_deliveries where workspace_id=$1 and idempotency_key=$2',[params.workspaceId,key]);
   if(found){if(found.recipient_snapshot!==to)return fail(409,'IDEMPOTENCY_CONFLICT','This key was already used with another recipient.');return Response.json({delivery:found},{status:202});}
   const [still]=await q(tx,'select state from invoices where workspace_id=$1 and id=$2',[params.workspaceId,issued.id]);if(!still||still.state==='void')return fail(409,'INVALID_STATE','This invoice can no longer be sent.');
   const deliveryId=randomUUID();
   const [delivery]=await q(tx,"insert into invoice_deliveries(id,workspace_id,invoice_id,document_id,requested_by,recipient_snapshot,locale,idempotency_key) values($8,$1,$2,$3,$4,$5,$6,$7) returning id,state",[params.workspaceId,issued.id,pdf.id,actor.id,protectedText(to,params.workspaceId,deliveryId,'recipient_snapshot'),issued.locale,key,deliveryId]);
   await audit(tx,params.workspaceId,actor.id,issued.id,'send_requested',null,{deliveryId:delivery.id});return Response.json({delivery},{status:202});
  });
  if(!(queued instanceof Response)||queued.status===202)queueMicrotask(()=>void dispatchInvoiceDeliveries());return queued;
 })
 .get('/api/workspaces/:workspaceId/invoices/:invoiceId/deliveries',({request,params})=>scope(request,params.workspaceId,async(tx)=>({items:await q(tx,'select id,state,attempts,error_code as "errorCode",accepted_at as "acceptedAt",created_at as "createdAt" from invoice_deliveries where workspace_id=$1 and invoice_id=$2 order by created_at desc',[params.workspaceId,params.invoiceId])})))
 .post('/api/workspaces/:workspaceId/invoices/:invoiceId/payments',async({request,params})=>scope(request,params.workspaceId,async(tx,actor,w)=>{
  const b=await request.json() as Record<string,unknown>,[inv]=await q(tx,'select * from invoices where workspace_id=$1 and id=$2 and archived_at is null for update',[params.workspaceId,params.invoiceId]);if(!inv)return fail(404,'NOT_FOUND','Invoice not found.');if(inv.state!=='issued')return fail(409,'INVALID_STATE','Payments require an issued invoice.');
  const scale=Number(inv.currency_scale),amount=b.amount,paidOn=b.paidOn;if(!validPositiveAmount(amount,scale)||!validDate(paidOn))return fail(422,'INVALID_PAYMENT','Enter a positive amount and valid received date.');if(paidOn>workspaceToday(w.timezone))return fail(422,'FUTURE_PAYMENT','Payment date cannot be in the future.');
  if(!uuid.test(String(b.accountId))||!uuid.test(String(b.categoryId))||typeof b.idempotencyKey!=='string'||b.idempotencyKey.length<8||b.idempotencyKey.length>200)return fail(422,'INVALID_PAYMENT','Choose a receiving account and income category; provide an idempotency key.');
  const hash=createHash('sha256').update(JSON.stringify({invoiceId:inv.id,amount,paidOn,accountId:b.accountId,categoryId:b.categoryId,reference:b.reference??null})).digest('hex');
  const [existing]=await q(tx,"select request_hash,resource_id from idempotency_keys where workspace_id=$1 and actor_key=$2 and operation='invoice_payment' and key=$3",[params.workspaceId,actor.id,b.idempotencyKey]);
  if(existing){if(existing.request_hash!==hash)return fail(409,'IDEMPOTENCY_CONFLICT','This key was already used with a different payment.');if(existing.resource_id){const [payment]=await q(tx,'select id,amount::text,currency,paid_on as "paidOn",transaction_id as "transactionId" from invoice_payments where workspace_id=$1 and id=$2',[params.workspaceId,existing.resource_id]);return {payment,replayed:true};}return fail(409,'REQUEST_PENDING','This request is already running.');}
  const paid=await paidFor(tx,params.workspaceId,inv.id),remaining=compareMoney(String(inv.total),paid,scale)<=0?'0':addMoney(String(inv.total),'-'+paid,scale);if(compareMoney(amount,remaining,scale)>0)return fail(422,'OVERPAYMENT','Payment cannot exceed the outstanding amount.');
  const [account]=await q(tx,'select id,ledger_account_id,currency from accounts where workspace_id=$1 and id=$2 and archived_at is null and deleted_at is null',[params.workspaceId,b.accountId]),[category]=await q(tx,"select id,ledger_account_id,type from categories where workspace_id=$1 and id=$2 and archived_at is null",[params.workspaceId,b.categoryId]);if(!account||account.currency!==inv.currency||!category||category.type!=='income')return fail(422,'INVALID_REFERENCE','Choose an active same-currency account and income category from this business.');
  const [key]=await q(tx,"insert into idempotency_keys(workspace_id,actor_key,operation,key,request_hash,expires_at) values($1,$2,'invoice_payment',$3,$4,now()+interval '24 hours') on conflict(workspace_id,actor_key,operation,key) do nothing returning id",[params.workspaceId,actor.id,b.idempotencyKey,hash]);
  if(!key){const [old]=await q(tx,"select request_hash,resource_id from idempotency_keys where workspace_id=$1 and actor_key=$2 and operation='invoice_payment' and key=$3",[params.workspaceId,actor.id,b.idempotencyKey]);if(old.request_hash!==hash)return fail(409,'IDEMPOTENCY_CONFLICT','This key was already used with a different payment.');if(old.resource_id){const [payment]=await q(tx,'select id,amount::text,currency,paid_on as "paidOn",transaction_id as "transactionId" from invoice_payments where workspace_id=$1 and id=$2',[params.workspaceId,old.resource_id]);return {payment,replayed:true};}return fail(409,'REQUEST_PENDING','This request is already running.');}
  const txid=randomUUID(),journal=randomUUID(),reference=typeof b.reference==='string'?b.reference.slice(0,300):null;
  await q(tx,"insert into transactions(id,workspace_id,account_id,category_id,amount,currency,type,occurred_at,notes,merchant,created_by,updated_by) values($1,$2,$3,$4,$5,$6,'income',$7,$8,$9,$10,$10)",[txid,params.workspaceId,account.id,category.id,amount,inv.currency,paidOn,reference,'Invoice '+inv.number,actor.id]);
  await q(tx,"insert into journal_entries(id,workspace_id,transaction_id,effective_date,reason,created_by) values($1,$2,$3,$4,'invoice_payment',$5)",[journal,params.workspaceId,txid,paidOn,actor.id]);
  await q(tx,'insert into journal_lines(workspace_id,entry_id,ledger_account_id,debit,credit,currency) values($1,$2,$3,$4,0,$6),($1,$2,$5,0,$4,$6)',[params.workspaceId,journal,account.ledger_account_id,amount,category.ledger_account_id,inv.currency]);
  const paymentId=randomUUID();
  const [payment]=await q(tx,'insert into invoice_payments(id,workspace_id,invoice_id,transaction_id,account_id,category_id,amount,currency,paid_on,reference,created_by) values($11,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id,amount::text,currency,paid_on as "paidOn",transaction_id as "transactionId"',[params.workspaceId,inv.id,txid,account.id,category.id,amount,inv.currency,paidOn,protectedText(reference,params.workspaceId,paymentId,'reference'),actor.id,paymentId]);
  await q(tx,"update idempotency_keys set resource_id=$4,response_body=$5::jsonb where workspace_id=$1 and actor_key=$2 and operation='invoice_payment' and key=$3",[params.workspaceId,actor.id,b.idempotencyKey,payment.id,JSON.stringify(payment)]);await audit(tx,params.workspaceId,actor.id,inv.id,'payment_recorded',null,{paymentId:payment.id,amount,currency:inv.currency});return {payment};
 }))
 .get('/api/workspaces/:workspaceId/invoices/:invoiceId/payments',({request,params})=>scope(request,params.workspaceId,async(tx)=>({items:await q(tx,'select id,amount::text,currency,paid_on as "paidOn",reference,reversed_at as "reversedAt",reversal_reason as "reversalReason" from invoice_payments where workspace_id=$1 and invoice_id=$2 order by paid_on desc',[params.workspaceId,params.invoiceId])})))
 .post('/api/workspaces/:workspaceId/invoices/:invoiceId/payments/:paymentId/reverse',async({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
  const b=await request.json() as {reason?:unknown,effectiveOn?:unknown};if(!bounded(b.reason,1000,true)||!validDate(b.effectiveOn))return fail(422,'INVALID_REVERSAL','Enter a correction reason and valid effective date.');
  const [p]=await q(tx,'select p.* from invoice_payments p join invoices i on i.workspace_id=p.workspace_id and i.id=p.invoice_id where p.workspace_id=$1 and p.invoice_id=$2 and p.id=$3 for update of p,i',[params.workspaceId,params.invoiceId,params.paymentId]);if(!p)return fail(404,'NOT_FOUND','Payment not found.');if(p.reversed_at)return fail(409,'ALREADY_REVERSED','Payment was already reversed.');
  const [entry]=await q(tx,'select j.id from journal_entries j where j.workspace_id=$1 and j.transaction_id=$2 and not exists(select 1 from journal_entries r where r.workspace_id=j.workspace_id and r.reverses_entry_id=j.id) order by j.created_at desc limit 1 for update',[params.workspaceId,p.transaction_id]);if(!entry)return fail(409,'JOURNAL_NOT_FOUND','The payment journal entry was not found.');
  const lines=await q(tx,'select ledger_account_id,debit::text,credit::text,currency from journal_lines where workspace_id=$1 and entry_id=$2',[params.workspaceId,entry.id]),reverseId=randomUUID();
  await q(tx,"insert into journal_entries(id,workspace_id,transaction_id,effective_date,reason,reverses_entry_id,created_by) values($1,$2,$3,$4,'invoice_payment_reversal',$5,$6)",[reverseId,params.workspaceId,p.transaction_id,b.effectiveOn,entry.id,actor.id]);for(const line of lines)await q(tx,'insert into journal_lines(workspace_id,entry_id,ledger_account_id,debit,credit,currency) values($1,$2,$3,$4,$5,$6)',[params.workspaceId,reverseId,line.ledger_account_id,line.credit,line.debit,line.currency]);
  await q(tx,'update transactions set deleted_at=now(),deleted_by=$3,updated_by=$3,updated_at=now(),version=version+1 where workspace_id=$1 and id=$2',[params.workspaceId,p.transaction_id,actor.id]);await q(tx,'update invoice_payments set reversed_at=now(),reversed_by=$4,reversal_reason=$5,reversal_effective_on=$6 where workspace_id=$1 and invoice_id=$2 and id=$3',[params.workspaceId,params.invoiceId,p.id,actor.id,b.reason,b.effectiveOn]);await audit(tx,params.workspaceId,actor.id,params.invoiceId,'payment_reversed',{paymentId:p.id,amount:p.amount},{reason:b.reason,effectiveOn:b.effectiveOn});return {reversed:true};
 }));
