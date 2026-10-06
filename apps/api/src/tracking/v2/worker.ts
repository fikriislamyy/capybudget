import {client} from '../../db';
import {getAttachment,deleteAttachment} from '../storage';
import {protectedJson} from '../../security/business-fields';
import {recognize} from './ocr';
import {refreshLatestRates} from './fx';
import {randomUUID} from 'node:crypto';
import {parseStatement,receiptFields} from './parsers';
export async function processReceipt(workspaceId:string,userId:string,id:string){
 const job=await client.begin(async(tx)=>{
  await tx`select set_config('app.user_id',${userId},true),set_config('app.workspace_id',${workspaceId},true)`;
  const [membership]=await tx`select 1 from workspace_memberships m join "user" u on u.id=m.user_id where m.workspace_id=${workspaceId} and m.user_id=${userId} and u.account_status='active'`;if(!membership)return;
  const [row]=await tx`update ocr_jobs set status='processing',error=null where workspace_id=${workspaceId} and id=${id} and status in ('queued','failed','processing') and expires_at>now() returning *`;return row;
 });if(!job)return;
 try{
  const object=await getAttachment(job.object_key),bytes=await object.Body!.transformToByteArray();
  const result=await recognize(bytes),extracted=receiptFields(result.text,result.confidence);
  await client.begin(async(tx)=>{await tx`select set_config('app.user_id',${userId},true),set_config('app.workspace_id',${workspaceId},true)`;await tx`update ocr_jobs set extracted=${protectedJson(extracted,workspaceId,id,'extracted')}::jsonb,status='review' where workspace_id=${workspaceId} and id=${id} and status='processing'`;});
 }catch(e){await client.begin(async(tx)=>{await tx`select set_config('app.user_id',${userId},true),set_config('app.workspace_id',${workspaceId},true)`;await tx`update ocr_jobs set status='failed',error='Receipt could not be read. Retry with a clearer photo, or enter the details manually.' where workspace_id=${workspaceId} and id=${id} and status='processing'`;});throw new Error('Receipt OCR failed.');}
}
export async function cleanCaptureFiles(workspaceId:string,userId:string){
 await client.begin(async(tx)=>{
  await tx`select set_config('app.user_id',${userId},true),set_config('app.workspace_id',${workspaceId},true)`;
  const rows=await tx`select object_key from import_jobs where workspace_id=${workspaceId} and expires_at<now() and object_key is not null union select object_key from ocr_jobs where workspace_id=${workspaceId} and expires_at<now() and transaction_id is null and status<>'expired'`;
  for(const row of rows)await deleteAttachment(row.object_key);
  await tx`update import_rows set raw=null where workspace_id=${workspaceId} and raw is not null and job_id in (select id from import_jobs where workspace_id=${workspaceId} and expires_at<now())`;
  await tx`update import_jobs set object_key=null,status='expired' where workspace_id=${workspaceId} and expires_at<now() and object_key is not null`;
  await tx`update ocr_jobs set extracted=null,status='expired' where workspace_id=${workspaceId} and expires_at<now() and transaction_id is null and status<>'expired'`;
 });
}

export async function processStatement(workspaceId:string,userId:string,id:string){
 const job=await client.begin(async(tx)=>{await tx`select set_config('app.user_id',${userId},true),set_config('app.workspace_id',${workspaceId},true)`;const [row]=await tx`update import_jobs set status='processing',error=null where workspace_id=${workspaceId} and id=${id} and status in ('queued','processing','failed') and expires_at>now() returning *`;return row;});
 if(!job)return;
 try{const object=await getAttachment(job.object_key),bytes=await object.Body!.transformToByteArray(),rows=await parseStatement(bytes,job.source_kind,job.mapping?.delimiter??',');if(!rows.length||rows.length>5000||Object.keys(rows[0]!).length>50)throw new Error('Use 1–5,000 rows and at most 50 columns.');
  await client.begin(async(tx)=>{await tx`select set_config('app.user_id',${userId},true),set_config('app.workspace_id',${workspaceId},true)`;const [current]=await tx`select id from import_jobs where workspace_id=${workspaceId} and id=${id} and status='processing' for update`;if(!current)return;
   for(let i=0;i<rows.length;i++){const rowId=randomUUID();await tx`insert into import_rows(id,workspace_id,job_id,row_number,raw) values(${rowId},${workspaceId},${id},${i+1},${protectedJson(rows[i],workspaceId,rowId,'raw')}::jsonb) on conflict(workspace_id,job_id,row_number) do nothing`;}
   await tx`update import_jobs set status='uploaded' where workspace_id=${workspaceId} and id=${id}`;
  });
 }catch(e){
  const active=await client.begin(async(tx)=>{
   await tx`select set_config('app.user_id',${userId},true),set_config('app.workspace_id',${workspaceId},true)`;
   const updated=await tx`update import_jobs set status='failed',error=${(e as Error).message.slice(0,300)} where workspace_id=${workspaceId} and id=${id} and status='processing' returning id`;
   return updated.length>0;
  });
  // A deleted import may lose its source file while parsing; do not retry cancellation.
  if(active)throw new Error('Statement parsing failed.');
 }
}

