import type { TransactionSql } from 'postgres';
import Decimal from 'decimal.js';
import { accountingStatement } from '../business/accounting';
import { q } from '../business/shared';
import { comparisonPeriod, invalid, reportPeriod, type Definition } from './definitions';
const Money=Decimal.clone({precision:50});
const sum=(rows:Record<string,any>[],key:string)=>rows.reduce((total,row)=>total.add(row[key]??0),new Money(0)).toFixed(4);
export async function validateReportScope(tx:TransactionSql,ws:string,workspace:Record<string,any>,definition:Definition){
 if(['profit_loss','balance_sheet','tax'].includes(definition.reportType)&&workspace.kind!=='business') invalid('Choose a business workspace for this report.');
 if(definition.reportType!=='analytics'&&(definition.accountIds.length||definition.categoryIds.length||definition.tagIds.length))invalid('Account and category filters are available for transaction analytics only.');
 for(const [table,ids] of [['accounts',definition.accountIds],['categories',definition.categoryIds],['tags',definition.tagIds]] as const){
  if(ids.length){const [row]=await q(tx,`select count(*)::int as count from ${table} where workspace_id=$1 and id=any($2::uuid[])`,[ws,ids]);if(row.count!==ids.length)invalid('Some filter items are unavailable in this workspace.');}
 }
}
export async function buildV2Data(tx:TransactionSql,ws:string,workspace:Record<string,any>,definition:Definition,base:Record<string,any> & {period:ReturnType<typeof reportPeriod>}){
 await validateReportScope(tx,ws,workspace,definition);
 const period=base.period, sections:Record<string,any[]>={}, flags:string[]=[];
 let summary:Record<string,any>={...base.summary,reportVersion:'reports-v2',definition,basis:definition.basis};
 if(['profit_loss','balance_sheet'].includes(definition.reportType)){
  if(definition.basis==='accrual'){
   const [pending]=await q(tx,'select count(*)::int as count from business_accounting_refresh where workspace_id=$1',[ws]);
   if(pending.count) throw Object.assign(new Error('Accounting postings are pending. Sync accounting before reporting.'),{status:409,code:'ACCOUNTING_PENDING'});
  }
  const statement=await accountingStatement(tx,ws,period.from,period.through,definition.basis);
  if(!statement.balanced) throw Object.assign(new Error('The ledger does not balance. Review accounting before exporting.'),{status:409,code:'LEDGER_UNBALANCED'});
  sections.ledger=statement.rows.map(row=>({...row,line:row.class==='income'?'Revenue':row.class==='expense'?'Expenses':row.class==='asset'?'Assets':row.class==='liability'?'Liabilities':'Equity',displayAmount:new Money(definition.reportType==='profit_loss'?row.period_balance:row.base_balance).mul(['income','liability','equity'].includes(row.class)?-1:1).toFixed(4)})).filter((row:any)=>definition.reportType==='balance_sheet'||['income','expense'].includes(row.class));
  const [policy]=await q(tx,'select policy_version,closed_through from business_accounting_settings where workspace_id=$1',[ws]);
  summary={accountingPolicyVersion:policy?.policy_version??null,closedThrough:policy?.closed_through??null,currency:statement.currency,period:base.summary.period,reportVersion:'reports-v2',basis:statement.basis,definition,...(definition.reportType==='profit_loss'?{profitAndLoss:statement.profitAndLoss}:{balanceSheet:statement.balanceSheet}),balanced:true,cutoverOn:statement.cutoverOn,coverage:'Recorded ledger only; unrecorded assets, liabilities and unsupported inventory/depreciation are excluded.'};
 }else if(definition.reportType==='tax'){
  const [settings]=await q(tx,'select enabled,jurisdiction,version from business_tax_settings where workspace_id=$1',[ws]);
  if(!settings?.enabled)invalid('Enable and configure business tax before generating a tax evidence report.');
  const sales=await q(tx,`select i.id as "documentId",i.number,i.issue_date as date,i.currency,i.state,i.void_effective_on as "voidEffectiveOn",l.position,l.description,l.net_amount::text as net,l.tax_amount::text as tax,l.total_amount::text as total,l.tax_snapshot as policy
   from invoices i join invoice_lines l on l.workspace_id=i.workspace_id and l.invoice_id=i.id where i.workspace_id=$1 and i.issued_at is not null and (i.issue_date between $2::date and $3::date or i.void_effective_on between $2::date and $3::date) order by i.issue_date,i.id,l.position limit 5001`,[ws,period.from,period.through]);
  const purchases=await q(tx,`select b.id as "documentId",b.supplier_number as number,b.issue_date as date,b.currency,b.state,b.void_effective_on as "voidEffectiveOn",l.position,l.description,l.net_amount::text as net,l.tax_amount::text as tax,l.total_amount::text as total,l.tax_snapshot as policy
   from vendor_bills b join vendor_bill_lines l on l.workspace_id=b.workspace_id and l.bill_id=b.id where b.workspace_id=$1 and b.issued_at is not null and (b.issue_date between $2::date and $3::date or b.void_effective_on between $2::date and $3::date) order by b.issue_date,b.id,l.position limit 5001`,[ws,period.from,period.through]);
  if(sales.length>5000||purchases.length>5000)invalid('Narrow the tax evidence period to at most 5,000 lines per register.');
  const annotate=(rows:Record<string,any>[])=>rows.flatMap(row=>{
    const records:Record<string,any>[]=[];const evidence=row.policy?'Recorded tax calculation; underlying tax invoice must be reviewed':'Missing tax snapshot; review required';
    if(row.date>=period.from&&row.date<period.toExclusive)records.push({...row,included:true,recognition:'issued document',evidence});
    if(row.state==='void'&&row.voidEffectiveOn>=period.from&&row.voidEffectiveOn<period.toExclusive)records.push({...row,date:row.voidEffectiveOn,net:new Money(row.net).neg().toFixed(4),tax:new Money(row.tax).neg().toFixed(4),total:new Money(row.total).neg().toFixed(4),included:true,recognition:'dated void reversal',evidence});
    return records;
  });
  sections.tax_sales=annotate(sales);sections.tax_purchases=annotate(purchases);
  const currencies=[...new Set([...sales,...purchases].map(row=>row.currency))];
  const totals=currencies.map(currency=>{const s=sections.tax_sales!.filter(r=>r.currency===currency&&r.included),p=sections.tax_purchases!.filter(r=>r.currency===currency&&r.included);return {currency,salesNet:sum(s,'net'),salesTax:sum(s,'tax'),purchaseNet:sum(p,'net'),purchaseTaxRecorded:sum(p,'tax')};});
  summary={currency:workspace.currency,period:base.summary.period,definition,reportVersion:'reports-v2',jurisdiction:settings.jurisdiction,settingsVersion:settings.version,basis:'issued_document_evidence',totals,reviewStatus:'needs_qualified_review',limitations:['Not a tax return or Coretax filing.','Purchase tax is not an eligible input credit without evidence and review.','Voids reverse original document amounts on their recorded effective date; credit-note amendments require separate review.','Payment timing and tax amendments require separate review; no inferred cash-basis tax payable.'],ruleReference:'https://www.jdih.kemenkeu.go.id/dok/pmk-131-tahun-2024/summary'};
  const [accountingPolicy]=await q(tx,'select cutover_on,policy_version from business_accounting_settings where workspace_id=$1',[ws]);
  const [pending]=await q(tx,'select count(*)::int as count from business_accounting_refresh where workspace_id=$1',[ws]);
  if(accountingPolicy&&accountingPolicy.cutover_on<=period.from&&!pending.count&&currencies.every(currency=>currency===workspace.currency)){
    const [ledger]=await q(tx,`select coalesce(sum(l.base_credit-l.base_debit),0)::text as tax from business_accounting_entries e join business_accounting_lines l on l.workspace_id=e.workspace_id and l.entry_id=e.id join ledger_accounts a on a.workspace_id=l.workspace_id and a.id=l.ledger_account_id where e.workspace_id=$1 and e.effective_date between $2::date and $3::date and a.code like 'accrual:tax:%'`,[ws,period.from,period.through]);
    const documented=sum(sections.tax_sales!.filter(r=>r.included),'tax'),difference=new Money(ledger.tax).sub(documented).toFixed(4);
    summary.reconciliation={basis:'output tax ledger movement vs dated sales document tax',ledgerTax:ledger.tax,documentTax:documented,difference,matched:new Money(difference).isZero(),policyVersion:accountingPolicy.policy_version};if(!new Money(difference).isZero())flags.push('tax_ledger_difference_review_required');
  }else{summary.reconciliation={status:'unavailable',reason:'Requires current accrual postings, a period after cutover, and sales in the workspace currency.'};flags.push('tax_ledger_reconciliation_unavailable');}
  flags.push('tax_review_required');if([...sales,...purchases].some(row=>!row.policy))flags.push('missing_tax_evidence');
 }else if(definition.reportType==='analytics'){
  const activity=await q(tx,`select t.id,t.type,t.occurred_at as date,t.amount::text,t.currency,t.merchant,t.notes,t.account_id as "accountId",a.name as "accountName",t.category_id as "categoryId",c.name as "categoryName"
    from tracking_valuations t join accounts a on a.workspace_id=t.workspace_id and a.id=t.account_id left join categories c on c.workspace_id=t.workspace_id and c.id=t.category_id
    where t.workspace_id=$1 and t.deleted_at is null and t.currency=$2 and t.occurred_at >= $3::date and t.occurred_at < $4::date and t.type in ('income','expense')
    and (cardinality($5::uuid[])=0 or t.account_id=any($5::uuid[])) and (cardinality($6::uuid[])=0 or t.category_id=any($6::uuid[])) and (cardinality($7::uuid[])=0 or exists(select 1 from transaction_tags tt where tt.workspace_id=t.workspace_id and tt.transaction_id=t.id and tt.tag_id=any($7::uuid[])))
    order by t.occurred_at,t.id limit 50001`,[ws,definition.currency,period.from,period.toExclusive,definition.accountIds,definition.categoryIds,definition.tagIds]);
  if(activity.length>50000)throw Object.assign(new Error('Choose a shorter report period.'),{status:413,code:'REPORT_TOO_LARGE'});
  const groups=new Map<string,Record<string,any>>();for(const row of activity){const key=definition.groupBy==='month'?String(row.date).slice(0,7):definition.groupBy==='category'?(row.categoryName??'Uncategorized'):definition.groupBy==='account'?row.accountName:row.date;const group=groups.get(key)??{group:key,income:'0.0000',expense:'0.0000',count:0};group[row.type]=new Money(group[row.type]).add(row.amount).toFixed(4);group.count++;groups.set(key,group);}
  sections.grouped=[...groups.values()].map(row=>({...row,net:new Money(row.income).sub(row.expense).toFixed(4)}));
  sections.grouped.sort((a,b)=>definition.sort==='amount_desc'?new Money(b.expense).add(b.income).cmp(new Money(a.expense).add(a.income)):String(a.group).localeCompare(String(b.group)));
  sections.activity=activity;
  const income=sum(activity.filter(r=>r.type==='income'),'amount'),expense=sum(activity.filter(r=>r.type==='expense'),'amount');
  summary={currency:definition.currency,period:base.summary.period,reportVersion:'reports-v2',definition,basis:'recorded_transactions',income,expense,netActivity:new Money(income).sub(expense).toFixed(4),transactionCount:activity.length,filterPolicy:'Category filters match the transaction primary category; split allocations remain available in spending reports.'};
 }else if(definition.reportType==='cashflow'){sections.cashflow=base.cashflowRows;summary=base.summary;flags.push(...base.flags);}
 else {
  const budgets=await q(tx,`with periods as (
   select b.id,b.cadence,b.starts_on,b.category_id,b.currency,d::date as period_start,(d+case when b.cadence='weekly' then interval '7 days' else interval '1 month' end)::date as period_end
   from budgets b cross join lateral generate_series(case when b.cadence='weekly' then date_trunc('week',$2::date) else date_trunc('month',$2::date) end,$3::date-interval '1 day',case when b.cadence='weekly' then interval '7 days' else interval '1 month' end) d
   where b.workspace_id=$1 and b.currency=$4)
   select p.id,p.cadence,p.period_start as "periodFrom",p.period_end as "periodToExclusive",r.name,r.amount::text as planned,r.revision,r.legacy_baseline as "legacyBaseline",r.archived,c.name as category,
   coalesce((select sum(a.amount) from tracking_allocations a where a.workspace_id=$1 and a.deleted_at is null and a.type='expense' and a.currency=$4 and a.occurred_at>=greatest(p.period_start,$2::date) and a.occurred_at<least(p.period_end,$3::date) and a.category_id in (
    with recursive descendants(id) as (select p.category_id union all select child.id from categories child join descendants x on child.parent_id=x.id where child.workspace_id=$1) select id from descendants)),0)::text as actual
   from periods p join categories c on c.workspace_id=$1 and c.id=p.category_id left join lateral (select * from budget_revisions r where r.workspace_id=$1 and r.budget_id=p.id and r.valid_from<=p.period_start and (r.valid_to is null or r.valid_to>p.period_start) order by revision desc limit 1) r on true
   where p.period_end>p.starts_on and coalesce(r.archived,false)=false order by p.period_start,p.id limit 5001`,[ws,period.from,period.toExclusive,definition.currency]);
  if(budgets.length>5000)invalid('Choose fewer budget periods for this report.');
  sections.budget_actual=budgets.map(row=>({...row,coverage:row.planned===null?'missing historical budget terms':row.legacyBaseline?'legacy terms require review':row.periodFrom<period.from||row.periodToExclusive>period.toExclusive?'partial period: full plan, selected-date spending':'complete period',remaining:row.planned===null?null:new Money(row.planned).sub(row.actual).toFixed(4)}));
  flags.push('budget_limits_not_prorated');if(budgets.some(row=>row.planned===null||row.legacyBaseline))flags.push('historical_budget_review_required');
  summary={currency:definition.currency,period:base.summary.period,reportVersion:'reports-v2',definition,basis:'historical_budget_revision',policy:'Each budget row uses its own period-start revision. Planned amounts are full-period limits; actual spending is restricted to selected dates. Partial periods are explicitly labeled and never prorated.'};
 }
 const compare=comparisonPeriod(period,definition.comparison);
 if(compare){const prior={...definition,preset:'custom',...compare,comparison:'none'} as Definition;const previousPeriod=reportPeriod(prior,workspace.timezone);const previousBase={...base,period:previousPeriod,summary:{...base.summary,period:{from:compare.from,to:previousPeriod.through,toExclusive:compare.toExclusive,preset:'custom'}}};
  if(['analytics','profit_loss','balance_sheet','tax'].includes(definition.reportType)){const previous=await buildV2Data(tx,ws,workspace,prior,previousBase);sections.comparison=[previous.summary];}
  else invalid('Comparison is available for analytics, business statements and tax evidence.');
 }
 return {...base,summary,flags,sections};
}
