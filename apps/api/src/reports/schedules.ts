import { Elysia } from 'elysia';
import { randomUUID } from 'node:crypto';
import { withReportScope, processQueuedReportRun, processQueuedReportExport } from './routes';
import { client } from '../db';
import { parseDefinition, reportPeriod, invalid, shiftDate, type Definition } from './definitions';
import { validateReportScope } from './v2-data';
import { workspaceToday } from '../tracking/recurrence';
import { enqueueEmail } from '../email/queue';
import { sendEmail } from '../email/mailer';
import { classifySmtpError } from '../email/smtp-outcome';
import { getAttachment } from '../tracking/storage';
import type { EmailMessage } from '../email/types';
import { UnrecoverableError } from 'bullmq';
const q=(tx:any,sql:string,values:unknown[]=[])=>tx.unsafe(sql,values);
const id=(value:string)=>{if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value))invalid('Choose a valid saved report.');return value;};
const decode=(value:any)=>typeof value==='string'?JSON.parse(value):value;
const name=(value:unknown)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>120)invalid('Name your report using 1–120 characters.');return value.trim();};
export function nextReportSend(timezone:string,cadence:string,time:string,now=new Date()){
 try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format(now);}catch{invalid('Choose a supported timezone.');}
 if(!['weekly','monthly'].includes(cadence)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))invalid('Choose a cadence and valid local send time.');
 // Search UTC minutes: the first occurrence in a repeated DST hour wins; a missing minute
 // is shifted to the first available minute that day. Once persisted, occurrence dedupe
 // prevents sending twice in the repeated hour.
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const current=Object.fromEntries(fmt.formatToParts(now).map(p=>[p.type,p.value]));
 const today=`${current.year}-${current.month}-${current.day}`;
 const nowTime=`${current.hour}:${current.minute}`;
 const candidateStart=nowTime>=time?shiftDate(today,1):today;
 for(let offset=0;offset<33;offset++){
  const date=shiftDate(candidateStart,offset);const scheduled=cadence==='monthly'?date.endsWith('-01'):new Date(date+'T00:00:00Z').getUTCDay()===1;if(!scheduled)continue;
  const center=Date.parse(date+'T00:00:00Z');
  for(let instant=center-15*3600000;instant<=center+39*3600000;instant+=60000){
   const parts=Object.fromEntries(fmt.formatToParts(instant).map(p=>[p.type,p.value]));const day=`${parts.year}-${parts.month}-${parts.day}`,local=`${parts.hour}:${parts.minute}`;
   if(day===date&&local>=time&&instant>now.getTime())return new Date(instant);
  }
 }
 invalid('The next send time could not be resolved.');
}
export const reportScheduleRoutes=new Elysia({name:'report-schedules'})
 .get('/api/workspaces/:workspaceId/reports/definitions',({request,params})=>withReportScope(request,params.workspaceId,async(tx,actor)=>({items:await q(tx,'select id,name,definition,version from saved_report_definitions where workspace_id=$1 and requested_by=$2 order by updated_at desc limit 100',[params.workspaceId,actor.id])})))
 .post('/api/workspaces/:workspaceId/reports/definitions',({request,params})=>withReportScope(request,params.workspaceId,async(tx,actor,workspace)=>{
  const b=await request.json(),definition=parseDefinition(b.definition,workspace.currency);reportPeriod(definition,workspace.timezone);await validateReportScope(tx,params.workspaceId,workspace,definition);
  const [count]=await q(tx,'select count(*)::int as count from saved_report_definitions where workspace_id=$1 and requested_by=$2',[params.workspaceId,actor.id]);if(count.count>=100)invalid('You can save up to 100 reports.');
  const [item]=await q(tx,'insert into saved_report_definitions(workspace_id,requested_by,name,definition) values($1,$2,$3,$4::jsonb) returning id,name,definition,version',[params.workspaceId,actor.id,name(b.name),JSON.stringify(definition)]);return {item};
 }))
 .patch('/api/workspaces/:workspaceId/reports/definitions/:id',({request,params})=>withReportScope(request,params.workspaceId,async(tx,actor,workspace)=>{
  const b=await request.json(),definition=parseDefinition(b.definition,workspace.currency);reportPeriod(definition,workspace.timezone);await validateReportScope(tx,params.workspaceId,workspace,definition);
  const [item]=await q(tx,'update saved_report_definitions set name=$4,definition=$5::jsonb,version=version+1,updated_at=now() where workspace_id=$1 and requested_by=$2 and id=$3 and version=$6 returning id,name,definition,version',[params.workspaceId,actor.id,id(params.id),name(b.name),JSON.stringify(definition),b.version]);if(!item)throw Object.assign(new Error('This report changed. Reload before saving.'),{status:409});
  await q(tx,"update report_deliveries set state='cancelled' where workspace_id=$1 and requested_by=$2 and schedule_id in (select id from report_schedules where definition_id=$3) and state in ('pending','queued')",[params.workspaceId,actor.id,params.id]);return {item};
 }))
 .delete('/api/workspaces/:workspaceId/reports/definitions/:id',({request,params})=>withReportScope(request,params.workspaceId,async(tx,actor)=>{await q(tx,'delete from saved_report_definitions where workspace_id=$1 and requested_by=$2 and id=$3',[params.workspaceId,actor.id,id(params.id)]);return {deleted:true};}))
 .get('/api/workspaces/:workspaceId/reports/schedules',({request,params})=>withReportScope(request,params.workspaceId,async(tx,actor)=>({items:await q(tx,'select s.*,r.name from report_schedules s join saved_report_definitions r on r.workspace_id=s.workspace_id and r.id=s.definition_id where s.workspace_id=$1 and s.requested_by=$2 order by s.created_at desc limit 100',[params.workspaceId,actor.id]),deliveries:await q(tx,'select id,schedule_id,occurrence,state,accepted_at,failure_code from report_deliveries where workspace_id=$1 and requested_by=$2 order by created_at desc limit 50',[params.workspaceId,actor.id])})))
 .post('/api/workspaces/:workspaceId/reports/schedules',({request,params})=>withReportScope(request,params.workspaceId,async(tx,actor,workspace)=>{
  const b=await request.json();if(b.consent!==true||!['en','id'].includes(b.locale)||!['csv','xlsx','pdf'].includes(b.format))invalid('Confirm email consent and choose a locale and format.');
  const timezone=typeof b.timezone==='string'?b.timezone:workspace.timezone;const next=nextReportSend(timezone,b.cadence,b.localTime);
  const [saved]=await q(tx,'select definition from saved_report_definitions where workspace_id=$1 and requested_by=$2 and id=$3',[params.workspaceId,actor.id,id(b.definitionId)]);if(!saved)invalid('Save a report first.');
  const definition=parseDefinition(decode(saved.definition),workspace.currency);if(definition.preset==='custom')invalid('Scheduled reports need a relative period; they always cover the previous complete week or month.');
  const [count]=await q(tx,'select count(*)::int as count from report_schedules where workspace_id=$1 and requested_by=$2',[params.workspaceId,actor.id]);if(count.count>=20)invalid('You can create up to 20 schedules.');
  const [item]=await q(tx,'insert into report_schedules(workspace_id,requested_by,definition_id,cadence,local_time,timezone,locale,format,next_run_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *',[params.workspaceId,actor.id,b.definitionId,b.cadence,b.localTime,timezone,b.locale,b.format,next.toISOString()]);return {item};
 }))
 .patch('/api/workspaces/:workspaceId/reports/schedules/:id',({request,params})=>withReportScope(request,params.workspaceId,async(tx,actor)=>{
  const b=await request.json();if(typeof b.enabled!=='boolean'||!Number.isInteger(b.version))invalid('Choose pause or resume using the current schedule version.');
  const [current]=await q(tx,'select * from report_schedules where workspace_id=$1 and requested_by=$2 and id=$3 for update',[params.workspaceId,actor.id,id(params.id)]);if(!current||current.version!==b.version)throw Object.assign(new Error('Schedule changed. Reload and try again.'),{status:409});
  const cadence=b.cadence??current.cadence,localTime=b.localTime??current.local_time,timezone=b.timezone??current.timezone,locale=b.locale??current.locale,format=b.format??current.format;
  if(!['en','id'].includes(locale)||!['pdf','xlsx','csv'].includes(format))invalid('Choose a supported locale and export format.');
  const next=nextReportSend(timezone,cadence,localTime);
  const [item]=await q(tx,'update report_schedules set enabled=$4,version=version+1,cadence=$6,local_time=$7,timezone=$8,locale=$9,format=$10,next_run_at=$11 where workspace_id=$1 and requested_by=$2 and id=$3 and version=$5 returning *',[params.workspaceId,actor.id,params.id,b.enabled,b.version,cadence,localTime,timezone,locale,format,next.toISOString()]);
  await q(tx,"update report_deliveries set state='cancelled' where workspace_id=$1 and requested_by=$2 and schedule_id=$3 and state in ('pending','queued')",[params.workspaceId,actor.id,params.id]);return {item};
 }))
 .delete('/api/workspaces/:workspaceId/reports/schedules/:id',({request,params})=>withReportScope(request,params.workspaceId,async(tx,actor)=>{await q(tx,'delete from report_schedules where workspace_id=$1 and requested_by=$2 and id=$3',[params.workspaceId,actor.id,id(params.id)]);return {deleted:true};}));

