import { Money, currencyScale } from '../../tracking/v2/money';
export type DebtInput={id:string;name:string;balance:string;apr:string;minimum:string;dueDay:number};
/** Fixed monthly APR/12, interest rounded half-up in currency minor units, at month start. */
export function payoff(debts:DebtInput[],extra:string,strategy:'snowball'|'avalanche',start:string,currency:string){
 const scale=currencyScale(currency),state=debts.filter(d=>new Money(d.balance).gt(0)).map(d=>({...d,left:new Money(d.balance),rate:new Money(d.apr).div(1200),min:new Money(d.minimum)}));
 const budget=state.reduce((s,d)=>s.add(d.min),new Money(extra));
 const warnings=state.filter(d=>d.min.lte(d.left.mul(d.rate).toDecimalPlaces(scale))).map(d=>({debtId:d.id,message:'Minimum payment alone does not reduce principal; extra payment may be needed.'}));
 const rows:{debtId:string;date:string;opening:string;interest:string;payment:string;principal:string;closing:string}[]=[];
 let totalInterest=new Money(0),months=0,paidOff=false,reason:string|null=null;
 if(state.every(d=>d.left.isZero()))return {warnings,rows,months:0,paidOff:true,reason,totalInterest:'0',monthlyBudget:budget.toFixed(4),payoffDate:start,convention:'Fixed APR / 12; monthly interest rounded half-up; minimums then extra; 600-month cap',version:1};
 const [year,month]=start.split('-').map(Number);
 for(let m=0;m<600;m++){
  const active=state.filter(d=>d.left.gt(0));if(!active.length){paidOff=true;break;}
  const entries=active.map(d=>{const opening=d.left,interest=opening.mul(d.rate).toDecimalPlaces(scale);return {d,opening,interest,due:opening.add(interest),payment:Money.min(d.min,opening.add(interest))};});
  let remainder=budget.sub(entries.reduce((s,e)=>s.add(e.payment),new Money(0)));
  if(remainder.lt(0)){reason='Monthly budget cannot cover minimum payments.';break;}
  const ranked=[...entries].sort((a,b)=>strategy==='snowball'?a.opening.cmp(b.opening)||b.d.rate.cmp(a.d.rate)||a.d.id.localeCompare(b.d.id):b.d.rate.cmp(a.d.rate)||a.opening.cmp(b.opening)||a.d.id.localeCompare(b.d.id));
  for(const e of ranked){const additional=Money.min(remainder,e.due.sub(e.payment));e.payment=e.payment.add(additional);remainder=remainder.sub(additional);}
  const before=active.reduce((s,d)=>s.add(d.left),new Money(0));
  for(const e of entries){
   e.d.left=e.due.sub(e.payment);totalInterest=totalInterest.add(e.interest);
   const date=new Date(Date.UTC(year!,month!-1+m,1));const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(e.d.dueDay,last));
   rows.push({debtId:e.d.id,date:date.toISOString().slice(0,10),opening:e.opening.toFixed(4),interest:e.interest.toFixed(4),payment:e.payment.toFixed(4),principal:e.payment.sub(e.interest).toFixed(4),closing:e.d.left.toFixed(4)});
  }
  months=m+1;
  if(active.every(d=>d.left.eq(0))){paidOff=true;break;}
  const after=active.reduce((s,d)=>s.add(d.left),new Money(0));
  if(after.gte(before)){reason='Payments do not reduce total debt under these assumptions.';break;}
 }
 if(!paidOff&&!reason)reason='Not paid off within the 600-month simulation limit.';
 return {warnings,rows,months,paidOff,reason,totalInterest:totalInterest.toFixed(4),monthlyBudget:budget.toFixed(4),payoffDate:paidOff?rows.map(r=>r.date).sort().at(-1)??start:null,convention:'Fixed APR / 12; monthly interest rounded half-up; minimums then extra; 600-month cap',version:1};
}
