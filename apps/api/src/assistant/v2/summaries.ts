import {eligibleNudgeTopics,filterNudgeMetrics} from './feedback';
import {opportunityFindings} from './opportunities';
import type {TransactionSql} from 'postgres';
import {client} from '../../db';
import {workspaceToday} from '../../tracking/recurrence';
import {protectedJson} from '../../security/business-fields';
import {fromUnits,toUnits} from '../money';
import {v2q as q,v2Context,spendingRows,goalsData,receivablesData} from './data';
import {shiftDate} from './calculations';
import {randomUUID,createHash} from 'node:crypto';
import {enqueueEmail} from '../../email/queue';
import type {EmailMessage} from '../../email/types';
export function summaryPeriod(today:string,cadence:'weekly'|'monthly'){
 if(cadence==='monthly'){const end=shiftDate(today.slice(0,8)+'01',-1);return {start:end.slice(0,8)+'01',end};}
 const day=new Date(today+'T00:00:00Z').getUTCDay(),monday=shiftDate(today,-((day+6)%7));return {start:shiftDate(monday,-7),end:shiftDate(monday,-1)};
}
export function quietTime(time:string,start:string,end:string){const current=time.slice(0,5),s=start.slice(0,5),e=end.slice(0,5);return s===e?false:s<e?current>=s&&current<e:current>=s||current<e;}
export async function summaryMetrics(tx:TransactionSql,ws:string,user:string,workspace:{currency:string;timezone:string;kind:string},start:string,end:string){
 const {prefs,built,accountIds}=await v2Context(tx,ws,user,workspace),rows=built.allowed.history?await spendingRows(tx,ws,user,accountIds,start,end,false):[];
 const length=Math.floor((Date.parse(end)-Date.parse(start))/86400000)+1,previousEnd=shiftDate(start,-1),fullMonth=start.endsWith('-01')&&shiftDate(end,1).endsWith('-01'),previousStart=fullMonth?previousEnd.slice(0,8)+'01':shiftDate(start,-length),previousRows=built.allowed.history?await spendingRows(tx,ws,user,accountIds,previousStart,previousEnd,false):[];
 const total=(type:string)=>fromUnits(rows.filter(r=>r.type===type&&r.currency===workspace.currency).reduce((sum,r)=>sum+toUnits(r.amount),0n));
 const previousIncome=fromUnits(previousRows.filter(r=>r.type==='income'&&r.currency===workspace.currency).reduce((n,r)=>n+toUnits(r.amount),0n)),previousExpenses=fromUnits(previousRows.filter(r=>r.type==='expense'&&r.currency===workspace.currency).reduce((n,r)=>n+toUnits(r.amount),0n));
 const goals=built.allowed.goals?await goalsData(tx,ws,accountIds,workspace.currency,built.today,built.result.safeToSpend):[];
 const opportunityTopics=(await opportunityFindings(tx,ws,accountIds,workspace.currency,built.today,built.allowed)).map(f=>({kind:f.kind,fingerprint:f.fingerprint}));
 for(const goal of goals.filter(g=>g.coaching.weeklyTarget))opportunityTopics.push({kind:'goal_coaching',fingerprint:'goal:'+goal.id});
 if(built.result.safeToSpend!==null&&toUnits(built.result.safeToSpend)>0n&&goals.length)opportunityTopics.push({kind:'savings',fingerprint:'savings:'+built.today.slice(0,7)});
 return {opportunityTopics,sourceVersion:'summary-v2.2',sourceHash:createHash('sha256').update(JSON.stringify({rows,previousRows,accountIds,consent:prefs.consent_version})).digest('hex'),previous:{start:previousStart,end:previousEnd,income:previousIncome,expenses:previousExpenses},expenseChange:built.allowed.history?fromUnits(toUnits(total('expense'))-toUnits(previousExpenses)):null,currency:workspace.currency,start,end,income:built.allowed.history?total('income'):null,expenses:built.allowed.history?total('expense'):null,coverage:built.result.qualityFlags,asOfDate:built.today,goals,upcomingBills:built.allowed.bills?built.events.filter(e=>e.kind==='bill').slice(0,30):[],receivables:workspace.kind==='business'&&built.allowed.invoices?await receivablesData(tx,ws,accountIds,workspace.currency,built.today):[],safeToSpend:built.result.safeToSpend,explanation:'Totals are calculated from recorded transactions in permitted accounts. Goals are targets, not automatic debits.',consentVersion:prefs.consent_version,evidence:rows.slice(0,50).map(r=>r.id)};
}
/** Recovery uses the committed notification delivery outbox; queue downtime does not lose periods. */
export async function sweepAssistantSummaries(){
 const members=await client.unsafe("select w.id,w.currency,w.timezone,w.kind,m.user_id,m.role from workspaces w join workspace_memberships m on m.workspace_id=w.id join \"user\" u on u.id=m.user_id where w.archived_at is null and u.account_status='active' and m.role in ('owner','accountant','viewer') order by w.id,m.user_id");
 for(const member of members){const jobs:Array<{message:EmailMessage;id:string}>=[];try{await client.begin(async tx=>{
  const ws=String(member.id),user=String(member.user_id);await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true),set_config('app.workspace_role',$3,true)",[user,ws,member.role]);
  await q(tx,"update finance_notification_deliveries d set status=case when d.send_started_at is null then 'retryable' else 'unknown' end,lease_expires_at=null,available_at=now() from finance_notifications n where d.workspace_id=$1 and d.user_id=$2 and n.workspace_id=d.workspace_id and n.user_id=d.user_id and n.id=d.notification_id and n.kind='assistant-summary' and d.status='processing' and d.lease_expires_at<=now()",[ws,user]);
  const [schedule]=await q(tx,'select * from assistant_summary_schedules where workspace_id=$1 and user_id=$2 for update',[ws,user]);const [prefs]=await q(tx,'select * from assistant_settings where workspace_id=$1 and user_id=$2',[ws,user]);
  for(const table of ['forecast_scenarios','insight_findings','customer_payment_metrics','ai_conversations','transaction_entry_drafts','assistant_summaries','ai_invocations','assistant_feedback'])await q(tx,`delete from ${table} where workspace_id=$1 and user_id=$2 and expires_at<=now()`,[ws,user]);
  if(!schedule||!prefs?.local_forecast_enabled||schedule.consent_version!==prefs.consent_version)return;
  const today=workspaceToday(schedule.timezone),localTime=new Intl.DateTimeFormat('en-GB',{timeZone:schedule.timezone,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());if(quietTime(localTime,schedule.quiet_start,schedule.quiet_end)||localTime<schedule.local_send_time.slice(0,5))return;
  const periods:Array<{kind:'weekly'|'monthly'|'nudge';start:string;end:string}>=[];if(schedule.enabled)periods.push({kind:schedule.cadence,...summaryPeriod(today,schedule.cadence)});
  if(schedule.nudge_frequency!=='off'&&prefs.suggestions_enabled){const start=schedule.nudge_frequency==='daily'?today:shiftDate(today,-((new Date(today+'T00:00:00Z').getUTCDay()+6)%7));periods.push({kind:'nudge',start,end:today});}
  for(const period of periods){const [existing]=await q(tx,'select id from assistant_summaries where workspace_id=$1 and user_id=$2 and kind=$3 and period_start=$4 and schedule_version=$5',[ws,user,period.kind,period.start,schedule.version]);if(existing)continue;
   const baseMetrics=await summaryMetrics(tx,ws,user,member as any,period.start,period.end),feedbackTopics=period.kind==='nudge'?await eligibleNudgeTopics(tx,ws,user,baseMetrics):[];if(period.kind==='nudge'&&!feedbackTopics.length)continue;const metrics=period.kind==='nudge'?filterNudgeMetrics(baseMetrics,feedbackTopics):baseMetrics;
   const id=randomUUID();await q(tx,'insert into assistant_summaries(id,workspace_id,user_id,consent_version,period_start,period_end,kind,metrics,schedule_version) values($3,$1,$2,$4,$5,$6,$7,$8::jsonb,$9)',[ws,user,id,prefs.consent_version,period.start,period.end,period.kind,protectedJson(metrics,ws,id,'metrics'),schedule.version]);
   const isId=prefs.locale==='id',title=isId?'Ringkasan uangmu sudah siap':'Your money check-in is ready',message=period.kind==='nudge'?(isId?'Ada hal yang bisa ditinjau dalam arus kasmu. Lihat alasannya di Capy.':'There is something to review in your cashflow. See why in Capy.'):(isId?'Lihat ringkasan, tagihan mendatang, dan progres tujuan di Capy.':'Review your summary, upcoming bills, and goal progress with Capy.');
   const [notification]=await q(tx,"insert into finance_notifications(workspace_id,user_id,kind,source_id,source_type,dedupe_key,title,message,severity,action_type,source_revision) values($1,$2,'assistant-summary',$3,'assistant_summary',$4,$5,$6,'info','open-assistant',$7) on conflict(workspace_id,user_id,dedupe_key) do update set updated_at=finance_notifications.updated_at returning id",[ws,user,id,'assistant-summary:'+id,title,message,String(schedule.version)]);
   if(schedule.channels.includes('email')){const [destination]=await q(tx,'select email from "user" where id=$1',[user]);await q(tx,"insert into finance_notification_deliveries(workspace_id,user_id,notification_id,channel,destination_key,preference_version) values($1,$2,$3,'email',$4,$5) on conflict do nothing",[ws,user,notification.id,'assistant-summary:'+user,schedule.version]);}
  }
  // Suppress stale schedules/consent before every dispatch and on next sweep.
  await q(tx,"update finance_notifications n set resolved_at=now(),resolution_reason='assistant-settings-changed' from assistant_summaries s where n.workspace_id=$1 and n.user_id=$2 and s.workspace_id=n.workspace_id and s.user_id=n.user_id and s.id=n.source_id and n.source_type='assistant_summary' and (s.schedule_version<>$3 or s.consent_version<>$4 or (s.kind<>'nudge' and $5=false) or (s.kind='nudge' and $6='off')) and n.resolved_at is null",[ws,user,schedule.version,prefs.consent_version,schedule.enabled,schedule.nudge_frequency]);
  const pending=await q(tx,"select d.id,d.notification_id,n.title,n.message,u.email from finance_notification_deliveries d join finance_notifications n on n.workspace_id=d.workspace_id and n.user_id=d.user_id and n.id=d.notification_id join \"user\" u on u.id=d.user_id where d.workspace_id=$1 and d.user_id=$2 and n.kind='assistant-summary' and n.resolved_at is null and d.status in ('pending','retryable') and d.available_at<=now() and d.expires_at>now() order by d.created_at limit 20",[ws,user]);
  for(const p of pending)jobs.push({id:p.id,message:{kind:'assistant-summary',workspaceId:ws,userId:user,notificationId:p.notification_id,deliveryId:p.id,to:p.email,title:p.title,message:p.message,locale:prefs.locale,expiresAt:Date.now()+86400000}});
 });for(const job of jobs)await enqueueEmail(job.message,'assistant-summary-'+job.id);}catch{console.error('Assistant summary sweep failed',{workspaceId:member.id});}}
}
