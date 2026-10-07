import {test,expect} from 'bun:test';
import {scenarioForecast,comparisonPeriods,comparisonGroupKey,spendingComparison,detectFindings,businessBurn,goalCoaching,customerMetrics,prioritizePayments} from '../../src/assistant/v2/calculations';
import {amountToken,extractedEntry} from '../../src/assistant/v2/entry';
import {languageStructured} from '../../src/assistant/v2/providers';
import {validateToolSelection} from '../../src/assistant/v2/contracts';
const account={id:'cash',name:'Cash',balance:'3000000.0000',currency:'IDR',protectedAmount:'0.0000',lowBalanceThreshold:'0.0000',dailyExpenseAverage:'0.0000',dailyIncomeAverage:'0.0000'};
test('scenario purchase changes conservative headroom without changing the snapshot',()=>{const snapshot={asOfDate:'2026-10-01',horizonDays:30,accounts:[account],events:[],qualityFlags:[],workspaceProtectedAmount:'0.0000'};const original=JSON.stringify(snapshot),result=scenarioForecast(snapshot,[{kind:'purchase',accountId:'cash',date:'2026-10-02',amount:'1000000'}]);expect(result.before.safeToSpend).toBe('3000000.0000');expect(result.after.safeToSpend).toBe('2000000.0000');expect(JSON.stringify(snapshot)).toBe(original);});
test('delaying an invoice outside the horizon removes that expected inflow, never raises conservative safe-to-spend',()=>{const snapshot={asOfDate:'2026-10-01',horizonDays:30,accounts:[account],events:[{id:'inv',kind:'invoice' as const,date:'2026-10-25',accountId:'cash',amount:'500000',description:'Invoice'}],qualityFlags:[],workspaceProtectedAmount:'0'};const result=scenarioForecast(snapshot,[{kind:'delay_invoice',eventId:'inv',days:14}]);expect(result.after.points.filter(p=>p.scenario==='base').at(-1)!.closingBalance).not.toBe(result.before.points.filter(p=>p.scenario==='base').at(-1)!.closingBalance);expect(result.before.safeToSpend).toBe(result.after.safeToSpend);expect(snapshot.events[0]!.date).toBe('2026-10-25');});
test('equal elapsed comparison caps the longer month and handles leap February',()=>{expect(comparisonPeriods('2024-03-31')).toMatchObject({currentEnd:'2024-03-29',previousEnd:'2024-02-29',elapsedDays:29});expect(comparisonPeriods('2026-01-03').previousStart).toBe('2025-12-01');});
test('comparison source identities follow category, account and normalized merchant grouping',()=>{
 const row={id:'current',date:'2026-10-03',amount:'45.0000',currency:'IDR',type:'expense',accountId:'cash',categoryId:'food',categoryName:'Food',merchant:'  Cafe  '};
 expect(comparisonGroupKey(row,'category')).toBe('food');expect(comparisonGroupKey(row,'account')).toBe('cash');expect(comparisonGroupKey(row,'merchant')).toBe('cafe');
 const comparison=spendingComparison([row,{...row,id:'previous',date:'2026-09-03',amount:'30.0000'},{...row,id:'outside',date:'2026-09-30'},{...row,id:'transfer',type:'transfer'}],'2026-10-06','IDR');
 expect(comparison.items[0]).toMatchObject({groupKey:'food',current:'45.0000',previous:'30.0000',change:'15.0000',evidence:['current','previous']});
});
test('burn handles negative cash and no net burn',()=>{expect(businessBurn({inflows:'0',outflows:'900',days:90,availableCash:'-10',protectedCash:'0',complete:true,currency:'USD'})).toMatchObject({status:'no_available_cash',runwayMonths:'0.0000',netMonthlyBurn:'300.0000'});expect(businessBurn({inflows:'900',outflows:'900',days:90,availableCash:'100',protectedCash:'0',complete:true,currency:'USD'})).toMatchObject({status:'not_burning_cash',runwayMonths:null});});
test('goal coaching rounds upward and treats overdue and missing dates explicitly',()=>{expect(goalCoaching('100','0','2026-10-15','2026-10-01','49')).toMatchObject({weeklyTarget:'50.0000',affordable:false});expect(goalCoaching('100','0',null,'2026-10-01','100').status).toBe('no_deadline');expect(goalCoaching('100','100','2026-01-01','2026-10-01',null).status).toBe('achieved');});
test('customer metrics abstain below five settled invoices and show open aging separately',()=>{expect(customerMetrics([{id:'i',dueDate:'2026-01-01',total:'100',paid:'50',settledOn:null}],'2026-10-01')).toMatchObject({sampleSize:0,band:'unknown',overdueAmount:'50.0000'});});
test('goal targets round up to spendable currency units, including the deadline day',()=>{
 expect(goalCoaching('100','0','2026-10-22','2026-10-01','33','IDR')).toMatchObject({weeklyTarget:'34.0000',affordable:false});
 expect(goalCoaching('100','0','2026-10-22','2026-10-01','34','IDR')).toMatchObject({weeklyTarget:'34.0000',affordable:true});
 expect(goalCoaching('100','0','2026-10-22','2026-10-01',null,'USD').weeklyTarget).toBe('33.3400');
 expect(goalCoaching('100','0','2026-10-22','2026-10-01',null,'KWD').weeklyTarget).toBe('33.3340');
 expect(goalCoaching('100','0','2026-10-01','2026-10-01',null,'IDR')).toMatchObject({weeksRemaining:1,weeklyTarget:'100.0000'});
});
test('customer bands require support and keep partial overdue balances separate',()=>{
 const invoices=Array.from({length:5},(_,n)=>({id:String(n),dueDate:'2026-09-01',total:'100',paid:'100',settledOn:n<3?'2026-09-05':'2026-09-01'}));
 const metrics=customerMetrics([...invoices,{id:'partial',dueDate:'2026-09-01',total:'100',paid:'25',settledOn:'2026-09-03'}],'2026-10-01');
 expect(metrics).toMatchObject({sampleSize:5,lateCount:3,band:'often_late',medianDaysLate:4,overdueAmount:'75.0000',openCount:1});
 expect(customerMetrics(invoices.slice(0,4),'2026-10-01').band).toBe('unknown');
 expect(customerMetrics(invoices.map(i=>({...i,settledOn:i.dueDate})),'2026-10-01').band).toBe('usually_on_time');
});
test('duplicates exclude known recurring, invoice and bill identities',()=>{const row={id:'a',date:'2026-10-01',amount:'45.0000',currency:'USD',type:'expense',accountId:'cash',categoryId:'food',categoryName:'Food',merchant:'Lunch'};expect(detectFindings([row,{...row,id:'b'}],'USD').length).toBe(1);expect(detectFindings([row,{...row,id:'b',recurringRuleId:'r'}],'USD').length).toBe(0);});
test('payment planning never fabricates a partial bill payment or deferral',()=>{const result=prioritizePayments({today:'2026-10-01',availableCash:'50',events:[{id:'bill:1',date:'2026-10-01',amount:'-100',accountId:'cash',kind:'bill',description:'Rent'}],terms:[]});expect(result.items[0]).toMatchObject({allocated:'0.0000',unpaid:'100.0000',termsComplete:false,latestPermittedDate:null});});
test('Indonesian shorthand and separators parse deterministically; ambiguous dates stay unresolved',()=>{expect(amountToken('45k','IDR','id')).toBe('45000.0000');expect(amountToken('1.250.000,50','IDR','id')).toBe('1250000.5000');expect(amountToken('45k','USD','en')).toBeNull();const parsed=extractedEntry({type:'expense',amountToken:'45k',dateToken:'',currency:'IDR',accountName:'',categoryName:'',merchant:''},'makan 45k','2026-10-01','IDR','id');expect(parsed.unresolved).toContain('date');});
test('fabricated amount extraction and arbitrary tool arguments are rejected',()=>{expect(()=>extractedEntry({type:'expense',amountToken:'900',dateToken:'',currency:'IDR',accountName:'',categoryName:'',merchant:''},'makan 45k','2026-10-01','IDR','id')).toThrow();expect(()=>validateToolSelection({tool:'sql',category:'',period:'this_month'})).toThrow();expect(()=>validateToolSelection({tool:'spending',category:'',period:'last_month',workspaceId:'other'})).toThrow();});
test('literal currency suffixes preserve shorthand and reject mismatched currency',()=>{
 expect(amountToken('45k IDR','IDR','en')).toBe('45000.0000');
 expect(amountToken('45kIDR','IDR','id')).toBe('45000.0000');
 expect(amountToken('45 ribu','IDR','id')).toBe('45000.0000');
 expect(amountToken('2juta','IDR','id')).toBe('2000000.0000');
 expect(amountToken('1.250.000,50 IDR','IDR','id')).toBe('1250000.5000');
 expect(amountToken('25 USD','USD','en')).toBe('25.0000');
 expect(amountToken('25 USD','IDR','en')).toBeNull();
 expect(amountToken('45k USD','USD','en')).toBeNull();
 const parsed=extractedEntry({type:'expense',amountToken:'45k IDR',dateToken:'today',currency:'IDR',accountName:'',categoryName:'',merchant:''},'spent 45k IDR today','2026-10-06','IDR','en');
 expect(parsed.fields.amount).toBe('45000.0000');
});
test('unconfigured provider makes zero network calls',async()=>{const previous={key:process.env.GROQ_API_KEY,model:process.env.GROQ_MODEL,ack:process.env.ASSISTANT_EXTERNAL_DATA_TERMS_ACKNOWLEDGED};delete process.env.GROQ_API_KEY;let calls=0;try{await expect(languageStructured({instruction:'x',text:'x',schema:{}},(async()=>{calls++;return Response.json({});}) as typeof fetch)).rejects.toThrow();expect(calls).toBe(0);}finally{if(previous.key!==undefined)process.env.GROQ_API_KEY=previous.key;if(previous.model!==undefined)process.env.GROQ_MODEL=previous.model;if(previous.ack!==undefined)process.env.ASSISTANT_EXTERNAL_DATA_TERMS_ACKNOWLEDGED=previous.ack;}});

