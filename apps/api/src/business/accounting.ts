import {createHash,randomUUID} from 'node:crypto';
import Decimal from 'decimal.js';
import type {TransactionSql} from 'postgres';
import {q,reject,recordAudit} from './shared';
import {rateFor} from '../tracking/v2/fx';

const Money=Decimal.clone({precision:50,rounding:Decimal.ROUND_HALF_UP});
type Tx=TransactionSql;
type Kind='invoice'|'vendor_bill';
type Line={account:string;class:string;currency:string;debit:string;credit:string;baseDebit:string;baseCredit:string;ledgerId?:string};
type Planned={key:string;date:string;reason:string;kind?:Kind;documentId?:string;lines:Line[]};
export const accountingHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fixed=(value:Decimal.Value)=>new Money(value).toFixed(4);
export const accountingDate=(value:unknown):string=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)reject('Choose a valid business date.');return value;
};
const classes:Record<string,string>={ar:'asset',ap:'liability',revenue:'income',cost:'expense',tax:'liability',opening:'equity',deposit:'liability',fx_gain:'income',fx_loss:'expense'};
function line(account:string,currency:string,amount:string,base:string,debit:boolean,ledgerId?:string):Line{
 return {account,class:classes[account]??account,currency,debit:debit?fixed(amount):'0.0000',credit:debit?'0.0000':fixed(amount),baseDebit:debit?fixed(base):'0.0000',baseCredit:debit?'0.0000':fixed(base),ledgerId};
}
async function policy(tx:Tx,ws:string){return (await q(tx,'select * from business_accounting_settings where workspace_id=$1',[ws]))[0];}
async function document(tx:Tx,ws:string,kind:Kind,id:string){return (await q(tx,`select * from ${kind==='invoice'?'invoices':'vendor_bills'} where workspace_id=$1 and id=$2 and issued_at is not null`,[ws,id]))[0];}
async function documents(tx:Tx,ws:string):Promise<Array<Record<string,any>&{kind:Kind}>>{
 const sales=await q(tx,'select id,issue_date,due_date,currency,total::text,tax_total::text,state,void_effective_on,version from invoices where workspace_id=$1 and issued_at is not null order by id limit 10001',[ws]);
 const purchases=await q(tx,'select id,issue_date,due_date,currency,total::text,tax_total::text,state,void_effective_on,version from vendor_bills where workspace_id=$1 and issued_at is not null order by id limit 10001',[ws]);
 if(sales.length>10000||purchases.length>10000)reject('This business needs a batched accounting conversion. No conversion has been applied.',422);
 return [...sales.map(row=>({...row,kind:'invoice' as Kind})),...purchases.map(row=>({...row,kind:'vendor_bill' as Kind}))];
}
async function outstanding(tx:Tx,ws:string,kind:Kind,id:string,on:string){
 const [d]=await q(tx,kind==='invoice'?`select i.total-coalesce((select sum(p.amount) from invoice_payments p where p.workspace_id=i.workspace_id and p.invoice_id=i.id and p.paid_on<$3::date and (p.reversal_effective_on is null or p.reversal_effective_on>=$3::date)),0)+coalesce((select sum(r.amount) from payment_refunds r join invoice_payments ip on ip.workspace_id=r.workspace_id and ip.id=r.invoice_payment_id where r.workspace_id=i.workspace_id and ip.invoice_id=i.id and r.paid_on<$3::date and (r.reversal_effective_on is null or r.reversal_effective_on>=$3::date)),0) as amount from invoices i where i.workspace_id=$1 and i.id=$2`
 :`select b.total-coalesce((select sum(p.amount) from vendor_bill_payments p where p.workspace_id=b.workspace_id and p.bill_id=b.id and p.paid_on<$3::date and (p.reversal_effective_on is null or p.reversal_effective_on>=$3::date)),0) as amount from vendor_bills b where b.workspace_id=$1 and b.id=$2`,[ws,id,on]);
 return fixed(d.amount);
}
async function recognition(tx:Tx,ws:string,baseCurrency:string,cutover:string,kind:Kind,d:any):Promise<Planned|null>{
 if(d.state==='void'&&d.void_effective_on<cutover)return null;
 const opening=d.issue_date<cutover,date=opening?cutover:d.issue_date;
 const amount=opening?await outstanding(tx,ws,kind,d.id,cutover):fixed(d.total);
 if(new Money(amount).lt(0)||new Money(amount).gt(d.total))reject('An opening document balance does not reconcile. Review receipts and corrections first.',409);
 if(new Money(amount).isZero())return null;
 const fx=await rateFor(tx,d.currency,baseCurrency,date),base=fixed(new Money(amount).mul(fx.rate));
 const debit=kind==='invoice',control=debit?'ar':'ap';
 const lines=[line(control,d.currency,amount,base,debit)];
 if(opening)lines.push(line('opening',d.currency,amount,base,!debit));
 else if(debit){
  const tax=fixed(d.tax_total),net=fixed(new Money(amount).sub(tax));
  const netBase=new Money(base).mul(net).div(amount).toDecimalPlaces(4,Decimal.ROUND_DOWN);
  lines.push(line('revenue',d.currency,net,netBase.toFixed(4),false));
  if(new Money(tax).gt(0))lines.push(line('tax',d.currency,tax,new Money(base).sub(netBase).toFixed(4),false));
 }else lines.push(line('cost',d.currency,amount,base,true)); // Purchase tax remains part of cost: no inferred tax credit.
 return {key:(opening?'opening:':'document:')+kind+':'+d.id,date,reason:opening?'Opening unpaid document against retained equity':'Recognize issued document',kind,documentId:d.id,lines};
}
export async function previewAccounting(tx:Tx,ws:string,cutover:string){
 const [w]=await q(tx,'select currency from workspaces where id=$1',[ws]);
 const docs=await documents(tx,ws);
 const sources:Record<string,any>={documents:docs};
 for(const table of ['invoice_payments','vendor_bill_payments','payment_refunds','payment_requests']){
  sources[table]=await q(tx,`select * from ${table} where workspace_id=$1 order by id limit 10001`,[ws]);
  if(sources[table].length>10000)reject('This business needs a batched conversion. No conversion has been applied.');
 }
 const [cash]=await q(tx,`select count(distinct e.id)::int as entries,coalesce(sum(l.base_debit-l.base_credit),0)::text as base_difference,
 count(*) filter(where (l.base_debit is null or l.base_credit is null) and l.currency<>$2)::int as missing_fx
 from journal_lines l join journal_entries e on e.workspace_id=l.workspace_id and e.id=l.entry_id where l.workspace_id=$1`,[ws,w.currency]);
 if(cash.missing_fx||!new Money(cash.base_difference).isZero())reject('The cash ledger has missing FX values or an unbalanced base total. Reconcile it before conversion.',409);
 // Detect even changes to an existing journal's lines; no wallet history is rewritten.
 sources.cash=await q(tx,`select e.id,e.effective_date,l.id as line_id,l.ledger_account_id,l.currency,l.debit::text,l.credit::text,l.base_debit::text,l.base_credit::text
 from journal_entries e join journal_lines l on l.workspace_id=e.workspace_id and l.entry_id=e.id where e.workspace_id=$1 order by e.id,l.id limit 100001`,[ws]);
 if(sources.cash.length>100000)reject('This cash ledger requires a batched conversion.');
 const opening:Planned[]=[];
 for(const d of docs){const plan=await recognition(tx,ws,w.currency,cutover,d.kind,d);if(plan)opening.push(plan);}
 const totals:Record<string,{receivable:string;payable:string}>={};
 for(const d of docs.filter(d=>d.issue_date<cutover&&(d.state!=='void'||d.void_effective_on>=cutover))){
  const amount=await outstanding(tx,ws,d.kind,d.id,cutover);const total=totals[d.currency]??={receivable:'0.0000',payable:'0.0000'};
  const key=d.kind==='invoice'?'receivable':'payable';total[key]=fixed(new Money(total[key]).add(amount));
 }
 const fingerprint=accountingHash({cutover,sources,opening});
 return {fingerprint,cutover,baseCurrency:w.currency,opening,totals,documentCount:docs.length,cashEntryCount:cash.entries,
  policy:'Prospective accrual; pre-cutover unpaid documents open against retained equity. Historical cash journals stay intact. Purchase tax is expensed. Refunds reopen receivables; they do not cancel sales. Foreign-currency receipts use frozen cash valuations and explicit realized FX adjustments.'};
}
async function post(tx:Tx,ws:string,actor:string,p:Planned){
 const clean=p.lines.filter(l=>new Money(l.debit).add(l.credit).add(l.baseDebit).add(l.baseCredit).gt(0));
 if(!clean.length)return;
 const [existing]=await q(tx,'select id from business_accounting_entries where workspace_id=$1 and source_key=$2',[ws,p.key]);if(existing)return;
 const config=await policy(tx,ws);
 if(!config||p.date<config.cutover_on||p.date<=config.closed_through)reject('An accounting adjustment falls in a closed period. Use an open correction date.',409);
 const id=randomUUID();
 await q(tx,'insert into business_accounting_entries(id,workspace_id,source_key,effective_date,reason,document_kind,document_id,created_by) values($1,$2,$3,$4,$5,$6,$7,$8)',[id,ws,p.key,p.date,p.reason,p.kind??null,p.documentId??null,actor]);
 for(const l of clean){
  let ledgerId=l.ledgerId;
  if(!ledgerId){const code='accrual:'+l.account+':'+l.currency;
   const [ledger]=await q(tx,'insert into ledger_accounts(workspace_id,code,name,class,currency) values($1,$2,$3,$4,$5) on conflict(workspace_id,code) do update set code=excluded.code returning id',[ws,code,{ar:'Accounts receivable',ap:'Accounts payable',revenue:'Accrual sales revenue',cost:'Accrual purchase expense',tax:'Output tax payable',opening:'Cutover retained equity',deposit:'Unapplied customer funds',fx_gain:'Realized currency gain',fx_loss:'Realized currency loss'}[l.account]??l.account,l.class,l.currency]);ledgerId=ledger.id;
  }
  await q(tx,'insert into business_accounting_lines(workspace_id,entry_id,ledger_account_id,currency,debit,credit,base_debit,base_credit) values($1,$2,$3,$4,$5,$6,$7,$8)',[ws,id,ledgerId,l.currency,l.debit,l.credit,l.baseDebit,l.baseCredit]);
 }
}
async function classifyTransaction(tx:Tx,ws:string,id:string){
 const [receipt]=await q(tx,'select invoice_id as id from invoice_payments where workspace_id=$1 and transaction_id=$2',[ws,id]);if(receipt)return {kind:'invoice' as Kind,id:receipt.id,control:'ar'};
 const [payment]=await q(tx,'select bill_id as id from vendor_bill_payments where workspace_id=$1 and transaction_id=$2',[ws,id]);if(payment)return {kind:'vendor_bill' as Kind,id:payment.id,control:'ap'};
 const [refund]=await q(tx,'select ip.invoice_id as id from payment_refunds r join invoice_payments ip on ip.workspace_id=r.workspace_id and ip.id=r.invoice_payment_id where r.workspace_id=$1 and r.transaction_id=$2',[ws,id]);if(refund)return {kind:'invoice' as Kind,id:refund.id,control:'ar'};
 const [deposit]=await q(tx,'select id from payment_requests where workspace_id=$1 and unapplied_transaction_id=$2',[ws,id]);
 const [depositRefund]=await q(tx,'select r.id from payment_refunds r join payment_requests p on p.workspace_id=r.workspace_id and p.id=r.request_id where r.workspace_id=$1 and r.transaction_id=$2 and p.unapplied_transaction_id is not null and r.invoice_payment_id is null',[ws,id]);
 if(deposit||depositRefund)return {control:'deposit'};
 return null;
}
async function transactionAdjustments(tx:Tx,ws:string,actor:string,id:string,config:any){
 const match=await classifyTransaction(tx,ws,id);if(!match)return;
 if('kind' in match){await recognizeDocument(tx,ws,actor,match.kind!,match.id!,config);}
 const entries=await q(tx,'select id,effective_date from journal_entries where workspace_id=$1 and transaction_id=$2 and effective_date>=$3 order by effective_date,created_at,id',[ws,id,config.cutover_on]);
 for(const e of entries){
  const rows=await q(tx,`select l.*,a.class from journal_lines l join ledger_accounts a on a.workspace_id=l.workspace_id and a.id=l.ledger_account_id where l.workspace_id=$1 and l.entry_id=$2 and a.class in ('income','expense')`,[ws,e.id]);
  const lines:Line[]=[];
  for(const r of rows){
   const native=new Money(r.credit).sub(r.debit),base=new Money(r.base_credit??r.credit).sub(r.base_debit??r.debit);
   if(native.isZero()&&base.isZero())continue;
   if(native.isNegative()!==base.isNegative()&&!base.isZero())reject('This historical income/cost valuation needs accounting review.',409);
   lines.push(line(r.class,r.currency,native.abs().toFixed(4),base.abs().toFixed(4),native.gte(0),r.ledger_account_id));
   lines.push(line(match.control,r.currency,native.abs().toFixed(4),base.abs().toFixed(4),native.lt(0)));
  }
  await post(tx,ws,actor,{key:'cash:'+e.id,date:e.effective_date,reason:'Reclassify cash income/cost into document control account',kind:'kind' in match?match.kind:undefined,documentId:'id' in match?match.id:undefined,lines});
 }
 if('kind' in match)await reconcileFx(tx,ws,actor,match.kind!,match.id!,config);
}
async function recognizeDocument(tx:Tx,ws:string,actor:string,kind:Kind,id:string,config:any){
 const d=await document(tx,ws,kind,id);if(!d)return;
 const [already]=await q(tx,"select id from business_accounting_entries where workspace_id=$1 and document_kind=$2 and document_id=$3 and source_key like 'document:%'",[ws,kind,id]);
 // An old fully paid document has no opening row; never recognize its old revenue again.
 if(d.issue_date>=config.cutover_on&&!already){const [w]=await q(tx,'select currency from workspaces where id=$1',[ws]);const p=await recognition(tx,ws,w.currency,config.cutover_on,kind,d);if(p)await post(tx,ws,actor,p);}
 if(d.state==='void'&&d.void_effective_on>=config.cutover_on){
  const [w]=await q(tx,'select currency from workspaces where id=$1',[ws]);
  const on=d.issue_date<config.cutover_on?config.cutover_on:d.issue_date;
  const fx=await rateFor(tx,d.currency,w.currency,on),gross=fixed(d.total),base=fixed(new Money(gross).mul(fx.rate));
  const debit=kind==='invoice',lines=[line(debit?'ar':'ap',d.currency,gross,base,!debit)];
  if(d.issue_date<config.cutover_on)lines.push(line('opening',d.currency,gross,base,debit));
  else if(debit){const net=fixed(new Money(gross).sub(d.tax_total)),netBase=new Money(base).mul(net).div(gross).toDecimalPlaces(4,Decimal.ROUND_DOWN);lines.push(line('revenue',d.currency,net,netBase.toFixed(4),true));if(new Money(d.tax_total).gt(0))lines.push(line('tax',d.currency,fixed(d.tax_total),new Money(base).sub(netBase).toFixed(4),true));}
  else lines.push(line('cost',d.currency,gross,base,false));
  await post(tx,ws,actor,{key:'void:'+kind+':'+id,date:d.void_effective_on,reason:'Cancel issued document with dated reversing recognition',kind,documentId:id,lines});
 }
}
async function reconcileFx(tx:Tx,ws:string,actor:string,kind:Kind,id:string,config:any){
 const d=await document(tx,ws,kind,id);if(!d)return;const [w]=await q(tx,'select currency from workspaces where id=$1',[ws]);if(d.currency===w.currency)return;
 const [balance]=await q(tx,`select coalesce(sum(l.debit-l.credit),0)::text as native,coalesce(sum(l.base_debit-l.base_credit),0)::text as base,max(e.effective_date) as latest
 from business_accounting_entries e join business_accounting_lines l on l.workspace_id=e.workspace_id and l.entry_id=e.id join ledger_accounts a on a.workspace_id=l.workspace_id and a.id=l.ledger_account_id
 where e.workspace_id=$1 and e.document_kind=$2 and e.document_id=$3 and a.code=$4`,[ws,kind,id,'accrual:'+(kind==='invoice'?'ar':'ap')+':'+d.currency]);
 if(!balance.latest)return;
 const fx=await rateFor(tx,d.currency,w.currency,d.issue_date<config.cutover_on?config.cutover_on:d.issue_date);
 const delta=new Money(balance.native).mul(fx.rate).toDecimalPlaces(4).sub(balance.base);if(delta.isZero())return;
 // Base-only paired lines preserve native balances and make realized FX explicit.
 const key=accountingHash({kind,id,native:balance.native,base:balance.base,date:balance.latest});
 await post(tx,ws,actor,{key:'fx:'+key,date:balance.latest,reason:'Realized FX: document valuation versus frozen cash valuation',kind,documentId:id,
 lines:[line(kind==='invoice'?'ar':'ap',d.currency,'0',delta.abs().toFixed(4),delta.gt(0)),line(delta.gt(0)?'fx_gain':'fx_loss',d.currency,'0',delta.abs().toFixed(4),delta.lt(0))]});
}
export async function drainAccounting(tx:Tx,ws:string,actor:string,limit=250){
 const config=await policy(tx,ws);if(!config)return 0;
 // Serialize one workspace's adjustment postings across workers and report requests.
 await q(tx,'select pg_advisory_xact_lock(hashtextextended($1,42))',[ws]);
 const items=await q(tx,'select kind,source_id from business_accounting_refresh where workspace_id=$1 order by created_at,kind,source_id for update skip locked limit $2',[ws,limit]);
 for(const item of items){
  if(item.kind==='transaction')await transactionAdjustments(tx,ws,actor,item.source_id,config);
  else {await recognizeDocument(tx,ws,actor,item.kind,item.source_id,config);await reconcileFx(tx,ws,actor,item.kind,item.source_id,config);}
  await q(tx,'delete from business_accounting_refresh where workspace_id=$1 and kind=$2 and source_id=$3',[ws,item.kind,item.source_id]);
 }
 const [pending]=await q(tx,'select count(*)::int as count from business_accounting_refresh where workspace_id=$1',[ws]);return pending.count;
}
export async function activateAccounting(tx:Tx,ws:string,actor:string,review:any){
 await q(tx,'select id from workspaces where id=$1 for update',[ws]);
 if(await policy(tx,ws))reject('Accrual accounting is already active. Switching back would require reviewed corrective entries.',409);
 const plan=await previewAccounting(tx,ws,review.cutover_on);
 if(plan.fingerprint!==review.fingerprint)reject('Financial records changed after preview. Create and review a fresh conversion preview.',409,'CONVERSION_CHANGED');
 await q(tx,'insert into business_accounting_settings(workspace_id,cutover_on,activated_by) values($1,$2,$3)',[ws,review.cutover_on,actor]);
 for(const opening of plan.opening)await post(tx,ws,actor,opening);
 for(const d of await documents(tx,ws))await q(tx,"insert into business_accounting_refresh(workspace_id,kind,source_id) values($1,$2,$3) on conflict do nothing",[ws,d.kind,d.id]);
 const transactions=await q(tx,"select distinct transaction_id from journal_entries where workspace_id=$1 and transaction_id is not null and effective_date>=$2",[ws,review.cutover_on]);
 for(const t of transactions)await q(tx,"insert into business_accounting_refresh(workspace_id,kind,source_id) values($1,'transaction',$2) on conflict do nothing",[ws,t.transaction_id]);
 await q(tx,"update business_accounting_reviews set state='applied',applied_at=now() where workspace_id=$1 and id=$2",[ws,review.id]);
 await recordAudit(tx,ws,actor,review.id,'accounting','cutover_applied',{cutoverOn:review.cutover_on,fingerprint:plan.fingerprint,openingEntries:plan.opening.length});
 return {active:true,cutoverOn:review.cutover_on,queued:transactions.length+plan.documentCount};
}
export async function accountingStatement(tx:Tx,ws:string,from:string,through:string,basis:string){
 const config=await policy(tx,ws);if(basis==='accrual'&&(!config||from<config.cutover_on))reject('Accrual reports start at the reviewed cutover date. Use cash basis for earlier periods.',409);
 const [w]=await q(tx,'select currency from workspaces where id=$1',[ws]);
 const adjustments=basis==='accrual'?`union all select e.effective_date,l.ledger_account_id,l.currency,l.debit,l.credit,l.base_debit,l.base_credit from business_accounting_entries e join business_accounting_lines l on l.workspace_id=e.workspace_id and l.entry_id=e.id where e.workspace_id=$1`:'';
 const rows=await q(tx,`with lines as (
 select e.effective_date,l.ledger_account_id,l.currency,l.debit,l.credit,coalesce(l.base_debit,l.debit) as base_debit,coalesce(l.base_credit,l.credit) as base_credit
 from journal_entries e join journal_lines l on l.workspace_id=e.workspace_id and l.entry_id=e.id where e.workspace_id=$1 ${adjustments})
 select a.id,a.code,a.name,a.class,a.currency,sum(l.debit-l.credit)::text as native_balance,sum(l.base_debit-l.base_credit)::text as base_balance,
 coalesce(sum(l.base_debit-l.base_credit) filter(where l.effective_date between $2::date and $3::date),0)::text as period_balance
 from lines l join ledger_accounts a on a.workspace_id=$1 and a.id=l.ledger_account_id where l.effective_date<=$3::date group by a.id,a.code,a.name,a.class,a.currency order by a.class,a.code`,[ws,from,through]);
 const sum=(accountClass:string,period=false)=>fixed(rows.filter(r=>r.class===accountClass).reduce<Decimal>((total,r)=>total.add(period?r.period_balance:r.base_balance),new Money(0)));
 const income=fixed(new Money(sum('income',true)).neg()),expense=sum('expense',true),assets=sum('asset'),liabilities=fixed(new Money(sum('liability')).neg());
 const retained=fixed(new Money(sum('income')).neg().sub(sum('expense'))),equity=fixed(new Money(sum('equity')).neg().add(retained));
 const difference=fixed(rows.reduce<Decimal>((total,r)=>total.add(r.base_balance),new Money(0)));
 return {basis,from,through,currency:w.currency,cutoverOn:config?.cutover_on??null,rows,
  profitAndLoss:{income,expense,profit:fixed(new Money(income).sub(expense))},balanceSheet:{assets,liabilities,equity,retainedEarnings:retained,difference},balanced:new Money(difference).isZero()};
}
