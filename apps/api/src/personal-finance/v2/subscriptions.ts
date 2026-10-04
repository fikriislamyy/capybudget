import {Elysia} from 'elysia';
import {withWorkspace,q,reject,isoDate} from '../../tracking/routes';
import {Money,positive} from '../../tracking/v2/money';
import {nextOccurrenceDate} from '../../tracking/recurrence';
import {label} from './debts';
import type {TransactionSql} from 'postgres';
const normalize=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function cadence(dates:string[]):'week'|'month'|'year'|null{
 for(const unit of ['week','month','year'] as const){
  let matches=true;for(let i=1;i<dates.length;i++){
   const prev=dates[i-1]!,next=dates[i]!,day=Number(prev.slice(8)),expected=nextOccurrenceDate(prev,unit,1,1);
   if(Math.abs(Date.parse(next)-Date.parse(expected))/86400000>(unit==='week'?2:unit==='month'?5:10)){matches=false;break;}
  }if(matches)return unit;
 }return null;
}
async function list(tx:TransactionSql,ws:string){
 const items=await q(tx,`select s.id,s.name,s.amount::text,s.currency,s.cadence,s.next_charge as "nextCharge",s.status,s.account_id as "accountId",s.bill_id as "billId",s.last_reviewed_on as "lastReviewedOn",s.normalized_merchant as merchant,
 exists(select 1 from subscriptions other where other.workspace_id=s.workspace_id and other.id<>s.id and other.normalized_merchant=s.normalized_merchant and other.status='active') as overlap,
 exists(select 1 from transactions t where t.workspace_id=s.workspace_id and t.account_id=s.account_id and t.type='expense' and t.deleted_at is null and t.occurred_at>s.cancelled_on and trim(regexp_replace(lower(t.merchant),'[^[:alnum:]]+',' ','g'))=s.normalized_merchant) as "chargedAfterCancellation"
 from subscriptions s where s.workspace_id=$1 order by s.next_charge`,[ws]);
 return items.map(s=>{const yearly=new Money(s.amount).mul(s.cadence==='week'?52:s.cadence==='month'?12:1);return {...s,monthlyEstimate:yearly.div(12).toFixed(4),annualEstimate:yearly.toFixed(4),needsReview:Date.now()-Date.parse(s.lastReviewedOn)>90*86400000};});
}
async function insert(tx:TransactionSql,ws:string,b:any){
 const name=label(b.name),amount=positive(b.amount),next=isoDate(b.nextCharge);
 if(!['week','month','year'].includes(b.cadence))reject('Choose weekly, monthly, or yearly.');
 const [a]=await q(tx,'select id,currency from accounts where workspace_id=$1 and id=$2 and archived_at is null and deleted_at is null',[ws,b.accountId]);if(!a)reject('Choose an active account.');
 if(b.billId){const [bill]=await q(tx,'select id from bills where workspace_id=$1 and id=$2 and archived_at is null and currency=$3',[ws,b.billId,a.currency]);if(!bill)reject('Choose a bill in the same currency and workspace.');}
 const [s]=await q(tx,'insert into subscriptions(workspace_id,name,normalized_merchant,account_id,currency,amount,cadence,next_charge,bill_id,last_reviewed_on) values($1,$2,$3,$4,$5,$6,$7,$8,$9,current_date) returning id',[ws,name,normalize(b.merchant??name),a.id,a.currency,amount,b.cadence,next,b.billId||null]);return s;
}
export const subscriptionRoutes=new Elysia()
.get('/api/workspaces/:workspaceId/subscriptions',({request,params})=>withWorkspace(request,params.workspaceId,async tx=>({items:await list(tx,params.workspaceId),candidates:await q(tx,"select id,normalized_merchant as merchant,amount::text,currency,account_id as \"accountId\",cadence,evidence,confidence from subscription_candidates where workspace_id=$1 and state='pending' order by created_at desc limit 100",[params.workspaceId])})))
.post('/api/workspaces/:workspaceId/subscriptions',({request,params})=>withWorkspace(request,params.workspaceId,async tx=>insert(tx,params.workspaceId,await request.json())))
.patch('/api/workspaces/:workspaceId/subscriptions/:id',({request,params})=>withWorkspace(request,params.workspaceId,async tx=>{
 const b=await request.json();if(!['active','paused','cancelled'].includes(b.status))reject('Choose a valid subscription status.');
 const [s]=await q(tx,'select * from subscriptions where workspace_id=$1 and id=$2 for update',[params.workspaceId,params.id]);if(!s)throw Object.assign(new Error('Subscription not found.'),{status:404});
 const name=b.name===undefined?s.name:label(b.name),amount=b.amount===undefined?String(s.amount):positive(b.amount),next=b.nextCharge===undefined?s.next_charge:isoDate(b.nextCharge),unit=b.cadence??s.cadence;
 if(!['week','month','year'].includes(unit))reject('Choose a supported cadence.');
 await q(tx,"update subscriptions set name=$3,amount=$4,next_charge=$5,cadence=$6,status=$7,last_reviewed_on=current_date,cancelled_on=case when $7='cancelled' then coalesce(cancelled_on,current_date) else null end where workspace_id=$1 and id=$2",[params.workspaceId,params.id,name,amount,next,unit,b.status]);return {saved:true};
}))
.post('/api/workspaces/:workspaceId/subscriptions/detect',({request,params})=>withWorkspace(request,params.workspaceId,async tx=>{
 await q(tx,'select id from workspaces where id=$1 for update',[params.workspaceId]);
 const expenses=await q(tx,"select id,merchant,amount::text,currency,account_id,occurred_at::text as date from transactions where workspace_id=$1 and type='expense' and deleted_at is null and merchant is not null and occurred_at>=current_date-interval '3 years' order by occurred_at,id limit 10001",[params.workspaceId]);
 if(expenses.length>10000)reject('Detection supports up to 10,000 expenses in the last three years.');
 const groups=new Map<string,any[]>();for(const t of expenses){const merchant=normalize(t.merchant);if(!merchant)continue;const key=JSON.stringify([merchant,t.account_id,t.currency]);groups.set(key,[...(groups.get(key)??[]),{...t,normalized:merchant}]);}
 let found=0;
 for(const items of groups.values()){
  if(items.length<3)continue;const recent=items.slice(-12),avg=recent.reduce((s,t)=>s.add(t.amount),new Money(0)).div(recent.length);
  if(recent.some(t=>new Money(t.amount).sub(avg).abs().gt(avg.mul('.05'))))continue;
  const unit=cadence(recent.map(t=>t.date));if(!unit)continue;const last=recent.at(-1)!;
  const [row]=await q(tx,"insert into subscription_candidates(workspace_id,normalized_merchant,account_id,currency,cadence,amount,evidence,confidence) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8) on conflict(workspace_id,normalized_merchant,account_id,currency,cadence) do update set evidence=excluded.evidence,amount=excluded.amount,confidence=excluded.confidence where subscription_candidates.state='pending' returning id",[params.workspaceId,last.normalized,last.account_id,last.currency,unit,last.amount,JSON.stringify(recent.map(t=>({id:t.id,date:t.date,amount:t.amount}))),recent.length>=6?'high':'medium']);if(row)found++;
 }
 return {found,algorithm:'At least 3 charges; amounts within 5% of mean; weekly ±2, monthly ±5, yearly ±10 days. Version 1.'};
}))
.post('/api/workspaces/:workspaceId/subscription-candidates/:id',({request,params})=>withWorkspace(request,params.workspaceId,async tx=>{
 await q(tx,'select id from workspaces where id=$1 for update',[params.workspaceId]);
 const b=await request.json();const [c]=await q(tx,'select * from subscription_candidates where workspace_id=$1 and id=$2 for update',[params.workspaceId,params.id]);if(!c)throw Object.assign(new Error('Candidate not found.'),{status:404});
 if(b.action==='dismiss'){if(c.state==='accepted')reject('This candidate was already accepted.');await q(tx,"update subscription_candidates set state='dismissed' where workspace_id=$1 and id=$2",[params.workspaceId,params.id]);return {dismissed:true};}
 if(b.action!=='accept')reject('Choose accept or dismiss.');if(c.state==='accepted')return {id:c.subscription_id};if(c.state==='dismissed')reject('This candidate was dismissed.');
 const [existing]=await q(tx,'select id from subscriptions where workspace_id=$1 and normalized_merchant=$2 and account_id=$3 and currency=$4 and cadence=$5',[params.workspaceId,c.normalized_merchant,c.account_id,c.currency,c.cadence]);
 const evidence=await q(tx,"select id,amount::text,occurred_at::text as date from transactions where workspace_id=$1 and id=any($2::uuid[]) and account_id=$3 and currency=$4 and type='expense' and deleted_at is null",[params.workspaceId,c.evidence.map((e:any)=>e.id),c.account_id,c.currency]);
 if(evidence.length<3||c.evidence.some((e:any)=>!evidence.some(t=>t.id===e.id&&t.date===e.date&&new Money(t.amount).eq(e.amount))))reject('Supporting transactions changed. Run detection again before confirming.');
 const last=c.evidence.at(-1);const next=nextOccurrenceDate(last.date,c.cadence,1,1);
 const s=existing??await insert(tx,params.workspaceId,{name:b.name??c.normalized_merchant,merchant:c.normalized_merchant,accountId:c.account_id,amount:String(c.amount),cadence:c.cadence,nextCharge:next,billId:b.billId});
 for(const e of c.evidence)await q(tx,'insert into subscription_transaction_links(workspace_id,subscription_id,transaction_id) values($1,$2,$3) on conflict do nothing',[params.workspaceId,s.id,e.id]);
 await q(tx,"update subscription_candidates set state='accepted',subscription_id=$3 where workspace_id=$1 and id=$2",[params.workspaceId,params.id,s.id]);return s;
}));
