export {detectFindings} from './detection';
import { ceilDivide, fromUnits, toUnits } from '../money';
import { projectCashflow } from '../forecast';
import type { ForecastAccount, ForecastEvent } from '../types';
import {currencyScale} from '../../business/currency';

export const ANALYTICS_VERSION = 'assistant-v2.2';
export function validDate(value: unknown): boolean {
 return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
}
export function shiftDate(date:string, days:number) { if(!validDate(date)||!Number.isInteger(days)||Math.abs(days)>366)throw new RangeError('Invalid date offset');return new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10); }
export type ScenarioOverride = {kind:'purchase';accountId:string;date:string;amount:string} | {kind:'delay_invoice';eventId:string;days:number} | {kind:'expense_amount'|'recurring_amount';eventId:string;amount:string};
export type ScenarioSnapshot={asOfDate:string;horizonDays:number;accounts:ForecastAccount[];events:ForecastEvent[];qualityFlags:string[];workspaceProtectedAmount:string};
export function scenarioForecast(snapshot:ScenarioSnapshot, overrides:ScenarioOverride[]) {
 if(!Array.isArray(overrides)||overrides.length<1||overrides.length>20)throw new RangeError('Choose between one and twenty changes');
 const events=structuredClone(snapshot.events),changedEvents:Array<{before:ForecastEvent|null;after:ForecastEvent}>=[],seen=new Set<string>();
 for(const override of overrides){
  if(override.kind==='purchase'){
   if(!snapshot.accounts.some(a=>a.id===override.accountId)||!validDate(override.date)||override.date<snapshot.asOfDate||override.date>shiftDate(snapshot.asOfDate,snapshot.horizonDays)||toUnits(override.amount)<=0n)throw new RangeError('Choose a permitted account, date and positive amount');
   const after:ForecastEvent={id:'scenario-purchase:'+changedEvents.length,accountId:override.accountId,date:override.date,amount:fromUnits(-toUnits(override.amount)),kind:'transaction',description:'Scenario purchase'};events.push(after);changedEvents.push({before:null,after});
  }else{
   if(seen.has(override.eventId))throw new RangeError('Change each event once');seen.add(override.eventId);
   const event=events.find(e=>e.id===override.eventId);if(!event)throw new RangeError('Choose an event in the base forecast');const before={...event};
   if(override.kind==='delay_invoice'){if(event.kind!=='invoice'||!Number.isInteger(override.days)||override.days<1||override.days>90)throw new RangeError('Choose an invoice delay from 1 to 90 days');event.date=shiftDate(event.date,override.days);}
   else {if(toUnits(event.amount,true)>=0n||override.kind==='recurring_amount'&&event.kind!=='recurring'||!['bill','recurring','transaction'].includes(event.kind)||toUnits(override.amount)<=0n)throw new RangeError('Choose an expense and a positive amount');event.amount=fromUnits(-toUnits(override.amount));}
   changedEvents.push({before,after:{...event}});
  }
 }
 const base={today:snapshot.asOfDate,horizonDays:snapshot.horizonDays,accounts:snapshot.accounts,startingQualityFlags:snapshot.qualityFlags,workspaceProtectedAmount:snapshot.workspaceProtectedAmount};
 return {before:projectCashflow({...base,events:snapshot.events}),after:projectCashflow({...base,events}),changedEvents,events};
}
export type SpendingRow={id:string;date:string;amount:string;currency:string;type:string;accountId:string;accountName?:string;categoryId:string|null;categoryName:string;merchant:string;recurringRuleId?:string|boolean|null;invoiceLinked?:boolean;billLinked?:boolean;subscriptionLinked?:boolean;oneOff?:boolean;deletedAt?:string|null};
export function comparisonPeriods(today:string){
 if(!validDate(today))throw new RangeError('Invalid report date');const day=Number(today.slice(8)),first=today.slice(0,8)+'01';const previousEnd=shiftDate(first,-1),previousStart=previousEnd.slice(0,8)+'01';
 // Equal elapsed days; cap both periods to the shorter month, then disclose coverage.
 const elapsedDays=Math.min(day,Number(previousEnd.slice(8)));
 return {currentStart:first,currentEnd:shiftDate(first,elapsedDays-1),previousStart,previousEnd:shiftDate(previousStart,elapsedDays-1),elapsedDays,mode:'equal_elapsed_month_to_date'};
}
export function spendingComparison(rows:SpendingRow[],today:string,currency:string,dimension:'category'|'merchant'|'account'='category'){
 const period=comparisonPeriods(today),groups=new Map<string,{groupKey:string;categoryId:string|null;categoryName:string;current:bigint;previous:bigint;evidence:string[]}>();
 for(const row of rows){if(row.currency!==currency||row.type!=='expense')continue;const current=row.date>=period.currentStart&&row.date<=period.currentEnd,previous=row.date>=period.previousStart&&row.date<=period.previousEnd;if(!current&&!previous)continue;
  const key=comparisonGroupKey(row,dimension),name=dimension==='merchant'?row.merchant||'Unknown merchant':dimension==='account'?row.accountName??'Account':row.categoryName,group=groups.get(key)??{groupKey:key,categoryId:dimension==='category'?row.categoryId:null,categoryName:name,current:0n,previous:0n,evidence:[]};group[current?'current':'previous']+=toUnits(row.amount);if(group.evidence.length<50)group.evidence.push(row.id);groups.set(key,group);
 }
 const items=[...groups.values()].map(g=>({groupKey:g.groupKey,categoryId:g.categoryId,categoryName:g.categoryName,current:fromUnits(g.current),previous:fromUnits(g.previous),change:fromUnits(g.current-g.previous),percentageChange:g.previous===0n||(g.current-g.previous)*100n*10000n/g.previous>10n**19n-1n?null:fromUnits((g.current-g.previous)*100n*10000n/g.previous),evidence:g.evidence}));
 return {period,currency,dimension,items,notes:['Only active expense records in permitted accounts are included. Transfers and reversed/deleted records are excluded.','Refunds recorded as income are shown separately, not netted against category spending.','Category changes affect historical grouping. One-off expenses are included in actual spending.'],version:ANALYTICS_VERSION};
}
export function comparisonGroupKey(row:SpendingRow,dimension:'category'|'merchant'|'account'){
 return dimension==='merchant'?row.merchant.trim().toLocaleLowerCase()||'unknown_merchant':dimension==='account'?row.accountId:row.categoryId??'uncategorized';
}
export function businessBurn(input:{inflows:string;outflows:string;availableCash:string;protectedCash:string;days:number;complete:boolean;currency:string}){
 if(!Number.isInteger(input.days)||input.days<28||input.days>366)throw new RangeError('Invalid operating window');
 const out=toUnits(input.outflows),income=toUnits(input.inflows),gross=ceilDivide(out*30n,BigInt(input.days)),monthlyIncome=income*30n/BigInt(input.days),net=gross-monthlyIncome,cash=toUnits(input.availableCash,true)-toUnits(input.protectedCash);
 return {currency:input.currency,windowDays:input.days,grossMonthlyBurn:fromUnits(gross),netMonthlyBurn:fromUnits(net),unrestrictedCash:fromUnits(cash),runwayMonths:!input.complete||net<=0n?null:fromUnits((cash>0n?cash:0n)*10000n/net),status:!input.complete?'incomplete_scope':net<=0n?'not_burning_cash':cash<=0n?'no_available_cash':'burning_cash',assumptions:['A month is 30 days for this rolling-window estimate.','Transfers and opening entries are excluded. User-marked one-offs are excluded from operating averages.','Runway is an estimate based on historical cash, not a guarantee of future collections.']};
}
export function goalCoaching(target:string,allocated:string,deadline:string|null,today:string,safeToSpend:string|null,currency='USD'){
 const remaining=toUnits(target)-toUnits(allocated),amount=remaining>0n?remaining:0n;if(amount===0n)return {status:'achieved',remaining:fromUnits(0n),weeklyTarget:null,affordable:null};
 if(!deadline)return {status:'no_deadline',remaining:fromUnits(amount),weeklyTarget:null,affordable:null};if(!validDate(deadline)||!validDate(today))throw new RangeError('Invalid goal date');if(deadline<today)return {status:'overdue',remaining:fromUnits(amount),weeklyTarget:null,affordable:null};
 const days=Math.floor((Date.parse(deadline)-Date.parse(today))/86400000),periods=Math.max(1,Math.ceil(days/7)),minor=10n**BigInt(4-currencyScale(currency)),weekly=ceilDivide(amount,BigInt(periods)*minor)*minor;
 return {status:'active',remaining:fromUnits(amount),weeklyTarget:fromUnits(weekly),weeksRemaining:periods,affordable:safeToSpend===null?null:weekly<=toUnits(safeToSpend)};
}
export function customerMetrics(invoices:Array<{id:string;dueDate:string;total:string;paid:string;settledOn:string|null}>,today:string){
 const settled=invoices.filter(i=>toUnits(i.paid)>=toUnits(i.total)&&i.settledOn),lateDays=settled.map(i=>Math.max(0,Math.floor((Date.parse(i.settledOn!)-Date.parse(i.dueDate))/86400000))).sort((a,b)=>a-b),lateCount=lateDays.filter(d=>d>0).length;
 const open=invoices.filter(i=>toUnits(i.paid)<toUnits(i.total)),overdue=open.filter(i=>i.dueDate<today);const middle=lateDays.length?lateDays[Math.floor(lateDays.length/2)]!:null,p90=lateDays.length?lateDays[Math.max(0,Math.ceil(lateDays.length*.9)-1)]!:null;
 return {sampleSize:settled.length,lateCount,medianDaysLate:middle,p90DaysLate:p90,openCount:open.length,overdueCount:overdue.length,overdueAmount:fromUnits(overdue.reduce((sum,i)=>sum+toUnits(i.total)-toUnits(i.paid),0n)),band:settled.length<5?'unknown':lateCount*2>=settled.length?'often_late':lateCount>0?'sometimes_late':'usually_on_time',evidence:invoices.map(i=>i.id).slice(0,50),explanation:'Based on active settled invoices only. Open aging is shown separately. This is payment history, not a credit score.'};
}
export type PaymentTerm={eventId:string;essential:boolean;minimumPayment:string|null;deferralDays:number|null};
export function prioritizePayments(input:{today:string;availableCash:string;events:ForecastEvent[];terms:PaymentTerm[]}){
 const terms=new Map(input.terms.map(t=>[t.eventId,t]));let remaining=toUnits(input.availableCash,true);if(remaining<0n)remaining=0n;
 const obligations=input.events.filter(e=>e.kind==='bill'&&toUnits(e.amount,true)<0n).sort((a,b)=>{
  const at=terms.get(a.id),bt=terms.get(b.id);return Number(b.date<=input.today)-Number(a.date<=input.today)||Number(bt?.essential??false)-Number(at?.essential??false)||a.date.localeCompare(b.date)||a.id.localeCompare(b.id);
 });
 const items=obligations.map(e=>{const term=terms.get(e.id),amount=-toUnits(e.amount,true);if(term?.minimumPayment!==null&&term?.minimumPayment!==undefined&&(toUnits(term.minimumPayment)<=0n||toUnits(term.minimumPayment)>amount))throw new RangeError('Minimum payments must be positive and no greater than the obligation');if(term?.deferralDays!==undefined&&term.deferralDays!==null&&(!Number.isInteger(term.deferralDays)||term.deferralDays<0||term.deferralDays>90))throw new RangeError('Deferral terms must be from 0 to 90 days');
  // No partial allocation without explicit terms and a supplier settlement model.
  const partialSupported=e.id.startsWith('payable:'),required=partialSupported&&term?.minimumPayment?toUnits(term.minimumPayment):amount,paid=remaining>=required?required:0n;remaining-=paid;
  return {eventId:e.id,sourceId:e.sourceId??null,name:e.description,dueDate:e.date,amount:fromUnits(amount),allocated:fromUnits(paid),unpaid:fromUnits(amount-paid),essential:term?.essential??false,termsComplete:Boolean(term&&term.minimumPayment!==null&&term.deferralDays!==null),latestPermittedDate:term?.deferralDays!==null&&term?.deferralDays!==undefined?shiftDate(e.date,term.deferralDays):null,minimumInput:term?.minimumPayment??'',deferralInput:term?.deferralDays?.toString()??'',proposedDate:term?.deferralDays!==null&&term?.deferralDays!==undefined?(shiftDate(e.date,term.deferralDays)<input.today?input.today:shiftDate(e.date,term.deferralDays)):e.date<input.today?input.today:e.date,status:paid===amount?'covered':paid>0n?'partial_payment_review':'needs_review',reason:paid===amount?'Covered from available cash.':paid>0n?'Only the explicitly supplied minimum is covered; the remaining balance still needs a plan.':'Available cash cannot cover this obligation. Confirm terms and dates with the payee; no penalty or flexibility is assumed.'};
 });return {items,remainingCash:fromUnits(remaining),unpaid:fromUnits(items.reduce((sum,i)=>sum+toUnits(i.unpaid),0n)),basis:'Current unrestricted cash only; unreceived income is excluded. Due-date and essential ordering is a proposal, not a payment or legal recommendation.'};
}