async function worker<T>(run:(tx:any)=>Promise<T>){return client.begin(async tx=>{await q(tx,"select set_config('app.report_worker','true',true)");return run(tx);}) as Promise<T>;}
export async function sweepReportSchedules(now=new Date()){
 await worker(async tx=>{
  await q(tx,"update report_deliveries set state=case when send_started_at is null then 'pending' else 'unknown' end,lease_expires_at=null where state='sending' and lease_expires_at<now()");
  await q(tx,"delete from report_deliveries where created_at<now()-interval '90 days' and state in ('accepted','cancelled','failed','unknown')");
  await q(tx,`update report_deliveries d set state='cancelled' where d.state in ('pending','queued') and (d.created_at<now()-interval '6 days' or not exists(select 1 from report_schedules s join saved_report_definitions r on r.id=s.definition_id and r.workspace_id=s.workspace_id and r.requested_by=s.requested_by join workspace_memberships m on m.workspace_id=s.workspace_id and m.user_id=s.requested_by join workspaces w on w.id=m.workspace_id join "user" u on u.id=m.user_id where s.id=d.schedule_id and s.enabled and s.version=d.schedule_version and r.version=d.definition_version and m.role in ('owner','accountant','viewer') and w.archived_at is null and u.account_status='active' and u.email_verified))`);
  const due=await q(tx,'select * from report_schedules where enabled and next_run_at<=$1 order by next_run_at limit 20 for update skip locked',[now.toISOString()]);
  for(const schedule of due){const occurrence=workspaceToday(schedule.timezone,new Date(schedule.next_run_at));const next=nextReportSend(schedule.timezone,schedule.cadence,schedule.local_time,now);const [definition]=await q(tx,'select version from saved_report_definitions where id=$1 and workspace_id=$2 and requested_by=$3',[schedule.definition_id,schedule.workspace_id,schedule.requested_by]);if(definition)await q(tx,'insert into report_deliveries(workspace_id,requested_by,schedule_id,schedule_version,definition_version,occurrence) values($1,$2,$3,$4,$5,$6) on conflict(schedule_id,occurrence) do nothing',[schedule.workspace_id,schedule.requested_by,schedule.id,schedule.version,definition.version,occurrence]);await q(tx,'update report_schedules set next_run_at=$2 where id=$1',[schedule.id,next.toISOString()]);}
 });
 const pending:any[]=await worker(tx=>q(tx,"select d.*,s.definition_id,s.cadence,s.timezone,s.locale,s.format,r.definition,r.name,u.email from report_deliveries d join report_schedules s on s.id=d.schedule_id and s.workspace_id=d.workspace_id and s.requested_by=d.requested_by join saved_report_definitions r on r.id=s.definition_id and r.workspace_id=s.workspace_id and r.requested_by=s.requested_by join \"user\" u on u.id=d.requested_by where d.state in ('pending','queued') and d.available_at<=now() and d.created_at>now()-interval '6 days' and s.enabled and s.version=d.schedule_version and r.version=d.definition_version and u.email_verified and u.account_status='active' order by d.created_at limit 20 for update of d skip locked"));
 for(const delivery of pending){const [lease]:any[]=await worker(tx=>q(tx,"update report_deliveries set available_at=now()+interval '15 minutes' where id=$1 and state in ('pending','queued') and available_at<=now() returning id",[delivery.id]));if(!lease)continue;try{
  const run=await worker(async tx=>{
   await q(tx,"select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[delivery.requested_by,delivery.workspace_id]);
   const [ws]=await q(tx,"select w.*,m.role from workspaces w join workspace_memberships m on m.workspace_id=w.id and m.user_id=$2 where w.id=$1 and w.archived_at is null and m.role in ('owner','accountant','viewer')",[delivery.workspace_id,delivery.requested_by]);if(!ws){await q(tx,"update report_deliveries set state='cancelled' where id=$1",[delivery.id]);return null;}
   await q(tx,"select set_config('app.workspace_role',$1,true)",[ws.role]);
   const definition=parseDefinition({...decode(delivery.definition),preset:delivery.cadence==='weekly'?'last_week':'last_month'},ws.currency);const period=reportPeriod(definition,'UTC',new Date(delivery.occurrence+'T12:00:00Z'));
   const [r]=await q(tx,`insert into report_runs(workspace_id,requested_by,report_type,preset,parameters,request_key,status,period_from,period_to_exclusive,timezone,currency,content_hash,report_version) values($1,$2,$3,$4,$5::jsonb,$6,'queued',$7,$8,$9,$10,'queued','reports-v2') on conflict(workspace_id,requested_by,request_key) do update set request_key=excluded.request_key returning id,status`,[delivery.workspace_id,delivery.requested_by,definition.reportType,definition.preset,JSON.stringify({definition}),`schedule:${delivery.id}`,period.from,period.toExclusive,delivery.timezone,definition.currency]);await q(tx,'update report_deliveries set run_id=$2 where id=$1',[delivery.id,r.id]);return r;
  });if(!run)continue;
  await processQueuedReportRun(run.id,delivery.workspace_id,delivery.requested_by);
  const exported=await worker(async tx=>{const [ready]=await q(tx,"select id,status from report_runs where id=$1 and expires_at>now()",[run.id]);if(!ready||ready.status==='failed'){await q(tx,"update report_deliveries set state='failed',failure_code='REPORT_GENERATION_FAILED' where id=$1",[delivery.id]);return null;}if(ready.status!=='ready')return null;const [e]=await q(tx,`insert into report_exports(workspace_id,requested_by,run_id,format,request_key) values($1,$2,$3,$4,$5) on conflict(workspace_id,requested_by,run_id,request_key) do update set request_key=excluded.request_key returning id`,[delivery.workspace_id,delivery.requested_by,run.id,delivery.format,`schedule:${delivery.id}`]);await q(tx,'update report_deliveries set export_id=$2 where id=$1',[delivery.id,e.id]);return e;});if(!exported)continue;
  await processQueuedReportExport(exported.id,delivery.workspace_id,delivery.requested_by);
  const [ready]:any[]=await worker(tx=>q(tx,"select id,status from report_exports where id=$1 and expires_at>now()",[exported.id]));if(!ready||ready.status==='failed'){await worker(tx=>q(tx,"update report_deliveries set state='failed',failure_code='EXPORT_FAILED' where id=$1",[delivery.id]));continue;}if(ready.status!=='ready')continue;
  await enqueueEmail({kind:'scheduled-report',to:delivery.email,workspaceId:delivery.workspace_id,requestedBy:delivery.requested_by,deliveryId:delivery.id,title:delivery.name,locale:delivery.locale,expiresAt:Date.now()+86400000},`scheduled-report-${delivery.id}-${randomUUID()}`);
  await worker(tx=>q(tx,"update report_deliveries set state='queued',available_at=now()+interval '5 minutes' where id=$1 and state in ('pending','queued')",[delivery.id]));
 }catch(error){await worker(tx=>q(tx,"update report_deliveries set state=case when attempts>=4 then 'failed' else 'pending' end,attempts=attempts+1,available_at=now()+interval '5 minutes',failure_code='REPORT_SCHEDULE_FAILED' where id=$1 and state in ('pending','queued')",[delivery.id]));console.error('Scheduled report generation failed');}}
}
export async function deliverScheduledReport(message:Extract<EmailMessage,{kind:'scheduled-report'}>,deliver=sendEmail){
 if(message.expiresAt<=Date.now())return;
 const context=await worker(async tx=>{
  const [row]=await q(tx,`update report_deliveries d set state='sending',attempts=attempts+1,lease_expires_at=now()+interval '2 minutes',send_started_at=null where d.id=$1 and d.workspace_id=$2 and d.requested_by=$3 and d.state in ('pending','queued') and d.attempts<5 returning *`,[message.deliveryId,message.workspaceId,message.requestedBy]);if(!row)return null;
  return row;
 });if(!context)return;
 const allowed=()=>worker(async tx=>{const [row]=await q(tx,`select e.object_key,e.format,e.checksum,s.locale,r.name from report_deliveries d join report_schedules s on s.id=d.schedule_id and s.workspace_id=d.workspace_id and s.requested_by=d.requested_by join saved_report_definitions r on r.id=s.definition_id and r.workspace_id=s.workspace_id and r.requested_by=s.requested_by join report_exports e on e.id=d.export_id and e.workspace_id=d.workspace_id and e.requested_by=d.requested_by join report_runs run on run.id=e.run_id and run.workspace_id=e.workspace_id and run.requested_by=e.requested_by join workspace_memberships m on m.workspace_id=d.workspace_id and m.user_id=d.requested_by join workspaces w on w.id=m.workspace_id join "user" u on u.id=d.requested_by where d.id=$1 and d.workspace_id=$2 and d.requested_by=$3 and d.state='sending' and d.attempts=$5 and s.enabled and s.version=d.schedule_version and r.version=d.definition_version and m.role in ('owner','accountant','viewer') and w.archived_at is null and u.email=$4 and u.email_verified and u.account_status='active' and e.status='ready' and e.expires_at>now() and run.expires_at>now()`,[message.deliveryId,message.workspaceId,message.requestedBy,message.to,context.attempts]);return row;});
 const row=await allowed();if(!row){await worker(tx=>q(tx,"update report_deliveries set state='cancelled',lease_expires_at=null where id=$1 and state='sending' and attempts=$2",[message.deliveryId,context.attempts]));return;}
 let smtpAccepted=false;
 try{
  const object=await getAttachment(row.object_key);const content=await object.Body!.transformToByteArray();
  const {createHash}=await import('node:crypto');if(createHash('sha256').update(content).digest('hex')!==row.checksum)throw Object.assign(new Error('Artifact checksum mismatch'),{code:'ARTIFACT_INVALID'});
  if(!await allowed()){await worker(tx=>q(tx,"update report_deliveries set state='cancelled',lease_expires_at=null where id=$1 and state='sending' and attempts=$2",[message.deliveryId,context.attempts]));return;}
  const [started]:any[]=await worker(tx=>q(tx,"update report_deliveries set send_started_at=now() where id=$1 and state='sending' and attempts=$2 returning id",[message.deliveryId,context.attempts]));if(!started)return;
  await deliver({...message,title:row.name,locale:row.locale},[{filename:`capybudget-report.${row.format}`,content,contentType:row.format==='pdf'?'application/pdf':row.format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv'}]);
  smtpAccepted=true;
  await worker(tx=>q(tx,"update report_deliveries set state='accepted',accepted_at=now(),lease_expires_at=null where id=$1 and state='sending' and attempts=$2",[message.deliveryId,context.attempts]));
 }catch(error){const classified=classifySmtpError(error),result={...classified,uncertain:smtpAccepted||classified.uncertain};await worker(tx=>q(tx,"update report_deliveries set state=case when $2 then 'unknown' when $3 or attempts>=5 then 'failed' else 'pending' end,available_at=now()+interval '5 minutes',failure_code=$4,lease_expires_at=null where id=$1 and state='sending' and attempts=$5",[message.deliveryId,result.uncertain,result.permanent,result.code,context.attempts]));if(result.uncertain||result.permanent)throw new UnrecoverableError('Scheduled report delivery could not be confirmed');throw error;}
}
