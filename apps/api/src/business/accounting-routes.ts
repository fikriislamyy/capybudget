import { infrastructureReadiness } from '../operations/readiness';
import { putAttachment, getAttachment, deleteAttachment } from '../tracking/storage';
import {Elysia} from 'elysia';
import {randomUUID} from 'node:crypto';
import {scope} from './routes';
import {q,owner,reject,text,uuid,recordAudit,csvCell} from './shared';
import {protectedText} from '../security/business-fields';
import {workspaceToday} from '../tracking/recurrence';
import {previewAccounting,activateAccounting,drainAccounting,accountingStatement,accountingDate} from './accounting';
import {client} from '../db';

export const businessAccountingRoutes=new Elysia({name:'business-accounting'})
.post('/api/workspaces/:workspaceId/business-accounting/readiness',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 await owner(tx,params.workspaceId,actor.id);return infrastructureReadiness();
}))
.post('/api/workspaces/:workspaceId/business-accounting/storage-check',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 await owner(tx,params.workspaceId,actor.id);const b=await request.json() as any;if(b.confirm!==true)reject('Confirm the temporary encrypted storage round trip.');
 const key='business/'+params.workspaceId+'/service-checks/'+randomUUID()+'.pdf';
 const bytes=new TextEncoder().encode('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
 let uploaded=false;
 try{await putAttachment(key,bytes,'application/pdf');uploaded=true;const object=await getAttachment(key),restored=await object.Body!.transformToByteArray();if(Buffer.compare(Buffer.from(bytes),Buffer.from(restored))!==0)throw new Error('Storage contents differ');return {passed:true,message:'Temporary PDF bytes were encrypted, uploaded, retrieved and decrypted. Invoice rendering is a separate check.'};}
 finally{if(uploaded)await deleteAttachment(key);}
}))
.get('/api/workspaces/:workspaceId/business-accounting',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 const [settings]=await q(tx,'select * from business_accounting_settings where workspace_id=$1',[params.workspaceId]);
 const [pending]=await q(tx,'select count(*)::int as count from business_accounting_refresh where workspace_id=$1',[params.workspaceId]);
 const [member]=await q(tx,'select role from workspace_memberships where workspace_id=$1 and user_id=$2',[params.workspaceId,actor.id]);
 const reviews=['owner','accountant'].includes(member.role)?await q(tx,'select id,cutover_on as "cutoverOn",state,reviewed_at as "reviewedAt",applied_at as "appliedAt",review_reference,created_at as "createdAt" from business_accounting_reviews where workspace_id=$1 order by created_at desc limit 20',[params.workspaceId]):[];
 return {settings:settings??null,pending:pending.count,role:member.role,reviews};
}))
.post('/api/workspaces/:workspaceId/business-accounting/preview',({request,params})=>scope(request,params.workspaceId,async(tx,actor,w)=>{
 const b=await request.json() as any,cutover=accountingDate(b.cutoverOn);
 if(cutover>workspaceToday(w.timezone))reject('Choose a cutover date no later than today.');
 if((await q(tx,'select workspace_id from business_accounting_settings where workspace_id=$1',[params.workspaceId])).length)reject('Accrual accounting is already active.',409);
 const plan=await previewAccounting(tx,params.workspaceId,cutover),id=randomUUID();
 await q(tx,'insert into business_accounting_reviews(id,workspace_id,cutover_on,fingerprint,plan,created_by) values($1,$2,$3,$4,$5::jsonb,$6)',[id,params.workspaceId,cutover,plan.fingerprint,JSON.stringify(plan),actor.id]);
 await recordAudit(tx,params.workspaceId,actor.id,id,'accounting','preview_created',{cutoverOn:cutover,fingerprint:plan.fingerprint});return {id,plan};
}))
.get('/api/workspaces/:workspaceId/business-accounting/reviews/:id',({request,params})=>scope(request,params.workspaceId,async tx=>{
 const [review]=await q(tx,'select * from business_accounting_reviews where workspace_id=$1 and id=$2',[params.workspaceId,uuid(params.id)]);if(!review)reject('Review not found.',404);return {review};
}))
.post('/api/workspaces/:workspaceId/business-accounting/reviews/:id/review',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 const b=await request.json() as any,reference=text(b.reference,1000,true);
 if(b.confirm!==true||reference.length<8)reject('Record the actual reviewer and review reference, then confirm the posting and opening-balance policy.');
 const [review]=await q(tx,"update business_accounting_reviews set state='reviewed',reviewed_by=$3,reviewed_at=now(),review_reference=$4 where workspace_id=$1 and id=$2 and state='draft' returning id",[params.workspaceId,uuid(params.id),actor.id,protectedText(reference,params.workspaceId,params.id,'review_reference')]);
 if(!review)reject('This preview is unavailable or already reviewed.',409);
 await recordAudit(tx,params.workspaceId,actor.id,review.id,'accounting','review_recorded',{});return {reviewed:true};
}))
.post('/api/workspaces/:workspaceId/business-accounting/reviews/:id/activate',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 await owner(tx,params.workspaceId,actor.id);const b=await request.json() as any;
 if(b.confirm!==true||b.backupConfirmed!==true)reject('Confirm a restorable backup and the reviewed cutover before activation.');
 const [review]=await q(tx,"select * from business_accounting_reviews where workspace_id=$1 and id=$2 and state='reviewed' for update",[params.workspaceId,uuid(params.id)]);
 if(!review)reject('Record accounting review before activation.',409);return activateAccounting(tx,params.workspaceId,actor.id,review);
}))
.post('/api/workspaces/:workspaceId/business-accounting/sync',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>({pending:await drainAccounting(tx,params.workspaceId,actor.id,500)})))
.post('/api/workspaces/:workspaceId/business-accounting/close',({request,params})=>scope(request,params.workspaceId,async(tx,actor,w)=>{
 const b=await request.json() as any,on=accountingDate(b.through);if(b.confirm!==true||on>workspaceToday(w.timezone))reject('Confirm a period ending no later than today.');
 const [config]=await q(tx,'select * from business_accounting_settings where workspace_id=$1 for update',[params.workspaceId]);
 if(!config||on<config.cutover_on||on<=config.closed_through)reject('Choose an open period after cutover.',409);
 const pending=await drainAccounting(tx,params.workspaceId,actor.id,1000);if(pending)reject('Accounting is still synchronizing. Retry after the queue is clear.',409);
 const report=await accountingStatement(tx,params.workspaceId,config.cutover_on,on,'accrual');if(!report.balanced)reject('The trial balance must reconcile before closing.',409);
 await q(tx,'update business_accounting_settings set closed_through=$2 where workspace_id=$1',[params.workspaceId,on]);
 await recordAudit(tx,params.workspaceId,actor.id,params.workspaceId,'accounting','period_closed',{through:on});return {closedThrough:on};
}))
.get('/api/workspaces/:workspaceId/business-accounting/statement',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 const query=new URL(request.url).searchParams,from=accountingDate(query.get('from')),through=accountingDate(query.get('through')),basis=query.get('basis')??'cash';
 if(through<from||Date.parse(through)-Date.parse(from)>3660*86400000||!['cash','accrual'].includes(basis))reject('Choose cash or accrual and a date range of up to ten years.');
 const [pending]=await q(tx,'select count(*)::int as count from business_accounting_refresh where workspace_id=$1',[params.workspaceId]);
 if(basis==='accrual'&&pending.count)reject('Accrual postings are synchronizing. Use Sync postings or retry shortly.',409,'ACCOUNTING_PENDING');
 const report=await accountingStatement(tx,params.workspaceId,from,through,basis);
 if(query.get('format')==='csv'){
  const [member]=await q(tx,'select role from workspace_memberships where workspace_id=$1 and user_id=$2',[params.workspaceId,actor.id]);
  if(member.role!=='viewer')await recordAudit(tx,params.workspaceId,actor.id,params.workspaceId,'accounting','statement_exported',{from,through,basis});
  return new Response(['basis,from,through,base_currency,code,name,class,native_currency,native_balance,base_balance,period_base_balance',...report.rows.map(r=>[basis,from,through,report.currency,r.code,r.name,r.class,r.currency,r.native_balance,r.base_balance,r.period_balance].map(csvCell).join(','))].join('\r\n'),{headers:{'Content-Type':'text/csv','Content-Disposition':'attachment; filename="capybudget-'+basis+'-trial-balance.csv"'}});
 }
 return report;
},true));

let running=false;
export function startAccountingScheduler(){
 const tick=async()=>{if(running)return;running=true;try{
  const workspaces=await client.unsafe('select s.workspace_id,w.owner_user_id from business_accounting_settings s join workspaces w on w.id=s.workspace_id where w.archived_at is null');
  for(const w of workspaces)try{await client.begin(async tx=>{await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[w.owner_user_id,w.workspace_id]);await drainAccounting(tx,w.workspace_id,w.owner_user_id,250);});}catch(error){console.error('Accounting queue requires review',{workspaceId:w.workspace_id,code:(error as {code?:string}).code??'ACCOUNTING_SYNC_FAILED'});}
 }catch(error){const raw=(error as {code?:string}).code;const code=raw&&/^[A-Z0-9_]{1,60}$/.test(raw)?raw:'DATABASE_UNAVAILABLE';console.error(code==='42P01'?'Accounting scheduler requires database migrations. Run bun run db:migrate for this environment.':'Accounting scheduler database access failed; retrying shortly.',{code});}finally{running=false;}};
 void tick();const timer=setInterval(()=>void tick(),15000);timer.unref();
}
