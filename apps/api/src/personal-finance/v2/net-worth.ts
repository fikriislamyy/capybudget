import {Elysia} from 'elysia';
import {withWorkspace,q,reject,isoDate} from '../../tracking/routes';
import {Money,currencyScale} from '../../tracking/v2/money';
import {rateFor} from '../../tracking/v2/fx';
import {nonnegative,label} from './debts';
export const netWorthRoutes=new Elysia()
.get('/api/workspaces/:workspaceId/net-worth',({request,params})=>withWorkspace(request,params.workspaceId,async tx=>({
 items:await q(tx,'select id,name,kind,currency,ownership_percent::text as ownership from net_worth_items where workspace_id=$1 and archived_at is null order by created_at',[params.workspaceId]),
 snapshots:await q(tx,'select id,as_of as date,currency,assets::text,liabilities::text,net_worth::text as "netWorth",status,revision from net_worth_snapshots where workspace_id=$1 order by as_of desc,revision desc limit 100',[params.workspaceId])
})))
.post('/api/workspaces/:workspaceId/net-worth/items',({request,params})=>withWorkspace(request,params.workspaceId,async tx=>{
 const b=await request.json(),name=label(b.name),ownership=nonnegative(b.ownership??'100');
 if(!['asset','liability'].includes(b.kind)||!new Money(ownership).gt(0)||new Money(ownership).gt(100)||typeof b.currency!=='string'||!/^[A-Z]{3}$/.test(b.currency))reject('Choose an asset/liability, currency, and ownership from 0–100%.');
 const [item]=await q(tx,'insert into net_worth_items(workspace_id,name,kind,currency,ownership_percent) values($1,$2,$3,$4,$5) returning id',[params.workspaceId,name,b.kind,b.currency,ownership]);
 await q(tx,'insert into net_worth_valuations(workspace_id,item_id,as_of,amount,source) values($1,$2,$3,$4,$5)',[params.workspaceId,item.id,isoDate(b.date),nonnegative(b.amount),label(b.source??'Manual valuation')]);return item;
}))
.post('/api/workspaces/:workspaceId/net-worth/items/:id/valuations',({request,params})=>withWorkspace(request,params.workspaceId,async tx=>{
 const b=await request.json();const [item]=await q(tx,'select id from net_worth_items where workspace_id=$1 and id=$2 and archived_at is null',[params.workspaceId,params.id]);if(!item)throw Object.assign(new Error('Item not found.'),{status:404});
 await q(tx,'insert into net_worth_valuations(workspace_id,item_id,as_of,amount,source) values($1,$2,$3,$4,$5)',[params.workspaceId,params.id,isoDate(b.date),nonnegative(b.amount),label(b.source??'Manual valuation')]);return {saved:true};
}))
.delete('/api/workspaces/:workspaceId/net-worth/items/:id',({request,params})=>withWorkspace(request,params.workspaceId,async tx=>{
 const [row]=await q(tx,'update net_worth_items set archived_at=now() where workspace_id=$1 and id=$2 and archived_at is null returning id',[params.workspaceId,params.id]);return row??Response.json({message:'Item not found.'},{status:404});
}))
.get('/api/workspaces/:workspaceId/net-worth/snapshots/:id',({request,params})=>withWorkspace(request,params.workspaceId,async tx=>({lines:await q(tx,'select name,kind,currency,source_amount::text as amount,source_date as "sourceDate",rate::text,rate_date as "rateDate",base_amount::text as "baseAmount",status from net_worth_snapshot_lines where workspace_id=$1 and snapshot_id=$2 order by kind,name',[params.workspaceId,params.id])})))
.post('/api/workspaces/:workspaceId/net-worth/snapshots',({request,params})=>withWorkspace(request,params.workspaceId,async tx=>{
 const b=await request.json(),date=isoDate(b.date);if(date>new Date().toISOString().slice(0,10))reject('Choose today or a historical date.');
 const [w]=await q(tx,'select currency from workspaces where id=$1 for update',[params.workspaceId]);
 // Linked debts are represented exactly once by their liability account. Debt metadata never adds another line.
 const accounts=await q(tx,`select a.id,a.name,a.currency,l.class as kind,$2::date::text as date,coalesce((select sum(jl.debit-jl.credit) from journal_lines jl join journal_entries j on j.id=jl.entry_id and j.workspace_id=jl.workspace_id where jl.workspace_id=a.workspace_id and jl.ledger_account_id=a.ledger_account_id and j.effective_date<=$2),0)::text as amount from accounts a join ledger_accounts l on l.workspace_id=a.workspace_id and l.id=a.ledger_account_id where a.workspace_id=$1 and a.deleted_at is null and a.opening_date<=$2 and l.class in('asset','liability')`,[params.workspaceId,date]);
 const manual=await q(tx,`select i.id,i.name,i.currency,i.kind,i.ownership_percent::text as ownership,v.amount::text,v.as_of::text as date from net_worth_items i left join lateral(select amount,as_of from net_worth_valuations where workspace_id=i.workspace_id and item_id=i.id and as_of<=$2 order by as_of desc,recorded_at desc,id desc limit 1)v on true where i.workspace_id=$1 and i.archived_at is null`,[params.workspaceId,date]);
 if(accounts.length+manual.length>1000)reject('A snapshot supports up to 1,000 items.');
 const lines:any[]=[];let assets=new Money(0),liabilities=new Money(0),complete=true;
 for(const entry of [...accounts.map((a:any)=>({...a,type:'account',ownership:'100',amount:a.kind==='liability'?new Money(a.amount).neg().toFixed(4):a.amount})),...manual.map((a:any)=>({...a,type:'manual'}))]){
  let status='ready',rate:string|null=null,base:string|null=null;
  const value=entry.amount===null?null:new Money(entry.amount).mul(entry.ownership).div(100);
  if(value===null)status='missing-valuation';else if(entry.type==='manual'&&(Date.parse(date)-Date.parse(entry.date))/86400000>90)status='stale-valuation';
  if(value!==null){try{const fx=await rateFor(tx,entry.currency,w.currency,date);rate=fx.rate;base=value.mul(rate).toFixed(currencyScale(w.currency));}catch(e){const err=e as {status?:number};if(err.status&&err.status>=400)status='missing-rate';else throw e;}}
  if(status!=='ready')complete=false;else if(entry.kind==='asset')assets=assets.add(base!);else liabilities=liabilities.add(base!);
  lines.push({...entry,status,sourceAmount:value?.toFixed(4)??null,rate,base});
 }
 const [revision]=await q(tx,'select coalesce(max(revision),0)+1 as value from net_worth_snapshots where workspace_id=$1 and as_of=$2',[params.workspaceId,date]);
 const [s]=await q(tx,'insert into net_worth_snapshots(workspace_id,as_of,currency,assets,liabilities,net_worth,status,revision) values($1,$2,$3,$4,$5,$6,$7,$8) returning id',[params.workspaceId,date,w.currency,complete?assets.toFixed(4):null,complete?liabilities.toFixed(4):null,complete?assets.sub(liabilities).toFixed(4):null,complete?'complete':'incomplete',revision.value]);
 for(const l of lines)await q(tx,'insert into net_worth_snapshot_lines(workspace_id,snapshot_id,source_id,source_type,name,kind,currency,source_amount,source_date,rate,rate_date,base_amount,status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[params.workspaceId,s.id,l.id,l.type,l.name,l.kind,l.currency,l.sourceAmount,l.date,l.rate,l.rate?date:null,l.base,l.status]);
 return {id:s.id,status:complete?'complete':'incomplete',revision:revision.value};
}));
