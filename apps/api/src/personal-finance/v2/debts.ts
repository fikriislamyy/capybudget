import { Elysia } from 'elysia';
import {withWorkspace,q,reject,isoDate,makeTransaction,audit} from '../../tracking/routes';
import {Money,positive} from '../../tracking/v2/money';
import {payoff} from './payoff';
import type {TransactionSql} from 'postgres';
export function nonnegative(v:unknown){return v==='0'?'0.0000':positive(v);}
export function label(v:unknown){if(typeof v!=='string'||!v.trim()||v.length>100)reject('Enter a name with up to 100 characters.');return v.trim();}
async function rows(tx:TransactionSql,ws:string){return q(tx,`select d.id,d.name,d.currency,d.apr::text,d.minimum_payment::text as minimum,d.due_day as "dueDay",d.starts_on as "startsOn",d.linked_account_id as "linkedAccountId",greatest(-coalesce(sum(l.debit-l.credit),0),0)::text as balance from debts d join accounts a on a.workspace_id=d.workspace_id and a.id=d.linked_account_id left join journal_lines l on l.workspace_id=a.workspace_id and l.ledger_account_id=a.ledger_account_id where d.workspace_id=$1 and d.archived_at is null group by d.id order by d.created_at`,[ws]);}
export const debtRoutes=new Elysia()
.get('/api/workspaces/:workspaceId/debts',({request,params})=>withWorkspace(request,params.workspaceId,async tx=>({items:await rows(tx,params.workspaceId)})))
.post('/api/workspaces/:workspaceId/debts',({request,params})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
 const b=await request.json(),name=label(b.name),apr=nonnegative(b.apr),minimum=nonnegative(b.minimum),starts=isoDate(b.startsOn);
 if(new Money(apr).gt(1000)||!Number.isInteger(b.dueDay)||b.dueDay<1||b.dueDay>31)reject('Use an APR from 0 to 1000 and a due day from 1 to 31.');
 const [a]=await q(tx,"select a.id,a.currency from accounts a join ledger_accounts l on l.workspace_id=a.workspace_id and l.id=a.ledger_account_id where a.workspace_id=$1 and a.id=$2 and l.class='liability' and a.archived_at is null and a.deleted_at is null for update of a",[params.workspaceId,b.linkedAccountId]);
 if(!a)reject('Choose an existing liability (credit card) account. Add a negative opening balance on Accounts for a new loan.');
 const [d]=await q(tx,'insert into debts(workspace_id,name,linked_account_id,currency,apr,minimum_payment,due_day,starts_on) values($1,$2,$3,$4,$5,$6,$7,$8) returning id',[params.workspaceId,name,a.id,a.currency,apr,minimum,b.dueDay,starts]);
 await audit(tx,params.workspaceId,actor.id,'debt',d.id,'create',null,{name});return {debt:d};
}))
.patch('/api/workspaces/:workspaceId/debts/:id',({request,params})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
 const b=await request.json(),name=label(b.name),apr=nonnegative(b.apr),minimum=nonnegative(b.minimum);
 if(new Money(apr).gt(1000)||!Number.isInteger(b.dueDay)||b.dueDay<1||b.dueDay>31)reject('Use a valid APR and due day.');
 const [d]=await q(tx,'update debts set name=$3,apr=$4,minimum_payment=$5,due_day=$6 where workspace_id=$1 and id=$2 and archived_at is null returning id',[params.workspaceId,params.id,name,apr,minimum,b.dueDay]);
 if(!d)throw Object.assign(new Error('Debt not found.'),{status:404});await audit(tx,params.workspaceId,actor.id,'debt',d.id,'update',null,{name,apr,minimum});return d;
}))
.delete('/api/workspaces/:workspaceId/debts/:id',({request,params})=>withWorkspace(request,params.workspaceId,async tx=>{
 const [d]=await q(tx,'update debts set archived_at=now() where workspace_id=$1 and id=$2 and archived_at is null returning id',[params.workspaceId,params.id]);return d??Response.json({message:'Debt not found.'},{status:404});
}))
.get('/api/workspaces/:workspaceId/debts/:id/payments',({request,params})=>withWorkspace(request,params.workspaceId,async tx=>({items:await q(tx,'select id,principal::text,interest::text,fees::text,occurred_on as "occurredOn",principal_transaction_id as "principalTransactionId",expense_transaction_id as "expenseTransactionId" from debt_payments where workspace_id=$1 and debt_id=$2 order by occurred_on desc,created_at desc limit 200',[params.workspaceId,params.id])})))
.post('/api/workspaces/:workspaceId/debts/:id/payments',({request,params})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
 const b=await request.json();if(b.confirm!==true)reject('Confirm before recording a payment.');
 const principal=positive(b.principal),interest=nonnegative(b.interest??'0'),fees=nonnegative(b.fees??'0'),date=isoDate(b.date);
 if(typeof b.idempotencyKey!=='string'||b.idempotencyKey.length<8||b.idempotencyKey.length>100)reject('A request key is required.');
 const [d]=await q(tx,'select * from debts where workspace_id=$1 and id=$2 and archived_at is null for update',[params.workspaceId,params.id]);if(!d)throw Object.assign(new Error('Debt not found.'),{status:404});
 const [prior]=await q(tx,'select * from debt_payments where workspace_id=$1 and debt_id=$2 and idempotency_key=$3',[params.workspaceId,params.id,b.idempotencyKey]);
 if(prior){const [source]=await q(tx,'select account_id from transactions where workspace_id=$1 and id=$2',[params.workspaceId,prior.principal_transaction_id]);if(!new Money(prior.principal).eq(principal)||!new Money(prior.interest).eq(interest)||!new Money(prior.fees).eq(fees)||prior.occurred_on!==date||source.account_id!==b.accountId)reject('This request key belongs to another payment.');return {payment:prior};}
 const accounts=await q(tx,'select a.id,a.currency,l.class from accounts a join ledger_accounts l on l.id=a.ledger_account_id and l.workspace_id=a.workspace_id where a.workspace_id=$1 and a.id in($2,$3) and a.archived_at is null and a.deleted_at is null order by a.id for update of a',[params.workspaceId,b.accountId,d.linked_account_id]);
 const source=accounts.find(a=>a.id===b.accountId);if(!source||accounts.length!==2||source.currency!==d.currency||source.class!=='asset')reject('Choose a different asset account in the debt currency.');
 const [balance]=await q(tx,'select coalesce(sum(l.credit-l.debit),0)::text as amount from accounts a join journal_lines l on l.workspace_id=a.workspace_id and l.ledger_account_id=a.ledger_account_id where a.workspace_id=$1 and a.id=$2',[params.workspaceId,d.linked_account_id]);
 if(new Money(principal).gt(balance.amount))reject('Principal payment exceeds the remaining liability.');
 const transfer=await makeTransaction(tx,params.workspaceId,actor,{type:'transfer',accountId:b.accountId,destinationAccountId:d.linked_account_id,amount:principal,date,notes:`Principal: ${d.name}`});
 const cost=new Money(interest).add(fees);let expenseId:string|null=null;
 if(cost.gt(0)){const expense=await makeTransaction(tx,params.workspaceId,actor,{type:'expense',accountId:b.accountId,categoryId:b.categoryId,amount:cost.toFixed(4),date,notes:`Interest ${interest}; fees ${fees}: ${d.name}`});expenseId=expense.id;}
 const [payment]=await q(tx,'insert into debt_payments(workspace_id,debt_id,principal,interest,fees,occurred_on,principal_transaction_id,expense_transaction_id,idempotency_key,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id',[params.workspaceId,d.id,principal,interest,fees,date,transfer.id,expenseId,b.idempotencyKey,actor.id]);return {payment};
}))
.post('/api/workspaces/:workspaceId/debt-comparison',({request,params})=>withWorkspace(request,params.workspaceId,async tx=>{
 const b=await request.json(),extra=nonnegative(b.extra??'0'),start=isoDate(b.startsOn),debts=await rows(tx,params.workspaceId);
 const [w]=await q(tx,'select currency from workspaces where id=$1 for update',[params.workspaceId]);
 if(debts.length>100)reject('Compare at most 100 debts.');if(debts.some(d=>d.currency!==w.currency))reject('Payoff comparison requires debts in the workspace currency; compare other currencies separately.');
 const inputs=debts.map(d=>({id:d.id,name:d.name,balance:d.balance,apr:d.apr,minimum:d.minimum,dueDay:d.dueDay}));
 const comparisons=['snowball','avalanche'].map(strategy=>({strategy,...payoff(inputs,extra,strategy as 'snowball'|'avalanche',start,w.currency)}));
 for(const result of comparisons)await q(tx,'insert into debt_payoff_plans(workspace_id,strategy,starts_on,extra,currency,assumptions,result) values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',[params.workspaceId,result.strategy,start,extra,w.currency,JSON.stringify({debts:inputs,convention:result.convention}),JSON.stringify(result)]);
 return {currency:w.currency,items:comparisons};
}));
