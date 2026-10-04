import {protectedJson,revealRow} from '../../security/business-fields';
import { Elysia } from 'elysia';
import {createHash,randomUUID} from 'node:crypto';
import {withWorkspace,q,reject,readLimitedBody,makeTransaction,fail,isoDate,audit} from '../routes';
import {putAttachment,getAttachment,deleteAttachment} from '../storage';
import {bulkPreview,bulkApply} from './bulk';
import {normalizeRow,type Mapping} from './parsers';
import {rateFor} from './fx';
import {validateImageSize} from './ocr';
// Capture jobs are durable in PostgreSQL; the tracking worker dispatches committed rows.
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
export const trackingV2Routes=new Elysia({name:'tracking-v2'})
 .onBeforeHandle(({params})=>{if(Object.values(params).some(value=>typeof value==='string'&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)))return fail(400,'INVALID_ID','Record ID is invalid.');})
 .get('/api/workspaces/:workspaceId/exchange-rate',({request,params})=>withWorkspace(request,params.workspaceId,async(tx)=>{
  const u=new URL(request.url),source=u.searchParams.get('currency')??'',date=isoDate(u.searchParams.get('date'));
  if(!/^[A-Z]{3}$/.test(source))reject('Choose a currency.');const [ws]=await q(tx,'select currency from workspaces where id=$1',[params.workspaceId]);return rateFor(tx,source,ws.currency,date);
 }))
 .post('/api/workspaces/:workspaceId/bulk/preview',({request,params,body})=>withWorkspace(request,params.workspaceId,(tx,actor)=>bulkPreview(tx,params.workspaceId,actor,body)))
 .post('/api/workspaces/:workspaceId/bulk/:id/apply',({request,params})=>withWorkspace(request,params.workspaceId,(tx,actor)=>bulkApply(tx,params.workspaceId,actor,params.id)))
 .get('/api/workspaces/:workspaceId/imports',({request,params})=>withWorkspace(request,params.workspaceId,async(tx)=>({items:await q(tx,'select id,file_name as name,source_kind as kind,status,error,created_at as "createdAt" from import_jobs where workspace_id=$1 and expires_at>now() order by created_at desc limit 50',[params.workspaceId])})))
 .post('/api/workspaces/:workspaceId/imports',({request,params})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
  const u=new URL(request.url),accountId=u.searchParams.get('accountId'),kind=u.searchParams.get('kind');
  if(!['csv','xlsx','pdf','image'].includes(kind??''))reject('Use CSV, XLSX, PDF, or a statement image.');
  const [account]=await q(tx,'select id from accounts where workspace_id=$1 and id=$2 and archived_at is null and deleted_at is null',[params.workspaceId,accountId]);if(!account)reject('Choose an active account.');
  const bytes=await readLimitedBody(request,10*1024*1024);if(!bytes.length)reject('Choose a statement file.');
  if(kind==='xlsx'&&(bytes[0]!==0x50||bytes[1]!==0x4b)||kind==='pdf'&&Buffer.from(bytes.slice(0,4)).toString()!=='%PDF')reject('File contents do not match the selected format.');
  if(kind==='image'&&!((bytes[0]===0xff&&bytes[1]===0xd8)||(bytes[0]===0x89&&bytes[1]===0x50)))reject('Statement images must be JPEG or PNG.');
  if(kind==='image')validateImageSize(bytes);
  const id=randomUUID(),objectKey=`${params.workspaceId}/imports/${id}`,name=(u.searchParams.get('name')??'statement').slice(0,180);
  await putAttachment(objectKey,bytes,'application/octet-stream');
  try{
   await q(tx,"insert into import_jobs(id,workspace_id,actor_user_id,account_id,source_kind,object_key,checksum,file_name,status,mapping) values($1,$2,$3,$4,$5,$6,$7,$8,'queued',$9::jsonb)",[id,params.workspaceId,actor.id,accountId,kind,objectKey,hash(bytes),name,JSON.stringify({delimiter:u.searchParams.get('delimiter')===';'?';':','})]);
   return {id,status:'queued'};
  }catch(e){await deleteAttachment(objectKey).catch(()=>{});throw e;}
 }),{parse:'none'})
 .delete('/api/workspaces/:workspaceId/imports/:id',async({request,params})=>{
  let objectKey:string|undefined;
  const result=await withWorkspace(request,params.workspaceId,async(tx,actor)=>{
   // Serialize against mapping/confirmation and the worker's final row insertion.
   const [job]=await q(tx,'select id,status,object_key from import_jobs where workspace_id=$1 and id=$2 for update',[params.workspaceId,params.id]);
   if(!job)return {deleted:true};
   const [counts]=await q(tx,"select count(*)::int as total,count(*) filter(where transaction_id is not null)::int as recorded from import_rows where workspace_id=$1 and job_id=$2",[params.workspaceId,params.id]);
   if(job.object_key){objectKey=job.object_key;await q(tx,'insert into report_export_cleanup(object_key) values($1) on conflict do nothing',[objectKey]);}
   await q(tx,'delete from import_rows where workspace_id=$1 and job_id=$2',[params.workspaceId,params.id]);
   await q(tx,'delete from import_jobs where workspace_id=$1 and id=$2',[params.workspaceId,params.id]);
   await audit(tx,params.workspaceId,actor.id,'statement-import',params.id,'delete',{status:job.status,stagedRows:counts.total,recordedTransactions:counts.recorded},{deleted:true,postedTransactionsPreserved:true});
   return {deleted:true};
  });
  // Delete the private file only after commit; the durable cleanup queue retries failures.
  if(!(result instanceof Response)&&objectKey){const key=objectKey;queueMicrotask(()=>void deleteAttachment(key).catch(()=>{}));}
  return result;
 })
 .get('/api/workspaces/:workspaceId/imports/:id',({request,params})=>withWorkspace(request,params.workspaceId,async(tx)=>{
  const [job]=await q(tx,'select id,account_id as "accountId",file_name as name,status,mapping,error from import_jobs where workspace_id=$1 and id=$2 and expires_at>now()',[params.workspaceId,params.id]);if(!job)return fail(404,'IMPORT_NOT_FOUND','Import not found or expired.');
  const items=await q(tx,'select id,row_number as "rowNumber",raw,normalized,status,error,transaction_id as "transactionId" from import_rows where workspace_id=$1 and job_id=$2 order by row_number limit 5000',[params.workspaceId,params.id]);return {job,items:items.map((r:any)=>revealRow(r,params.workspaceId))};
 }))
 .get('/api/workspaces/:workspaceId/imports/:id/file',({request,params})=>withWorkspace(request,params.workspaceId,async(tx)=>{
  const [job]=await q(tx,'select object_key,source_kind from import_jobs where workspace_id=$1 and id=$2 and expires_at>now()',[params.workspaceId,params.id]);if(!job?.object_key)return fail(404,'IMPORT_NOT_FOUND','File not found.');const object=await getAttachment(job.object_key),bytes=await object.Body!.transformToByteArray();const type=job.source_kind==='pdf'?'application/pdf':job.source_kind==='image'?(bytes[0]===0x89?'image/png':'image/jpeg'):'application/octet-stream';return new Response(new Uint8Array(bytes),{headers:{'Content-Type':type,'Content-Disposition':job.source_kind==='pdf'||job.source_kind==='image'?'inline':'attachment','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }))
 .post('/api/workspaces/:workspaceId/imports/:id/retry',({request,params})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{const [job]=await q(tx,"update import_jobs set status='queued',error=null where workspace_id=$1 and id=$2 and expires_at>now() and status='failed' returning id",[params.workspaceId,params.id]);if(!job)reject('Only failed imports can be retried.');return {queued:true};}))
 .post('/api/workspaces/:workspaceId/imports/:id/map',({request,params,body})=>withWorkspace(request,params.workspaceId,async(tx)=>{
  const [job]=await q(tx,'select j.*,a.currency from import_jobs j join accounts a on a.workspace_id=j.workspace_id and a.id=j.account_id where j.workspace_id=$1 and j.id=$2 and j.expires_at>now() for update of j',[params.workspaceId,params.id]);if(!job)reject('Import not found or expired.');
  if(!['uploaded','review','complete'].includes(job.status))reject('Wait for document processing before mapping.');
  const mapping=body as Mapping;if(!mapping||typeof mapping.date!=='string'||!mapping.date||!['dd-mm-yyyy','mm-dd-yyyy','yyyy-mm-dd'].includes(mapping.dateFormat)||!['.',','].includes(mapping.decimal)||!['income','expense'].includes(mapping.defaultType))reject('Choose valid date, decimal, and transaction type options.');const rows=await q(tx,"select * from import_rows where workspace_id=$1 and job_id=$2 and status not in ('posted','skipped') order by row_number",[params.workspaceId,params.id]);
  for(const row of rows){
   try{const n=normalizeRow(revealRow(row,params.workspaceId).raw,mapping,job.currency);const duplicates=await q(tx,"select id from transactions t where workspace_id=$1 and occurred_at=$3 and deleted_at is null and ((account_id=$2 and amount=$4 and currency=$6) or (type='transfer' and destination_account_id=$2 and coalesce(destination_amount,amount)=$4 and exists(select 1 from accounts d where d.workspace_id=t.workspace_id and d.id=t.destination_account_id and d.currency=$6))) and $5::text is not null limit 10",[params.workspaceId,job.account_id,n.date,n.amount,n.type,n.currency]);
    await q(tx,"update import_rows set normalized=$1::jsonb,fingerprint=$2,status=$3,error=null where workspace_id=$4 and id=$5",[protectedJson({...n,duplicateIds:duplicates.map((x:any)=>x.id)},params.workspaceId,row.id,'normalized'),hash(JSON.stringify([job.account_id,n.date,n.amount,n.type,n.reference])),duplicates.length?'duplicate':'valid',params.workspaceId,row.id]);
   }catch(e){await q(tx,"update import_rows set normalized=null,status='invalid',error=$1 where workspace_id=$2 and id=$3",[(e as Error).message,params.workspaceId,row.id]);}
  }
  await q(tx,"update import_jobs set mapping=$1::jsonb,status='review' where workspace_id=$2 and id=$3",[JSON.stringify(mapping),params.workspaceId,params.id]);return {status:'review'};
 }))
 .post('/api/workspaces/:workspaceId/imports/:id/confirm',({request,params,body})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
  const b=body as any;if(!b||!Array.isArray(b.rows)||!b.rows.length||b.rows.length>100||new Set(b.rows.map((r:any)=>r.id)).size!==b.rows.length)reject('Confirm 1–100 unique rows per batch.');
  const [job]=await q(tx,'select j.*,a.currency from import_jobs j join accounts a on a.workspace_id=j.workspace_id and a.id=j.account_id where j.workspace_id=$1 and j.id=$2 and j.expires_at>now() for update of j',[params.workspaceId,params.id]);if(!job)reject('Import not found or expired.');
  let posted=0,skipped=0;
  for(const item of b.rows){
   const [row]=await q(tx,'select * from import_rows where workspace_id=$1 and job_id=$2 and id=$3 for update',[params.workspaceId,params.id,item.id]);if(!row)reject('A selected import row is unavailable.');if(['posted','skipped'].includes(row.status))continue;
   if(item.skip){await q(tx,"update import_rows set status='skipped' where workspace_id=$1 and id=$2",[params.workspaceId,row.id]);skipped++;continue;}
   if(row.status==='duplicate'&&!item.allowDuplicate&&!item.matchTransactionId)reject('Review the possible duplicate, then link it, skip it, or explicitly keep both.');
   const n={...revealRow(row,params.workspaceId).normalized,...item.values};
   if(!['income','expense','transfer'].includes(n.type))reject('Choose a transaction type.');
   if(item.matchTransactionId){const [match]=await q(tx,"select id,type from transactions t where workspace_id=$1 and id=$2 and occurred_at=$6 and deleted_at is null and ((account_id=$3 and amount=$4 and currency=$5) or (type='transfer' and destination_account_id=$3 and coalesce(destination_amount,amount)=$4 and exists(select 1 from accounts d where d.workspace_id=t.workspace_id and d.id=t.destination_account_id and d.currency=$5))) and (type=$7 or type='transfer')",[params.workspaceId,item.matchTransactionId,job.account_id,n.type==='transfer'&&n.destinationAccountId===job.account_id?n.destinationAmount??n.amount:n.amount,job.currency,n.date,n.type]);if(!match)reject('The selected existing transaction does not match this row.');await q(tx,"update import_rows set status='posted',transaction_id=$1,normalized=$4::jsonb where workspace_id=$2 and id=$3",[match.id,params.workspaceId,row.id,protectedJson({...n,type:match.type},params.workspaceId,row.id,'normalized')]);continue;}
   const statementAmount=n.type==='transfer'&&n.destinationAccountId===job.account_id?n.destinationAmount??n.amount:n.amount;
   const duplicates=await q(tx,"select id from transactions t where workspace_id=$1 and occurred_at=$3 and deleted_at is null and ((account_id=$2 and amount=$4 and currency=$5) or (type='transfer' and destination_account_id=$2 and coalesce(destination_amount,amount)=$4 and exists(select 1 from accounts d where d.workspace_id=t.workspace_id and d.id=t.destination_account_id and d.currency=$5))) limit 1",[params.workspaceId,job.account_id,n.date,statementAmount,job.currency]);if(duplicates.length&&!item.allowDuplicate)reject('Another matching transaction exists. Review it or explicitly keep both.');
   if(n.type==='transfer'&&n.accountId!==job.account_id&&n.destinationAccountId!==job.account_id)reject('The transfer must involve the statement account.');
   const result=await makeTransaction(tx,params.workspaceId,actor,{...n,accountId:n.type==='transfer'?n.accountId??job.account_id:job.account_id,categoryId:n.type==='transfer'?undefined:item.categoryId??n.categoryId,date:isoDate(n.date)});
   await q(tx,"update import_rows set status='posted',normalized=$1::jsonb,transaction_id=$2,error=null where workspace_id=$3 and id=$4",[protectedJson(n,params.workspaceId,row.id,'normalized'),result.id,params.workspaceId,row.id]);posted++;
  }
  const [pending]=await q(tx,"select count(*)::int as count from import_rows where workspace_id=$1 and job_id=$2 and status not in ('posted','skipped')",[params.workspaceId,params.id]);await q(tx,"update import_jobs set status=$1 where workspace_id=$2 and id=$3",[pending.count?'review':'complete',params.workspaceId,params.id]);
  const counts=await q(tx,'select status,count(*)::int as count from import_rows where workspace_id=$1 and job_id=$2 group by status',[params.workspaceId,params.id]);
  return {posted,skipped,counts};
 }))
 .get('/api/workspaces/:workspaceId/receipts',({request,params})=>withWorkspace(request,params.workspaceId,async(tx)=>({items:(await q(tx,'select id,file_name as name,status,extracted,error,transaction_id as "transactionId" from ocr_jobs where workspace_id=$1 and expires_at>now() order by created_at desc limit 50',[params.workspaceId])).map((r:any)=>revealRow(r,params.workspaceId))})))
 .post('/api/workspaces/:workspaceId/receipts',({request,params})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
  const bytes=await readLimitedBody(request,10*1024*1024),declared=(request.headers.get('content-type')??'').split(';')[0],id=randomUUID();let mime='';
  if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)mime='image/jpeg';else if(Buffer.from(bytes.slice(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';else if(Buffer.from(bytes.slice(0,4)).toString()==='RIFF'&&Buffer.from(bytes.slice(8,12)).toString()==='WEBP')mime='image/webp';
  if(!mime||mime!==declared)reject('Upload a valid JPEG, PNG, or WebP receipt.');
  validateImageSize(bytes);
  const key=`${params.workspaceId}/receipts/${id}`,name=(new URL(request.url).searchParams.get('name')??'receipt').slice(0,180);
  await putAttachment(key,bytes,mime);
  try{await q(tx,'insert into ocr_jobs(id,workspace_id,actor_user_id,object_key,mime_type,file_name,checksum,size_bytes) values($1,$2,$3,$4,$5,$6,$7,$8)',[id,params.workspaceId,actor.id,key,mime,name,hash(bytes),bytes.length]);return {id,status:'queued'};}catch(e){await deleteAttachment(key).catch(()=>{});throw e;}
 }),{parse:'none'})
 .get('/api/workspaces/:workspaceId/receipts/:id/image',({request,params})=>withWorkspace(request,params.workspaceId,async(tx)=>{
  const [job]=await q(tx,'select object_key,mime_type from ocr_jobs where workspace_id=$1 and id=$2 and expires_at>now()',[params.workspaceId,params.id]);if(!job)return fail(404,'RECEIPT_NOT_FOUND','Receipt not found.');const obj=await getAttachment(job.object_key),bytes=await obj.Body!.transformToByteArray();return new Response(new Uint8Array(bytes),{headers:{'Content-Type':job.mime_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }))
 .post('/api/workspaces/:workspaceId/receipts/:id/retry',({request,params})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
  const [job]=await q(tx,"update ocr_jobs set status='queued',error=null where workspace_id=$1 and id=$2 and expires_at>now() and status='failed' returning id",[params.workspaceId,params.id]);if(!job)reject('Only failed receipts can be retried.');return {status:'queued'};
 }))
 .post('/api/workspaces/:workspaceId/receipts/:id/confirm',({request,params,body})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
  const [job]=await q(tx,'select * from ocr_jobs where workspace_id=$1 and id=$2 and expires_at>now() for update',[params.workspaceId,params.id]);if(!job)reject('Receipt not found or expired.');if(job.transaction_id)return {transactionId:job.transaction_id};
  if(!['review','failed'].includes(job.status))reject('Wait for the receipt scan, or use manual entry after a failed scan.');
  const b=body as any;if(!b||typeof b!=="object")reject("Enter receipt details.");const input=b.values??b;
  const matches=await q(tx,'select id from transactions where workspace_id=$1 and account_id=$2 and occurred_at=$3 and amount=$4 and currency=$5 and type=$6 and deleted_at is null',[params.workspaceId,input.accountId,input.date,input.amount,input.currency,input.type]);
  let transactionId=b.matchTransactionId;
  if(transactionId){if(!matches.some((x:any)=>x.id===transactionId))reject('Selected transaction does not match this receipt.');}
  else{if(matches.length&&!b.allowDuplicate)reject('A similar transaction exists. Review it, then explicitly keep both if they are different purchases.');const result=await makeTransaction(tx,params.workspaceId,actor,input);transactionId=result.id;}
  const [count]=await q(tx,'select count(*)::int as count from attachments where workspace_id=$1 and transaction_id=$2 and deleted_at is null',[params.workspaceId,transactionId]);if(count.count>=5)reject('The selected transaction already has five attachments.');
  await q(tx,"insert into attachments(workspace_id,transaction_id,object_key,original_name,mime_type,size_bytes,checksum,status,uploaded_by) values($1,$2,$3,$4,$5,$6,$7,'ready',$8)",[params.workspaceId,transactionId,job.object_key,job.file_name,job.mime_type,job.size_bytes,job.checksum,actor.id]);
  await q(tx,"update ocr_jobs set transaction_id=$1,status='confirmed' where workspace_id=$2 and id=$3",[transactionId,params.workspaceId,params.id]);return {transactionId};
 }));