/** Discover committed jobs, including requests accepted while Redis was unavailable. */
export async function dispatchCaptureJobs(){
 const {scheduleTrackingTask}=await import('../queue');
 const workspaces=await client`select w.id,w.owner_user_id from workspaces w join "user" u on u.id=w.owner_user_id where w.archived_at is null and u.account_status='active'`;
 for(const ws of workspaces)await client.begin(async(tx)=>{
  await tx`select set_config('app.user_id',${ws.owner_user_id},true),set_config('app.workspace_id',${ws.id},true)`;
  const receipts=await tx`select id,actor_user_id from ocr_jobs where workspace_id=${ws.id} and status='queued' and expires_at>now() limit 20`;
  const statements=await tx`select id,actor_user_id from import_jobs where workspace_id=${ws.id} and status='queued' and expires_at>now() limit 20`;
  for(const row of receipts)await scheduleTrackingTask('receipt-ocr',{workspaceId:ws.id,ownerUserId:row.actor_user_id,id:row.id});
  for(const row of statements)await scheduleTrackingTask('statement-parse',{workspaceId:ws.id,ownerUserId:row.actor_user_id,id:row.id});
 });
}

let lastRateRefresh=0,lastCleanup=0;
export async function refreshCaptureMaintenance(){
 const now=Date.now(),rates=Boolean(process.env.CURRENCYFREAKS_API_KEY)&&now-lastRateRefresh>6*60*60*1000,cleanup=now-lastCleanup>60*60*1000;
 if(!rates&&!cleanup)return;lastRateRefresh=rates?now:lastRateRefresh;lastCleanup=cleanup?now:lastCleanup;
 const workspaces=await client`select w.id,w.owner_user_id,w.currency,w.timezone from workspaces w join "user" u on u.id=w.owner_user_id where w.archived_at is null and u.account_status='active'`;
 const pairs=new Map<string,{source:string;base:string}>();
 for(const ws of workspaces){
  if(cleanup)await cleanCaptureFiles(ws.id,ws.owner_user_id);
  if(rates)await client.begin(async tx=>{
   await tx`select set_config('app.user_id',${ws.owner_user_id},true),set_config('app.workspace_id',${ws.id},true)`;
   const currencies=await tx`select distinct currency from accounts where workspace_id=${ws.id} and currency<>${ws.currency} and archived_at is null and deleted_at is null`;
   for(const account of currencies)pairs.set(account.currency+':'+ws.currency,{source:account.currency,base:ws.currency});
  });
 }
 if(rates&&pairs.size)try{
  const result=await client.begin(tx=>refreshLatestRates(tx,[...pairs.values()]));
  if(result.date&&result.date<new Date().toISOString().slice(0,10))console.info('Exchange rates cached under the provider observation date; newer posting dates still require their own quote.',{rateDate:result.date,pairs:result.pairs});
 }catch(error){
  const raw=(error as {code?:string}).code;
  const code=raw&&/^[A-Z0-9_]{1,60}$/.test(raw)?raw:'FX_REFRESH_FAILED';
  console.error('Exchange-rate refresh failed; existing dated cached rates remain available.',{code});
 }
}
