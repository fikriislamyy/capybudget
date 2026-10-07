import {eligibleNudgeTopics,filterNudgeMetrics} from './feedback';
import {client} from '../../db';
import type {EmailMessage} from '../../email/types';
import {classifySmtpError} from '../../email/smtp-outcome';
import {UnrecoverableError} from 'bullmq';
import {quietTime,summaryMetrics} from './summaries';
import {protectedJson} from '../../security/business-fields';
import {toUnits} from '../money';
import {shiftDate} from './calculations';
export async function deliverAssistantSummary(message:Extract<EmailMessage,{kind:'assistant-alert'|'assistant-summary'}>,deliver:(message:EmailMessage)=>Promise<void>){
 const query=(sql:string,values:unknown[]=[])=>client.begin(async tx=>{await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[message.userId,message.workspaceId]);return tx.unsafe(sql,values as never[]);});
 const [claimed]=await query("update finance_notification_deliveries set status='processing',attempts=attempts+1,send_started_at=null,lease_expires_at=now()+interval '1 minute',updated_at=now() where workspace_id=$1 and user_id=$2 and id=$3 and channel='email' and status in ('pending','retryable') and available_at<=now() and expires_at>now() and attempts<5 returning id",[message.workspaceId,message.userId,message.deliveryId]);if(!claimed)return;
 const [allowed]=await query(`select a.consent_version,sc.version as schedule_version,sc.timezone,sc.quiet_start,sc.quiet_end,s.id as summary_id,s.period_start::text,s.period_end::text,s.kind,a.locale,w.currency,w.timezone as workspace_timezone,w.kind as workspace_kind,m.role from finance_notifications n
 join finance_notification_deliveries d on d.workspace_id=n.workspace_id and d.user_id=n.user_id and d.notification_id=n.id
 join assistant_summaries s on s.workspace_id=n.workspace_id and s.user_id=n.user_id and s.id=n.source_id
 join assistant_summary_schedules sc on sc.workspace_id=s.workspace_id and sc.user_id=s.user_id
 join assistant_settings a on a.workspace_id=s.workspace_id and a.user_id=s.user_id
 join workspace_memberships m on m.workspace_id=s.workspace_id and m.user_id=s.user_id
 join workspaces w on w.id=m.workspace_id and w.archived_at is null
 where n.workspace_id=$1 and n.user_id=$2 and n.id=$3 and d.id=$4 and d.status='processing' and n.kind='assistant-summary'
 and n.resolved_at is null and n.dismissed_at is null and (n.snoozed_until is null or n.snoozed_until<=now())
 and s.state<>'suppressed' and s.expires_at>now() and s.consent_version=a.consent_version and sc.consent_version=a.consent_version and s.schedule_version=sc.version and a.local_forecast_enabled=true
 and sc.channels @> '["email"]'::jsonb and ((s.kind='nudge' and sc.nudge_frequency<>'off' and a.suggestions_enabled=true) or (s.kind<>'nudge' and sc.enabled=true))`,[message.workspaceId,message.userId,message.notificationId,message.deliveryId]);
 if(!allowed||message.expiresAt<=Date.now()){await query("update finance_notification_deliveries set status='cancelled',lease_expires_at=null where workspace_id=$1 and user_id=$2 and id=$3",[message.workspaceId,message.userId,message.deliveryId]);return;}
 const localTime=new Intl.DateTimeFormat('en-GB',{timeZone:allowed.timezone,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());if(quietTime(localTime,String(allowed.quiet_start),String(allowed.quiet_end))){await query("update finance_notification_deliveries set status='retryable',available_at=now()+interval '30 minutes',lease_expires_at=null where workspace_id=$1 and user_id=$2 and id=$3",[message.workspaceId,message.userId,message.deliveryId]);return;}
 const fresh=await client.begin(async tx=>{await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true),set_config('app.workspace_role',$3,true)",[message.userId,message.workspaceId,allowed.role]);const metrics=await summaryMetrics(tx,message.workspaceId,message.userId,{currency:String(allowed.currency),timezone:String(allowed.workspace_timezone),kind:String(allowed.workspace_kind)},String(allowed.period_start),String(allowed.period_end));if(allowed.kind==='nudge'&&!(await eligibleNudgeTopics(tx,message.workspaceId,message.userId,metrics)).length)return null;const feedbackTopics=allowed.kind==='nudge'?await eligibleNudgeTopics(tx,message.workspaceId,message.userId,metrics):[];const currentMetrics=allowed.kind==='nudge'?filterNudgeMetrics(metrics,feedbackTopics):metrics;await tx.unsafe('update assistant_summaries set metrics=$4::jsonb where workspace_id=$1 and user_id=$2 and id=$3',[message.workspaceId,message.userId,allowed.summary_id,protectedJson(currentMetrics,message.workspaceId,String(allowed.summary_id),'metrics')]);return currentMetrics;});
 if(!fresh){await query("update finance_notification_deliveries set status='cancelled',lease_expires_at=null where workspace_id=$1 and user_id=$2 and id=$3",[message.workspaceId,message.userId,message.deliveryId]);await query("update finance_notifications set resolved_at=now(),resolution_reason='nudge-resolved' where workspace_id=$1 and user_id=$2 and id=$3",[message.workspaceId,message.userId,message.notificationId]);return;}
 const amount=(value:string|null)=>value===null?'—':`${fresh.currency} ${value.replace(/\.0+$/,'')}`;
 const date=(value:string)=>value.split('-').reverse().join('-');
 const text=allowed.locale==='id'?`Ringkasan ${date(fresh.start)} sampai ${date(fresh.end)}: pemasukan tercatat ${amount(fresh.income)} dan pengeluaran ${amount(fresh.expenses)}. Tinjau tagihan mendatang dan progres tujuan di CapyBudget.`:`Your check-in for ${date(fresh.start)} to ${date(fresh.end)}: recorded income ${amount(fresh.income)} and expenses ${amount(fresh.expenses)}. Review upcoming bills and goal progress in CapyBudget.`;
 const currentMessage={...message,message:text};
 // The authorization boundary is immediately before handing the message to SMTP.
 const started=await query(`update finance_notification_deliveries d set send_started_at=now() where d.workspace_id=$1 and d.user_id=$2 and d.id=$3 and d.status='processing' and d.expires_at>now() and exists (
 select 1 from assistant_settings a join assistant_summary_schedules sc on sc.workspace_id=a.workspace_id and sc.user_id=a.user_id
 join assistant_summaries s on s.workspace_id=a.workspace_id and s.user_id=a.user_id
 join finance_notifications n on n.workspace_id=s.workspace_id and n.user_id=s.user_id and n.source_id=s.id
 join workspace_memberships m on m.workspace_id=a.workspace_id and m.user_id=a.user_id
 join workspaces w on w.id=m.workspace_id and w.archived_at is null
 join "user" u on u.id=a.user_id and u.account_status='active'
 where a.workspace_id=d.workspace_id and a.user_id=d.user_id and n.id=d.notification_id and s.id=$4
 and a.local_forecast_enabled and a.consent_version=$5 and sc.consent_version=a.consent_version and sc.version=$6 and s.schedule_version=sc.version and s.consent_version=a.consent_version
 and n.resolved_at is null and n.dismissed_at is null and (n.snoozed_until is null or n.snoozed_until<=now()) and s.state<>'suppressed' and s.expires_at>now()
 and sc.channels @> '["email"]'::jsonb and m.role in ('owner','accountant','viewer')
 and ((s.kind='nudge' and sc.nudge_frequency<>'off' and a.suggestions_enabled) or (s.kind<>'nudge' and sc.enabled))) returning d.id`,[message.workspaceId,message.userId,message.deliveryId,allowed.summary_id,allowed.consent_version,allowed.schedule_version]);
 if(!started.length){await query("update finance_notification_deliveries set status='cancelled',lease_expires_at=null where workspace_id=$1 and user_id=$2 and id=$3",[message.workspaceId,message.userId,message.deliveryId]);return;}
 try{await deliver(currentMessage);}catch(e){const {code,uncertain,permanent}=classifySmtpError(e);await query("update finance_notification_deliveries set status=case when $4::boolean then 'unknown' when $5::boolean or attempts>=5 then 'failed' else 'retryable' end,last_error_code=$6,available_at=now()+interval '5 minutes',lease_expires_at=null,send_started_at=case when $4::boolean then send_started_at else null end where workspace_id=$1 and user_id=$2 and id=$3",[message.workspaceId,message.userId,message.deliveryId,uncertain,permanent,code]);if(uncertain||permanent)throw new UnrecoverableError('Summary email could not be confirmed');throw e;}
 await query("update finance_notification_deliveries set status='accepted',accepted_at=now(),lease_expires_at=null where workspace_id=$1 and user_id=$2 and id=$3",[message.workspaceId,message.userId,message.deliveryId]);await query('update finance_notifications set email_sent_at=now() where workspace_id=$1 and user_id=$2 and id=$3',[message.workspaceId,message.userId,message.notificationId]);
}