test('unassigned obligations remain deducted on later forecast days and never yield a spend allowance',()=>{const snapshot={asOfDate:'2026-10-01',horizonDays:30,accounts:[account],events:[{id:'bill',kind:'bill' as const,date:'2026-10-02',accountId:null,amount:'-1000000',description:'Supplier bill'}],qualityFlags:[],workspaceProtectedAmount:'0'};const result=scenarioForecast(snapshot,[{kind:'purchase',accountId:'cash',date:'2026-10-03',amount:'100'}]);expect(result.before.points.filter(p=>p.scenario==='base').at(-1)!.closingBalance).toBe('2000000.0000');expect(result.before.safeToSpend).toBeNull();});

// Deliberately include a legitimate repeat: the detector must be reviewed, never used as fraud proof.
test('synthetic duplicate evaluation records false positives before alert rollout',()=>{
 const row={id:'confirmed-a',date:'2026-10-01',amount:'45.0000',currency:'USD',type:'expense',accountId:'cash',categoryId:'food',categoryName:'Food',merchant:'Lunch'};
 const findings=detectFindings([row,{...row,id:'confirmed-b'},{...row,id:'legitimate-a',amount:'10.0000',merchant:'Bus'},{...row,id:'legitimate-b',amount:'10.0000',merchant:'Bus'}],'USD').filter(f=>f.kind==='possible_duplicate');
 const truePositive=findings.filter(f=>f.evidence.includes('confirmed-a')).length,falsePositive=findings.filter(f=>f.evidence.includes('legitimate-a')).length;
 expect({precision:truePositive/(truePositive+falsePositive),falsePositiveRate:falsePositive/1}).toEqual({precision:0.5,falsePositiveRate:1});
 expect(findings.every(f=>String(f.facts.uncertainty).includes('legitimate'))).toBe(true);
});


test('Indonesian transaction statements are entry intent, while past-spending questions remain queries',async()=>{
 const {isTransactionEntry}=await import('../../src/assistant/v2/intent');
 expect(isTransactionEntry('capy, gue abis transaksi 50k idr di Point Cofee Indomaret menggunakan BCA')).toBe(true);
 expect(isTransactionEntry('aku baru beli kopi 50rb pakai BCA')).toBe(true);
 expect(isTransactionEntry('I just spent $50 at Coffee using Cash')).toBe(true);
 expect(isTransactionEntry('catat makan 45k hari ini')).toBe(true);
 expect(isTransactionEntry('berapa transaksi 50k di Point Coffee bulan ini?')).toBe(false);
 expect(isTransactionEntry('How much did I spend on food last month?')).toBe(false);
 expect(isTransactionEntry('hapus transaksi 50k')).toBe(false);
 expect(isTransactionEntry('transfer 50k ke tabungan')).toBe(false);
});
