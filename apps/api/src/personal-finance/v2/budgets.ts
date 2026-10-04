import { Elysia } from 'elysia';
import type { TransactionSql } from 'postgres';
import { withWorkspace, q, reject, isoDate, audit } from '../../tracking/routes';
import { Money, positive, currencyScale } from '../../tracking/v2/money';

function nonnegative(value:unknown){if(value==='0')return '0';return positive(value);}
function label(value:unknown){if(typeof value!=='string'||!value.trim()||value.length>100)reject('Enter a name of up to 100 characters.');return value.trim();}
async function funding(tx:TransactionSql,plan:any){
 if(plan.funding_basis==='planned')return new Money(plan.planned_funding);
 const [row]=await q(tx,`select coalesce(sum(amount),0)::text as amount from tracking_valuations where workspace_id=$1 and currency=$2 and type='income' and deleted_at is null and occurred_at >= $3 and occurred_at < $4`,[plan.workspace_id,plan.currency,plan.starts_on,plan.ends_on]);
 return new Money(row.amount);
}
async function detail(tx:TransactionSql,workspace:string,id:string){
 const [plan]=await q(tx,'select * from budget_plans where workspace_id=$1 and id=$2',[workspace,id]);
 if(!plan)throw Object.assign(new Error('Budget plan not found.'),{status:404});
 const buckets=await q(tx,`select b.id,b.name,b.allocation::text,b.target_percent as "targetPercent",coalesce(array_agg(c.category_id) filter(where c.category_id is not null),'{}') as "categoryIds",
 coalesce((select sum(t.amount) from tracking_allocations t where t.workspace_id=b.workspace_id and t.type='expense' and t.deleted_at is null and t.currency=$3 and t.occurred_at >= $4 and t.occurred_at < $5 and t.category_id in(select category_id from budget_bucket_categories where bucket_id=b.id)),0)::text as spent
 from budget_buckets b left join budget_bucket_categories c on c.bucket_id=b.id where b.workspace_id=$1 and b.plan_id=$2 group by b.id order by b.sort_order`,[workspace,id,plan.currency,plan.starts_on,plan.ends_on]);
 const available=await funding(tx,plan),assigned=buckets.reduce((s,b)=>s.add(b.allocation),new Money(0));
 return {id:plan.id,name:plan.name,method:plan.method,startsOn:plan.starts_on,endsOn:plan.ends_on,currency:plan.currency,fundingBasis:plan.funding_basis,plannedFunding:String(plan.planned_funding),funding:available.toFixed(4),unassigned:available.sub(assigned).toFixed(4),status:plan.status,revision:plan.revision,buckets:buckets.map((b:any)=>({...b,remaining:new Money(b.allocation).sub(b.spent).toFixed(4)}))};
}
function percentages(total:InstanceType<typeof Money>,currency:string){
 const scale=currencyScale(currency),a=total.mul('.5').toDecimalPlaces(scale,Money.ROUND_DOWN),b=total.mul('.3').toDecimalPlaces(scale,Money.ROUND_DOWN);
 return [a,b,total.sub(a).sub(b)]; // Deterministic residual goes to savings/debt.
}
export const budgetMethodRoutes=new Elysia()
.get('/api/workspaces/:workspaceId/budget-plans',({request,params})=>withWorkspace(request,params.workspaceId,async tx=>{
 const plans=await q(tx,'select id from budget_plans where workspace_id=$1 order by starts_on desc,created_at desc limit 100',[params.workspaceId]);
 return {items:await Promise.all(plans.map(p=>detail(tx,params.workspaceId,p.id)))};
}))
.post('/api/workspaces/:workspaceId/budget-plans',({request,params})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
 const b=await request.json();const name=label(b.name),start=isoDate(b.startsOn),end=isoDate(b.endsOn);
 if(end<=start||Math.round((Date.parse(end)-Date.parse(start))/86400000)>366)reject('Choose a budget period of 1–366 days; the end date is exclusive.');
 if(!['50-30-20','zero-based','envelope'].includes(b.method)||!['planned','received'].includes(b.fundingBasis))reject('Choose a budget method and funding basis.');
 const planned=nonnegative(b.plannedFunding??'0');
 const [w]=await q(tx,'select currency from workspaces where id=$1 for update',[params.workspaceId]);
 const [p]=await q(tx,'insert into budget_plans(workspace_id,name,method,starts_on,ends_on,currency,funding_basis,planned_funding,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *',[params.workspaceId,name,b.method,start,end,w.currency,b.fundingBasis,planned,actor.id]);
 const total=await funding(tx,p);
 const defs=b.method==='50-30-20'?['Needs','Wants','Savings and debt']:b.buckets;
 if(!Array.isArray(defs)||!defs.length||defs.length>30)reject('Add between 1 and 30 named buckets.');
 const amounts=percentages(total,w.currency);
 for(let i=0;i<defs.length;i++)await q(tx,'insert into budget_buckets(workspace_id,plan_id,name,allocation,target_percent,sort_order) values($1,$2,$3,$4,$5,$6)',[params.workspaceId,p.id,label(defs[i]),b.method==='50-30-20'?amounts[i]!.toFixed(4):'0',b.method==='50-30-20'?[50,30,20][i]:null,i]);
 await audit(tx,params.workspaceId,actor.id,'budget-plan',p.id,'create',null,{method:b.method});
 return detail(tx,params.workspaceId,p.id);
}))
.patch('/api/workspaces/:workspaceId/budget-plans/:id',({request,params})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
 const b=await request.json();const [p]=await q(tx,'select * from budget_plans where workspace_id=$1 and id=$2 for update',[params.workspaceId,params.id]);
 if(!p)throw Object.assign(new Error('Budget plan not found.'),{status:404});
 if(b.revision!==p.revision)throw Object.assign(new Error('This plan changed. Refresh before saving.'),{status:409});
 if(!Array.isArray(b.buckets)||b.buckets.length>30)reject('Enter valid bucket allocations.');
 const rows=await q(tx,'select * from budget_buckets where workspace_id=$1 and plan_id=$2 order by sort_order',[params.workspaceId,params.id]);
 if(rows.length!==b.buckets.length||new Set(b.buckets.map((x:any)=>x.id)).size!==rows.length)reject('Include each bucket exactly once.');
 const available=await funding(tx,p),fixed=percentages(available,p.currency);let sum=new Money(0);
 const categories=new Set<string>();
 for(const row of rows){
  const input=b.buckets.find((x:any)=>x.id===row.id);if(!input)reject('Unknown budget bucket.');
  const amount=p.method==='50-30-20'?fixed[row.sort_order]!.toFixed(4):nonnegative(input.allocation);sum=sum.add(amount);
  if(!Array.isArray(input.categoryIds)||input.categoryIds.length>100)reject('Choose valid categories.');
  await q(tx,'delete from budget_bucket_categories where workspace_id=$1 and bucket_id=$2',[params.workspaceId,row.id]);
  for(const id of input.categoryIds){
   if(categories.has(id))reject('Each category belongs to one bucket.');categories.add(id);
   const [cat]=await q(tx,"select id from categories where workspace_id=$1 and id=$2 and type='expense' and archived_at is null",[params.workspaceId,id]);
   if(!cat)reject('Choose an active expense category.');
   await q(tx,'insert into budget_bucket_categories(workspace_id,plan_id,bucket_id,category_id) values($1,$2,$3,$4)',[params.workspaceId,params.id,row.id,id]);
  }
  await q(tx,'update budget_buckets set name=$3,allocation=$4 where workspace_id=$1 and id=$2',[params.workspaceId,row.id,label(input.name),amount]);
 }
 if(sum.gt(available))reject('Allocations cannot exceed funding.');
 if(b.finalize===true&&!sum.eq(available))reject('Assign all funding before finalizing.');
 await q(tx,"update budget_plans set status=$3,revision=revision+1 where workspace_id=$1 and id=$2",[params.workspaceId,params.id,b.finalize===true?'finalized':'draft']);
 await audit(tx,params.workspaceId,actor.id,'budget-plan',params.id,'update',null,{finalized:b.finalize===true});
 return detail(tx,params.workspaceId,params.id);
}))
.post('/api/workspaces/:workspaceId/budget-plans/:id/movements',({request,params})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
 const b=await request.json(),amount=positive(b.amount);
 if(typeof b.idempotencyKey!=='string'||b.idempotencyKey.length<8||b.idempotencyKey.length>100)reject('A valid request key is required.');
 const [p]=await q(tx,'select * from budget_plans where workspace_id=$1 and id=$2 for update',[params.workspaceId,params.id]);
 if(!p||p.method!=='envelope')reject('Choose an envelope plan.');
 const [previous]=await q(tx,'select * from envelope_movements where workspace_id=$1 and plan_id=$2 and idempotency_key=$3',[params.workspaceId,params.id,b.idempotencyKey]);
 if(previous){if(previous.from_bucket_id!==b.fromBucketId||previous.to_bucket_id!==b.toBucketId||!new Money(previous.amount).eq(amount))reject('This request key was used for a different movement.');return detail(tx,params.workspaceId,params.id);}
 const rows=await q(tx,'select * from budget_buckets where workspace_id=$1 and plan_id=$2 and id in($3,$4) for update',[params.workspaceId,params.id,b.fromBucketId,b.toBucketId]);
 const from=rows.find(r=>r.id===b.fromBucketId),to=rows.find(r=>r.id===b.toBucketId);
 if(rows.length!==2||!from||!to||new Money(from.allocation).lt(amount))reject('Choose two different envelopes and an amount within the source allocation.');
 const current=await detail(tx,params.workspaceId,params.id);if(new Money(current.buckets.find(r=>r.id===from.id)!.remaining).lt(amount))reject('Only unspent allocation can move between envelopes.');
 await q(tx,'update budget_buckets set allocation=allocation+case when id=$3 then -$5::numeric else $5::numeric end where workspace_id=$1 and plan_id=$2 and id in($3,$4)',[params.workspaceId,params.id,from.id,to.id,amount]);
 await q(tx,'insert into envelope_movements(workspace_id,plan_id,from_bucket_id,to_bucket_id,amount,reason,idempotency_key,created_by) values($1,$2,$3,$4,$5,$6,$7,$8)',[params.workspaceId,params.id,from.id,to.id,amount,label(b.reason??'Allocation transfer'),b.idempotencyKey,actor.id]);
 await q(tx,'update budget_plans set revision=revision+1 where workspace_id=$1 and id=$2',[params.workspaceId,params.id]);
 await audit(tx,params.workspaceId,actor.id,'budget-plan',params.id,'move-allocation',null,{from:from.id,to:to.id,amount});
 return detail(tx,params.workspaceId,params.id);
}));
