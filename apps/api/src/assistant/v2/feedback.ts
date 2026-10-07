import type {TransactionSql} from 'postgres';
import {revealRow} from '../../security/business-fields';
import {toUnits} from '../money';

export type FeedbackAction='helpful'|'not_helpful'|'dismiss';
export type NudgeTopic={kind:string;fingerprint:string};
export type FeedbackRow={kind:string;fingerprint:string;vote:string|null;vote_at:Date|string|null;dismissed_at:Date|string|null};
const DAY=86400000;
const query=(tx:TransactionSql,sql:string,values:unknown[])=>tx.unsafe(sql,values as never[]);
/** Two distinct negative ratings since the last positive one pause this type for 14 days.
 * Positive feedback restores the configured cadence; it never increases that cadence. */
export function feedbackAllows(rows:FeedbackRow[],topic:NudgeTopic,now=Date.now()){
 const recent=rows.filter(r=>r.kind===topic.kind);
 if(recent.some(r=>r.fingerprint===topic.fingerprint&&r.dismissed_at&&new Date(r.dismissed_at).getTime()>now-90*DAY))return false;
 const positive=Math.max(0,...recent.filter(r=>r.vote==='helpful'&&r.vote_at).map(r=>new Date(r.vote_at!).getTime()));
 const negatives=recent.filter(r=>r.vote==='not_helpful'&&r.vote_at&&new Date(r.vote_at).getTime()>Math.max(positive,now-90*DAY));
 if(new Set(negatives.map(r=>r.fingerprint)).size<2)return true;
 return now>=Math.max(...negatives.map(r=>new Date(r.vote_at!).getTime()))+14*DAY;
}
export async function feedbackRows(tx:TransactionSql,ws:string,user:string):Promise<FeedbackRow[]>{
 return await query(tx,'select kind,fingerprint,vote,vote_at,dismissed_at from assistant_feedback where workspace_id=$1 and user_id=$2 and expires_at>now()',[ws,user]) as unknown as FeedbackRow[];
}
export async function recordFeedback(tx:TransactionSql,ws:string,user:string,sourceType:string,sourceId:string,topics:NudgeTopic[],action:FeedbackAction){
 for(const topic of topics)await query(tx,`insert into assistant_feedback(workspace_id,user_id,source_type,source_id,kind,fingerprint,vote,vote_at,dismissed_at)
 values($1,$2,$3,$4,$5,$6,case when $7='dismiss' then null else $7 end,case when $7='dismiss' then null else now() end,case when $7='dismiss' then now() else null end)
 on conflict(workspace_id,user_id,source_type,source_id,kind,fingerprint) do update set
 vote=case when $7='dismiss' then assistant_feedback.vote else $7 end,
 vote_at=case when $7='dismiss' or assistant_feedback.vote=$7 then assistant_feedback.vote_at else now() end,
 dismissed_at=case when $7='dismiss' then coalesce(assistant_feedback.dismissed_at,now()) else assistant_feedback.dismissed_at end,
 updated_at=now(),expires_at=now()+interval '90 days'
 where ($7='dismiss' and assistant_feedback.dismissed_at is null) or ($7<>'dismiss' and assistant_feedback.vote is distinct from $7)`,[ws,user,sourceType,sourceId,topic.kind,topic.fingerprint,action]);
}
export function nudgeTopics(metrics:{asOfDate:string;safeToSpend:string|null;upcomingBills:Array<{id:string;date:string}>;opportunityTopics?:NudgeTopic[]}):NudgeTopic[]{
 const through=new Date(metrics.asOfDate+'T00:00:00Z');through.setUTCDate(through.getUTCDate()+7);
 const topics:NudgeTopic[]=[...(metrics.opportunityTopics??[])];
 for(const bill of metrics.upcomingBills.filter(b=>b.date<=through.toISOString().slice(0,10)))topics.push({kind:'upcoming_bills',fingerprint:'bill:'+bill.id});
 if(metrics.safeToSpend===null||toUnits(metrics.safeToSpend)<=0n)topics.push({kind:'cashflow_checkin',fingerprint:'cashflow:'+metrics.asOfDate});
 return topics;
}
export async function eligibleNudgeTopics(tx:TransactionSql,ws:string,user:string,metrics:Parameters<typeof nudgeTopics>[0]){
 const rows=await feedbackRows(tx,ws,user);return nudgeTopics(metrics).filter(topic=>feedbackAllows(rows,topic));
}
/** Immediately cancel affected optional nudges, including queued email. Other alerts are untouched. */
export async function suppressFeedbackNudges(tx:TransactionSql,ws:string,user:string){
 const feedback=await feedbackRows(tx,ws,user);
 const summaries=await query(tx,"select s.* from assistant_summaries s where s.workspace_id=$1 and s.user_id=$2 and s.kind='nudge' and s.state<>'suppressed' and s.expires_at>now()",[ws,user]);
 for(const raw of summaries){const row=revealRow(raw,ws),topics=row.metrics.feedbackTopics??nudgeTopics(row.metrics);
  if(topics.length&&topics.some((topic:NudgeTopic)=>feedbackAllows(feedback,topic)))continue;
  await query(tx,"update assistant_summaries set state='suppressed' where workspace_id=$1 and user_id=$2 and id=$3",[ws,user,row.id]);
  await query(tx,"update finance_notifications set resolved_at=coalesce(resolved_at,now()),resolution_reason='assistant-feedback' where workspace_id=$1 and user_id=$2 and source_type='assistant_summary' and source_id=$3",[ws,user,row.id]);
  await query(tx,"update finance_notification_deliveries d set status='cancelled',lease_expires_at=null from finance_notifications n where d.workspace_id=$1 and d.user_id=$2 and n.workspace_id=d.workspace_id and n.user_id=d.user_id and n.id=d.notification_id and n.source_type='assistant_summary' and n.source_id=$3 and d.status in ('pending','retryable','processing') and d.send_started_at is null",[ws,user,row.id]);
 }
}

export function filterNudgeMetrics<T extends Parameters<typeof nudgeTopics>[0]>(metrics:T,topics:NudgeTopic[]){
 const included=new Set(topics.map(t=>t.kind+':'+t.fingerprint));
 return {...metrics,feedbackTopics:topics,upcomingBills:metrics.upcomingBills.filter(b=>included.has('upcoming_bills:bill:'+b.id)),opportunityTopics:(metrics.opportunityTopics??[]).filter(t=>included.has(t.kind+':'+t.fingerprint))};
}

/** Persist computed coaching identities in one batch, rather than one query per goal. */
export async function saveFeedbackTargets(tx:TransactionSql,ws:string,user:string,consent:number,topics:NudgeTopic[]){
 const result=new Map<string,{id:string;feedback:string|null;dismissed:boolean}>();if(!topics.length)return result;
 const targets=await query(tx,`insert into insight_findings(workspace_id,user_id,consent_version,kind,fingerprint,detector_version,evidence,facts)
 select $1,$2,$3,t.kind,t.fingerprint,'feedback-v1','[]'::jsonb,'{}'::jsonb from jsonb_to_recordset($4::jsonb) as t(kind text,fingerprint text)
 on conflict(workspace_id,user_id,fingerprint) do update set consent_version=excluded.consent_version,expires_at=now()+interval '30 days' returning id,state,kind,fingerprint`,[ws,user,consent,JSON.stringify(topics)]);
 const feedback=await feedbackRows(tx,ws,user);
 for(const target of targets){const ratings=feedback.filter(f=>f.kind===target.kind&&f.fingerprint===target.fingerprint).sort((a,b)=>new Date(b.vote_at??0).getTime()-new Date(a.vote_at??0).getTime());
  result.set(String(target.fingerprint),{id:String(target.id),feedback:ratings[0]?.vote??null,dismissed:target.state==='dismissed'||ratings.some(f=>Boolean(f.dismissed_at))});}
 return result;
}
