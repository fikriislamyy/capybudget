import { describe, expect, test } from 'bun:test';
import { sweepBillReminders } from '../../src/personal-finance/reminder-scheduler';
import { client } from '../../src/db';
import { recoverQueuedAssistantForecasts, refreshStaleAssistantForecasts } from '../../src/assistant/routes';
import { dispatchInvoiceDeliveries } from '../../src/business/worker';
import { encryptPushAuth } from '../../src/personal-finance/push-crypto';

const enabled=process.env.TRACKING_INTEGRATION==='1';
const testDatabaseUrl=process.env.TRACKING_TEST_DATABASE_URL;
if(enabled&&(!testDatabaseUrl||!new URL(testDatabaseUrl).pathname.endsWith('_test')))throw new Error('Tracking integration requires TRACKING_TEST_DATABASE_URL pointing to a database ending in _test.');
const api=process.env.AUTH_TEST_API_URL??'http://localhost:3000';
const mailpit=process.env.MAILPIT_API_URL??'http://localhost:8025';
const origin=process.env.PUBLIC_APP_URL??'http://localhost:5173';
const email='tracking-'+crypto.randomUUID()+'@example.test';
const password='Tracking-test-pass-852!';

async function post(path:string,body:unknown,cookie?:string,extra:Record<string,string>={}){
  return fetch(api+path,{method:'POST',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{}),...extra},body:JSON.stringify(body)});
}
async function waitForOtp(targetEmail=email){
  const until=Date.now()+15000;
  while(Date.now()<until){
    const listing=await fetch(mailpit+'/api/v1/messages?limit=30').then(r=>r.json());
    for(const m of listing.messages??[]){
      if(m.Subject!=='Your CapyBudget verification code'||!JSON.stringify(m).includes(targetEmail))continue;
      const mail=await fetch(mailpit+'/api/v1/message/'+m.ID).then(r=>r.json());
      const otp=(mail.Text+'\n'+mail.HTML).match(/\b\d{6}\b/)?.[0];
      if(otp)return otp;
    }
    await Bun.sleep(200);
  }
  throw new Error('Mailpit did not receive the verification code');
}
async function waitForBillReminder(){
  const until=Date.now()+75000;
  while(Date.now()<until){
    const listing=await fetch(mailpit+'/api/v1/messages?limit=50').then(r=>r.json());
    for(const message of listing.messages??[]){
      if(message.Subject!=='A bill is coming up · CapyBudget'||!JSON.stringify(message).includes(email))continue;
      const detail=await fetch(mailpit+'/api/v1/message/'+message.ID).then(r=>r.json());
      if((detail.Text+'\n'+detail.HTML).includes('Internet'))return detail;
    }
    await Bun.sleep(200);
  }
  throw new Error('Mailpit did not receive the scheduled bill reminder');
}
async function waitForAssistantAlert(){
  const until=Date.now()+75000;
  while(Date.now()<until){
    const listing=await fetch(mailpit+'/api/v1/messages?limit=50').then(r=>r.json());
    for(const message of listing.messages??[]){
      if(message.Subject!=='A cashflow update · CapyBudget'||!JSON.stringify(message).includes(email))continue;
      const detail=await fetch(mailpit+'/api/v1/message/'+message.ID).then(r=>r.json());
      if((detail.Text+'\n'+detail.HTML).includes('Review the cashflow forecast'))return detail;
    }
    await Bun.sleep(200);
  }
  throw new Error('Mailpit did not receive the opted-in assistant alert');
}
async function waitForInvoiceReminder(invoiceNumber:string,subject=`A payment reminder for your invoice · ${invoiceNumber}`){
  const until=Date.now()+75000;
  while(Date.now()<until){
    const listing=await fetch(mailpit+'/api/v1/messages?limit=50').then(r=>r.json());
    for(const message of listing.messages??[]){
      if(message.Subject!==subject||!JSON.stringify(message).includes(email))continue;
      return await fetch(mailpit+'/api/v1/message/'+message.ID).then(r=>r.json());
    }
    await Bun.sleep(200);
  }
  throw new Error('Mailpit did not receive the confirmed invoice reminder');
}

describe('workspace tracking integration',()=>{
  test.skipIf(!enabled)('creates isolated wallets and records income, expense, and transfer balances exactly',async()=>{
      const signup=await post('/api/auth/sign-up/email',{name:'Tracking Test',email,password});
      expect(signup.ok).toBe(true);
      const otp=await waitForOtp();
      const verify=await post('/api/auth/email-otp/verify-email',{email,otp});
      expect(verify.ok).toBe(true);
      const login=await post('/api/auth/sign-in/email',{email,password});
      expect(login.ok).toBe(true);
      const cookie=login.headers.getSetCookie().map(v=>v.split(';',1)[0]).join('; ');
      const headers={cookie};

      const workspaces=await fetch(api+'/api/workspaces',{headers});
      expect(workspaces.status).toBe(200);
      const personal=(await workspaces.json()).items.find((w:any)=>w.kind==='personal');
      expect(personal).toBeDefined();
      const categories=await fetch(api+'/api/workspaces/'+personal.id+'/categories',{headers});
      const categoryData=await categories.json();
      const category=categoryData.items.find((c:any)=>c.name==='Salary');
      const expenseCategory=categoryData.items.find((c:any)=>c.type==='expense');
      const tagResponse=await post('/api/workspaces/'+personal.id+'/tags',{name:'daily'},cookie);
      expect(tagResponse.status).toBe(201);
      const tag=(await tagResponse.json()).tag;
      const first=await post('/api/workspaces/'+personal.id+'/accounts',{name:'Bank',kind:'bank',openingBalance:'1000.00'},cookie);
      const second=await post('/api/workspaces/'+personal.id+'/accounts',{name:'Cash',kind:'cash',openingBalance:'0'},cookie);
      expect(first.status).toBe(201);expect(second.status).toBe(201);
      const bank=(await first.json()).account,cash=(await second.json()).account;
      const create=async(data:any,key:string)=>post('/api/workspaces/'+personal.id+'/transactions',data,cookie,{'idempotency-key':key});
      const income=await create({type:'income',accountId:bank.id,categoryId:category.id,amount:'500.00',date:'2026-09-01',notes:'Salary'},crypto.randomUUID());
      expect(income.status).toBe(201);
      const expense=await create({type:'expense',accountId:bank.id,categoryId:category.id,amount:'100.00',date:'2026-09-02',notes:'Expense'},crypto.randomUUID());
      expect(expense.status).toBe(422);
      const expenseResult=await create({type:'expense',accountId:bank.id,categoryId:expenseCategory.id,amount:'100.00',date:'2026-09-02',notes:'Lunch',tagIds:[tag.id]},crypto.randomUUID());
      expect(expenseResult.status).toBe(201);
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date());
      const budget=await post('/api/workspaces/'+personal.id+'/budgets',{name:'Food month',categoryId:expenseCategory.id,amount:'1000.00',cadence:'monthly',startsOn:today.slice(0,7)+'-01'},cookie);
      expect(budget.status).toBe(201);
      const budgetSpend=await create({type:'expense',accountId:bank.id,categoryId:expenseCategory.id,amount:'800.00',date:today,notes:'Market'},crypto.randomUUID());
      expect(budgetSpend.status).toBe(201);
      const budgetView=await fetch(api+'/api/workspaces/'+personal.id+'/budgets',{headers}).then(r=>r.json());
      expect(budgetView.items[0].spent).toBe('900.0000');
      expect(budgetView.items[0].remaining).toBe('100.0000');
      expect(budgetView.items[0].usedPercent).toBe(90);
      const notices=await fetch(api+'/api/workspaces/'+personal.id+'/notifications',{headers}).then(r=>r.json());
      expect(notices.items.some((n:any)=>n.kind==='budget-alert')).toBe(true);
      const goalResponse=await post('/api/workspaces/'+personal.id+'/goals',{name:'Emergency fund',targetAmount:'500.00'},cookie);
      expect(goalResponse.status).toBe(201);const goal=(await goalResponse.json()).goal;
      expect((await post('/api/workspaces/'+personal.id+'/goals/'+goal.id+'/contributions',{amount:'250.00',direction:'add'},cookie)).status).toBe(201);
      expect((await post('/api/workspaces/'+personal.id+'/goals/'+goal.id+'/contributions',{amount:'300.00',direction:'withdraw'},cookie)).status).toBe(422);
      expect((await post('/api/workspaces/'+personal.id+'/goals/'+goal.id+'/contributions',{amount:'100.00',direction:'withdraw'},cookie)).status).toBe(201);
      const goalView=await fetch(api+'/api/workspaces/'+personal.id+'/goals',{headers}).then(r=>r.json());
      expect(goalView.items.find((g:any)=>g.id===goal.id).saved).toBe('150.0000');
      const dueToday=today;
      const billResponse=await post('/api/workspaces/'+personal.id+'/bills',{name:'Internet',amount:'75.00',dueOn:dueToday,frequency:'once',reminderDays:[3,0]},cookie);
      expect(billResponse.status).toBe(201);
      const billList=await fetch(api+'/api/workspaces/'+personal.id+'/bills',{headers}).then(r=>r.json());
      const occurrence=billList.items.find((item:any)=>item.name==='Internet'&&item.dueOn===dueToday);
      expect(occurrence).toBeDefined();
      await sweepBillReminders();
      await waitForBillReminder();
      expect((await post('/api/workspaces/'+personal.id+'/bill-occurrences/'+occurrence.id+'/paid',{},cookie)).status).toBe(200);
      await sweepBillReminders();
      const billAfterPaid=await fetch(api+'/api/workspaces/'+personal.id+'/bills',{headers}).then(r=>r.json());
      expect(billAfterPaid.items.find((item:any)=>item.id===occurrence.id).status).toBe('paid');
      const transfer=await create({type:'transfer',accountId:bank.id,destinationAccountId:cash.id,amount:'200.00',date:'2026-09-03',notes:'Cash withdrawal'},crypto.randomUUID());
      expect(transfer.status).toBe(201);
      const transferRecord=await transfer.json();
      const rows=await fetch(api+'/api/workspaces/'+personal.id+'/accounts',{headers}).then(r=>r.json());
      expect(rows.items.find((a:any)=>a.id===bank.id).balance).toBe('400.0000');
      expect(rows.items.find((a:any)=>a.id===cash.id).balance).toBe('200.0000');
      const summary=await fetch(api+'/api/workspaces/'+personal.id+'/summary?from=2026-09-01&to=2026-09-30',{headers}).then(r=>r.json());
      expect(summary.income).toBe('500.0000');
      expect(summary.expense).toBe('900.0000');
      const filtered=await fetch(api+'/api/workspaces/'+personal.id+'/transactions?accountIds='+bank.id+'&categoryIds='+expenseCategory.id+'&tagIds='+tag.id+'&minAmount=90&maxAmount=110',{headers}).then(r=>r.json());
      expect(filtered.items.length).toBe(1);
      expect(filtered.items[0].id).toBe((await expenseResult.json()).id);
      const firstPage=await fetch(api+'/api/workspaces/'+personal.id+'/transactions?limit=2&sort=date&direction=asc',{headers}).then(r=>r.json());
      expect(firstPage.items.length).toBe(2);
      expect(firstPage.nextCursor).toBeTruthy();
      const secondPage=await fetch(api+'/api/workspaces/'+personal.id+'/transactions?limit=2&sort=date&direction=asc&cursor='+encodeURIComponent(firstPage.nextCursor),{headers}).then(r=>r.json());
      expect(secondPage.items.length).toBe(2);
      expect(firstPage.items.some((row:any)=>row.id===secondPage.items[0].id)).toBe(false);
      const inaccessible=await fetch(api+'/api/workspaces/00000000-0000-4000-8000-000000000001/accounts',{headers});
      expect(inaccessible.status).toBe(404);
      const replay=await create({type:'transfer',accountId:bank.id,destinationAccountId:cash.id,amount:'200.00',date:'2026-09-03',notes:'Cash withdrawal'},'transfer-retry');
      expect(replay.status).toBe(201);
      const duplicate=await create({type:'transfer',accountId:bank.id,destinationAccountId:cash.id,amount:'200.00',date:'2026-09-03',notes:'Cash withdrawal'},'transfer-retry');
      expect(duplicate.status).toBe(201);
      const conflict=await create({type:'transfer',accountId:bank.id,destinationAccountId:cash.id,amount:'201.00',date:'2026-09-03',notes:'Cash withdrawal'},'transfer-retry');
      expect(conflict.status).toBe(409);
      const afterRetry=await fetch(api+'/api/workspaces/'+personal.id+'/accounts',{headers}).then(r=>r.json());
      expect(afterRetry.items.find((a:any)=>a.id===bank.id).balance).toBe('200.0000');
      const deleted=await fetch(api+'/api/workspaces/'+personal.id+'/transactions/'+transferRecord.id+'?version=1',{method:'DELETE',headers});
      expect(deleted.status).toBe(204);
      const afterDelete=await fetch(api+'/api/workspaces/'+personal.id+'/accounts',{headers}).then(r=>r.json());
      expect(afterDelete.items.find((a:any)=>a.id===bank.id).balance).toBe('400.0000');

      const recurring=await post('/api/workspaces/'+personal.id+'/recurring-rules',{name:'Monthly salary',type:'income',accountId:bank.id,categoryId:category.id,amount:'25.00',frequency:'week',interval:2,anchorDate:today,mode:'manual'},cookie);
      expect(recurring.status).toBe(201);
      const rule=(await recurring.json()).rule;
      const materialized=await post('/api/workspaces/'+personal.id+'/recurring-occurrences/materialize',{days:30},cookie);
      expect(materialized.ok).toBe(true);
      const upcoming=await fetch(api+'/api/workspaces/'+personal.id+'/recurring-occurrences',{headers}).then(r=>r.json());
      const due=upcoming.items.find((item:any)=>item.ruleId===rule.id);
      expect(due).toBeDefined();expect(due.status).toBe('pending');
      const confirmed=await post('/api/workspaces/'+personal.id+'/recurring-occurrences/'+due.id+'/confirm',{},cookie);
      expect(confirmed.status).toBe(200);
      const finalBalances=await fetch(api+'/api/workspaces/'+personal.id+'/accounts',{headers}).then(r=>r.json());
      expect(finalBalances.items.find((a:any)=>a.id===bank.id).balance).toBe('425.0000');

      const assistantPath='/api/workspaces/'+personal.id+'/assistant';
      const otherEmail='scope-'+crypto.randomUUID()+'@example.test';
      const otherPassword='Scope-test-pass-482!';
      expect((await post('/api/auth/sign-up/email',{name:'Other User',email:otherEmail,password:otherPassword})).ok).toBe(true);
      const otherOtp=await waitForOtp(otherEmail);
      expect((await post('/api/auth/email-otp/verify-email',{email:otherEmail,otp:otherOtp})).ok).toBe(true);
      const otherLogin=await post('/api/auth/sign-in/email',{email:otherEmail,password:otherPassword});
      expect(otherLogin.ok).toBe(true);
      const otherCookie=otherLogin.headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ');
      const otherWorkspaces=await fetch(api+'/api/workspaces',{headers:{cookie:otherCookie}}).then(r=>r.json());
      expect(otherWorkspaces.items.some((workspace:any)=>workspace.id===personal.id)).toBe(false);
      expect((await fetch(api+assistantPath+'/settings',{headers:{cookie:otherCookie}})).status).toBe(404);
      expect((await fetch(api+assistantPath+'/forecast?horizon=30',{headers:{cookie:otherCookie}})).status).toBe(404);
      const savingsResponse=await post('/api/workspaces/'+personal.id+'/accounts',{name:'Optional savings',kind:'savings',openingBalance:'5000000.00'},cookie);
      expect(savingsResponse.status).toBe(201);
      const savingsAccount=(await savingsResponse.json()).account;
      const assistantSettingsResponse=await fetch(api+assistantPath+'/settings',{headers});
      expect(assistantSettingsResponse.status).toBe(200);
      const assistantSettings=await assistantSettingsResponse.json();
      expect(assistantSettings.settings.externalAiAvailable).toBe(false);
      expect(assistantSettings.accounts.find((account:any)=>account.id===savingsAccount.id).included).toBe(false);
      const assistantUpdate=await fetch(api+assistantPath+'/settings',{method:'PATCH',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({version:assistantSettings.settings.version,categorizationEnabled:true,sourcePermissions:{merchant:true}})});
      expect(assistantUpdate.status).toBe(200);
      const liquidUnits=finalBalances.items.filter((account:any)=>['cash','bank','e_wallet'].includes(account.kind)&&account.currency==='IDR').reduce((sum:bigint,account:any)=>sum+BigInt(String(account.balance).replace('.','')),0n);
      const liquidOpening=`${liquidUnits/10000n}.${String(liquidUnits%10000n).padStart(4,'0')}`;
      const futureDate=new Date(today+'T00:00:00Z');futureDate.setUTCDate(futureDate.getUTCDate()+5);
      const futureEntry=await create({type:'expense',accountId:bank.id,categoryId:expenseCategory.id,amount:'17.00',date:futureDate.toISOString().slice(0,10),merchant:'Future test entry'},'assistant-future-reversal');
      expect(futureEntry.status).toBe(201);
      const futureTransaction=await futureEntry.json();
      expect((await fetch(api+'/api/workspaces/'+personal.id+'/transactions/'+futureTransaction.id+'?version=1',{method:'DELETE',headers})).status).toBe(204);
      const liveFutureDate=new Date(today+'T00:00:00Z');liveFutureDate.setUTCDate(liveFutureDate.getUTCDate()+8);
      const liveFutureEntry=await create({type:'income',accountId:bank.id,categoryId:category.id,amount:'23.00',date:liveFutureDate.toISOString().slice(0,10),merchant:'Future salary'},'assistant-future-live');
      expect(liveFutureEntry.status).toBe(201);
      const liveFutureTransaction=await liveFutureEntry.json();
      const refreshKey=crypto.randomUUID();
      const queuedRefresh=await fetch(api+assistantPath+'/forecast/refresh',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({horizon:30,idempotencyKey:refreshKey})});
      expect(queuedRefresh.status).toBe(202);
      const queuedBody=await queuedRefresh.json();expect(queuedBody.runId).toBeTruthy();
      const replayRefresh=await fetch(api+assistantPath+'/forecast/refresh',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({horizon:30,idempotencyKey:refreshKey})}).then(r=>r.json());
      expect(replayRefresh.runId).toBe(queuedBody.runId);
      const conflictingRefresh=await fetch(api+assistantPath+'/forecast/refresh',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({horizon:60,idempotencyKey:refreshKey})});
      expect(conflictingRefresh.status).toBe(409);
      let persistedRun:any;
      for(let attempt=0;attempt<30;attempt++){persistedRun=await fetch(api+assistantPath+'/forecast/'+queuedBody.runId,{headers}).then(r=>r.json());if(persistedRun.run?.status==='ready')break;await new Promise(resolve=>setTimeout(resolve,200));}
      expect(persistedRun.run.status).toBe('ready');expect(persistedRun.points.length).toBeGreaterThan(0);
      const recoverySession=await fetch(api+'/api/auth/get-session',{headers}).then(r=>r.json());
      await client.begin(async(tx)=>{
        await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[recoverySession.user.id,personal.id]);
        await tx.unsafe('delete from forecast_events where workspace_id=$1 and run_id=$2',[personal.id,queuedBody.runId]);
        await tx.unsafe('delete from forecast_daily_balances where workspace_id=$1 and run_id=$2',[personal.id,queuedBody.runId]);
        await tx.unsafe("update forecast_runs set status='queued',completed_at=null,lease_until=null,attempts=0,summary='{}'::jsonb where workspace_id=$1 and user_id=$2 and id=$3",[personal.id,recoverySession.user.id,queuedBody.runId]);
      });
      await recoverQueuedAssistantForecasts();
      for(let attempt=0;attempt<30;attempt++){persistedRun=await fetch(api+assistantPath+'/forecast/'+queuedBody.runId,{headers}).then(r=>r.json());if(persistedRun.run?.status==='ready')break;await new Promise(resolve=>setTimeout(resolve,200));}
      expect(persistedRun.run.status).toBe('ready');expect(persistedRun.points.length).toBeGreaterThan(0);
      const scopedForecast=await fetch(api+assistantPath+'/forecast?horizon=30',{headers}).then(r=>r.json());
      expect(scopedForecast.forecast.points.find((point:any)=>point.date===scopedForecast.forecast.asOfDate&&point.scenario==='base').openingBalance).toBe(liquidOpening);
      const baselineCandidate=scopedForecast.historyTransactions.find((row:any)=>row.amount==='100.0000');
      expect(baselineCandidate).toMatchObject({type:'expense',excluded:false,overrideVersion:0});
      const excludedBaseline=await fetch(api+assistantPath+'/history-overrides/'+baselineCandidate.id,{method:'PUT',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({version:0,excludeFromBaseline:true,reason:'One-time meal'})});
      expect(excludedBaseline.status).toBe(200);
      const refreshedBaseline=await fetch(api+assistantPath+'/forecast?horizon=30',{headers}).then(r=>r.json());
      expect(refreshedBaseline.historyTransactions.find((row:any)=>row.id===baselineCandidate.id)).toMatchObject({excluded:true,overrideVersion:1});
      expect((await fetch(api+assistantPath+'/history-overrides/'+baselineCandidate.id,{method:'PUT',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({version:1,excludeFromBaseline:false})})).status).toBe(200);
      expect(scopedForecast.events.some((event:any)=>event.sourceId===futureTransaction.id)).toBe(false);
      const liveFutureEvents=scopedForecast.events.filter((event:any)=>event.sourceId===liveFutureTransaction.id);
      expect(liveFutureEvents).toHaveLength(1);
      expect(liveFutureEvents[0]).toMatchObject({date:liveFutureDate.toISOString().slice(0,10),amount:'23.0000',kind:'transaction'});
      const linkedRuleResponse=await post('/api/workspaces/'+personal.id+'/recurring-rules',{name:'Linked utilities rule',type:'expense',accountId:bank.id,categoryId:expenseCategory.id,amount:'60.00',frequency:'week',interval:1,anchorDate:today,mode:'manual'},cookie);
      expect(linkedRuleResponse.status).toBe(201);
      const linkedRule=(await linkedRuleResponse.json()).rule;
      expect((await post('/api/workspaces/'+personal.id+'/recurring-occurrences/materialize',{days:30},cookie)).ok).toBe(true);
      const linkedBillResponse=await post('/api/workspaces/'+personal.id+'/bills',{name:'Linked utilities',amount:'60.00',dueOn:today,frequency:'week',reminderDays:[90]},cookie);
      expect(linkedBillResponse.status).toBe(201);
      const linkedBill=(await linkedBillResponse.json()).bill;
      const linkedBillSettings=await fetch(api+'/api/workspaces/'+personal.id+'/bills/'+linkedBill.id+'/forecast-settings',{method:'PATCH',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({paymentAccountId:bank.id,recurringRuleId:linkedRule.id})});
      expect(linkedBillSettings.status).toBe(200);
      await fetch(api+'/api/workspaces/'+personal.id+'/bills',{headers});
      const deduplicatedForecast=await fetch(api+assistantPath+'/forecast?horizon=30',{headers}).then(r=>r.json());
      const linkedEvents=deduplicatedForecast.events.filter((event:any)=>event.description==='Linked utilities');
      expect(linkedEvents.length).toBeGreaterThan(0);
      expect(linkedEvents.every((event:any)=>event.kind==='bill')).toBe(true);
      expect(new Set(linkedEvents.map((event:any)=>event.date)).size).toBe(linkedEvents.length);
      const learnedTransactions:any[]=[];
      for(let index=0;index<3;index++){
        const learned=await create({type:'expense',accountId:bank.id,categoryId:expenseCategory.id,amount:'5.00',date:today,notes:'Coffee',merchant:'  Cafe   Juniper  '},'assistant-learning-'+index);
        expect(learned.status).toBe(201);
        learnedTransactions.push(await learned.json());
      }
      const categoryHint=await post(assistantPath+'/categorize',{type:'expense',merchant:'cafe juniper',selectedCategoryId:expenseCategory.id},cookie);
      expect(categoryHint.status).toBe(200);
      const categoryHintBody=await categoryHint.json();
      expect(categoryHintBody.suggestion.source).toBe('learned_rule');
      expect(categoryHintBody.suggestion.categoryId).toBe(expenseCategory.id);
      expect(categoryHintBody.suggestion.supportCount).toBe(3);
      expect(categoryHintBody.respectSelectedCategory).toBe(expenseCategory.id);
      const conflictingCategory=categoryData.items.find((c:any)=>c.type==='expense'&&c.id!==expenseCategory.id);
      const correction=await fetch(api+assistantPath.replace('/assistant','')+'/transactions/'+learnedTransactions[0].id+'?version=1',{method:'PATCH',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({type:'expense',accountId:bank.id,categoryId:conflictingCategory.id,amount:'5.00',date:today,notes:'Coffee',merchant:'Cafe Juniper'})});
      expect(correction.status).toBe(200);
      const abstention=await post(assistantPath+'/categorize',{type:'expense',merchant:'Cafe Juniper'},cookie);
      expect((await abstention.json()).suggestion).toBeNull();
      const localForecast=await fetch(api+assistantPath+'/forecast?horizon=30',{headers});
      expect(localForecast.status).toBe(200);
      const localForecastBody=await localForecast.json();
      expect(localForecastBody.forecast.safeToSpend).toBeNull();
      expect(localForecastBody.forecast.qualityFlags.some((flag:string)=>flag.startsWith('insufficient_history:'))).toBe(true);
      const currentSession=await fetch(api+'/api/auth/get-session',{headers}).then(r=>r.json());
      const rlsRole='cb_rls_'+crypto.randomUUID().replaceAll('-','');
      await client.unsafe(`create role ${rlsRole} nologin nosuperuser nobypassrls`);
      try{
        await client.unsafe(`grant select on assistant_settings,workspace_memberships to ${rlsRole}`);
        const rlsEvidence=await client.begin(async(tx)=>{
          await tx.unsafe(`set local role ${rlsRole}`);
          await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[currentSession.user.id,personal.id]);
          const ownRows=await tx.unsafe('select user_id from assistant_settings where workspace_id=$1',[personal.id]);
          await tx.unsafe("select set_config('app.user_id','untrusted-user',true)");
          const otherUserRows=await tx.unsafe('select user_id from assistant_settings where workspace_id=$1',[personal.id]);
          await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[currentSession.user.id,'00000000-0000-4000-8000-000000000001']);
          const otherWorkspaceRows=await tx.unsafe('select user_id from assistant_settings where workspace_id=$1',[personal.id]);
          return {ownRows:ownRows.length,otherUserRows:otherUserRows.length,otherWorkspaceRows:otherWorkspaceRows.length};
        });
        expect(rlsEvidence).toEqual({ownRows:1,otherUserRows:0,otherWorkspaceRows:0});
      }finally{
        await client.unsafe(`revoke all privileges on assistant_settings,workspace_memberships from ${rlsRole}`);
        await client.unsafe(`drop role ${rlsRole}`);
      }
      await client.begin(async(tx)=>{
        await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[currentSession.user.id,personal.id]);
        await tx.unsafe("update assistant_refresh_state set checked_at='epoch' where workspace_id=$1 and user_id=current_setting('app.user_id')",[personal.id]);
      });
      await refreshStaleAssistantForecasts();
      await refreshStaleAssistantForecasts();
      const workerEvidence=await client.begin(async(tx)=>{
        await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[currentSession.user.id,personal.id]);
        const [state]=await tx.unsafe('select last_input_hash from assistant_refresh_state where workspace_id=$1',[personal.id]);
        const [runs]=await tx.unsafe("select count(*)::int as count from forecast_runs where workspace_id=$1 and user_id=current_setting('app.user_id') and input_hash=$2 and status='ready'",[personal.id,state.last_input_hash]);
        return {hash:state.last_input_hash,runCount:runs.count};
      });
      expect(workerEvidence.hash).toBeTruthy();
      expect(workerEvidence.runCount).toBe(1);

      const forecastAccountResponse=await post('/api/workspaces/'+personal.id+'/accounts',{name:'Forecast wallet',kind:'bank',openingBalance:'3000000.00'},cookie);
      expect(forecastAccountResponse.status).toBe(201);
      const forecastAccount=(await forecastAccountResponse.json()).account;
      const dueDate=new Date(today+'T00:00:00Z');dueDate.setUTCDate(dueDate.getUTCDate()+2);
      const dueOn=dueDate.toISOString().slice(0,10);
      const alertBill=await post('/api/workspaces/'+personal.id+'/bills',{name:'Large supplier',amount:'3100000.00',dueOn,frequency:'once',reminderDays:[90]},cookie);
      expect(alertBill.status).toBe(201);
      const alertBillId=(await alertBill.json()).bill.id;
      expect((await fetch(api+'/api/workspaces/'+personal.id+'/bills/'+alertBillId+'/forecast-settings',{method:'PATCH',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({paymentAccountId:forecastAccount.id})})).status).toBe(200);
      // Materialize the bill occurrence before forecasting. Creating forecast
      // events invalidates the forecast freshness marker, so doing this after
      // the refresh would correctly suppress the email until another refresh.
      await sweepBillReminders();
      expect((await fetch(api+'/api/workspaces/'+personal.id+'/notification-preferences',{method:'PUT',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({emailAssistantAlerts:true})})).status).toBe(200);
      const alertForecast=await fetch(api+assistantPath+'/forecast?horizon=30',{headers}).then(r=>r.json());
      expect(alertForecast.suggestions.some((item:any)=>item.kind==='shortfall'&&item.facts.scope==='account'&&item.facts.accountId===forecastAccount.id)).toBe(true);
      const shortfallSuggestion=alertForecast.suggestions.find((item:any)=>item.kind==='shortfall'&&item.facts.scope==='account'&&item.facts.accountId===forecastAccount.id);
      const helpfulFeedback=await fetch(api+assistantPath+'/suggestions/'+shortfallSuggestion.id+'/feedback',{method:'PATCH',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({version:shortfallSuggestion.version,action:'helpful'})});
      expect(helpfulFeedback.status).toBe(200);
      const helpfulState=await helpfulFeedback.json();
      expect(helpfulState.helpfulness).toBe('helpful');
      const snoozedFeedback=await fetch(api+assistantPath+'/suggestions/'+shortfallSuggestion.id+'/feedback',{method:'PATCH',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({version:helpfulState.version,action:'snooze',snoozeDays:7})});
      expect(snoozedFeedback.status).toBe(200);
      const snoozedState=await snoozedFeedback.json();
      expect(snoozedState.state).toBe('snoozed');
      expect(new Date(snoozedState.snoozedUntil).valueOf()).toBeGreaterThan(Date.now());
      await client.begin(async(tx)=>{
        await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[currentSession.user.id,personal.id]);
        await tx.unsafe("update assistant_refresh_state set checked_at='epoch' where workspace_id=$1 and user_id=$2",[personal.id,currentSession.user.id]);
      });
      await refreshStaleAssistantForecasts();
      const refreshedAt=await client.begin(async(tx)=>{
        await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[currentSession.user.id,personal.id]);
        const [row]=await tx.unsafe('select checked_at from assistant_refresh_state where workspace_id=$1 and user_id=$2',[personal.id,currentSession.user.id]);
        return row.checked_at;
      });
      expect(new Date(refreshedAt).valueOf()).toBeGreaterThan(Date.now()-60_000);
      await sweepBillReminders();
      const assistantAlertMail=await waitForAssistantAlert();
      expect((assistantAlertMail.To??[]).some((recipient:any)=>recipient.Address===email)).toBe(true);
      expect((assistantAlertMail.Text+'\n'+assistantAlertMail.HTML).includes('3100000')).toBe(false);
      const alertMailListing=await fetch(mailpit+'/api/v1/messages?limit=50').then(r=>r.json());
      expect(alertMailListing.messages.filter((message:any)=>message.Subject==='A cashflow update · CapyBudget'&&message.To?.some((recipient:any)=>recipient.Address===email)).length).toBe(1);
      expect((await fetch(api+'/api/workspaces/'+personal.id+'/push-subscriptions',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({endpoint:'https://fcm.googleapis.com/fcm/send/assistant-test',keys:{p256dh:'test-public-key',auth:'test-auth-secret'}})})).status).toBe(204);
      expect((await fetch(api+'/api/workspaces/'+personal.id+'/notification-preferences',{method:'PUT',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({pushAssistantAlerts:true})})).status).toBe(200);
      const fakePushPayloads:string[]=[];
      const fakePushSender=async(_subscription:{endpoint:string;keys:{p256dh:string;auth:string}},payload:string)=>{fakePushPayloads.push(payload);return {accepted:true};};
      await sweepBillReminders(new Date(),fakePushSender);
      expect(fakePushPayloads.length).toBeGreaterThan(0);
      expect(fakePushPayloads.every((payload)=>payload.includes('"url":"/assistant"')&&!payload.includes('3100000'))).toBe(true);
      const firstFakePushCount=fakePushPayloads.length;
      await sweepBillReminders(new Date(),fakePushSender);
      expect(fakePushPayloads).toHaveLength(firstFakePushCount);
      const businessWorkspaceResponse=await post('/api/workspaces',{name:'Tracking Business',kind:'business',currency:'IDR',timezone:'Asia/Jakarta'},cookie);
      expect(businessWorkspaceResponse.status).toBe(201);
      const businessWorkspace=(await businessWorkspaceResponse.json()).workspace;
      const businessAccountResponse=await post('/api/workspaces/'+businessWorkspace.id+'/accounts',{name:'Business bank',kind:'bank',openingBalance:'0.00'},cookie);
      expect(businessAccountResponse.status).toBe(201);
      const businessAccount=(await businessAccountResponse.json()).account;
      const businessCategories=await fetch(api+'/api/workspaces/'+businessWorkspace.id+'/categories',{headers}).then(r=>r.json());
      const businessIncomeCategory=businessCategories.items.find((category:any)=>category.type==='income');
      const profile=await fetch(api+'/api/workspaces/'+businessWorkspace.id+'/business-profile',{method:'PATCH',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({version:1,legalName:'Tracking Business',tradingName:'',contactEmail:email,phone:'',taxId:'',address:{street:'1 Main Street',city:'Jakarta',country:'Indonesia'}})});
      expect(profile.status).toBe(200);
      const collectionDate=new Date(today+'T00:00:00Z');collectionDate.setUTCDate(collectionDate.getUTCDate()+7);
      const invoiceDueOn=collectionDate.toISOString().slice(0,10);
      const invoiceResponse=await post('/api/workspaces/'+businessWorkspace.id+'/invoices',{issueDate:today,dueDate:invoiceDueOn,recipient:{name:'Client',email,address:{street:'2 Client Road',city:'Jakarta',country:'Indonesia'}},lines:[{description:'Consulting',quantity:'1',unitPrice:'1000'}]},cookie);
      if(!invoiceResponse.ok)throw new Error('Business invoice fixture failed: '+JSON.stringify(await invoiceResponse.json()));
      expect(invoiceResponse.status).toBe(201);
      const invoice=(await invoiceResponse.json()).invoice;
      const issuedInvoiceResponse=await post('/api/workspaces/'+businessWorkspace.id+'/invoices/'+invoice.id+'/issue',{version:invoice.version},cookie);
      expect(issuedInvoiceResponse.status).toBe(200);
      const issuedInvoice=(await issuedInvoiceResponse.json()).invoice;
      const paymentResponse=await post('/api/workspaces/'+businessWorkspace.id+'/invoices/'+invoice.id+'/payments',{amount:'400',paidOn:today,accountId:businessAccount.id,categoryId:businessIncomeCategory.id,idempotencyKey:'tracking-invoice-partial-payment'},cookie);
      expect(paymentResponse.status).toBe(200);
      const forecastCollectionSettings=await fetch(api+'/api/workspaces/'+businessWorkspace.id+'/invoices/'+invoice.id+'/collection-forecast',{method:'PATCH',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({version:issuedInvoice.version,expectedPaymentOn:invoiceDueOn,expectedAccountId:businessAccount.id})});
      expect(forecastCollectionSettings.status).toBe(200);
      const businessAssistantSettings=await fetch(api+'/api/workspaces/'+businessWorkspace.id+'/assistant/settings',{method:'PATCH',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({version:1})});
      expect(businessAssistantSettings.status).toBe(200);
      const partialInvoiceForecastResponse=await fetch(api+'/api/workspaces/'+businessWorkspace.id+'/assistant/forecast?horizon=30',{headers});
      expect(partialInvoiceForecastResponse.status).toBe(200);
      const partialInvoiceForecast=await partialInvoiceForecastResponse.json();
      expect(partialInvoiceForecast.events.find((event:any)=>event.kind==='invoice'&&event.id==='invoice:'+invoice.id)?.amount).toBe('600.0000');
      const payment=(await paymentResponse.json()).payment;
      const reversal=await post('/api/workspaces/'+businessWorkspace.id+'/invoices/'+invoice.id+'/payments/'+payment.id+'/reverse',{reason:'Test reversal',effectiveOn:today},cookie);
      expect(reversal.status).toBe(200);
      const reversedInvoiceForecast=await fetch(api+'/api/workspaces/'+businessWorkspace.id+'/assistant/forecast?horizon=30',{headers}).then(r=>r.json());
      expect(reversedInvoiceForecast.events.find((event:any)=>event.kind==='invoice'&&event.id==='invoice:'+invoice.id)?.amount).toBe('1000.0000');
      const overdueDate=new Date(today+'T00:00:00Z');overdueDate.setUTCDate(overdueDate.getUTCDate()-1);
      const overdueOn=overdueDate.toISOString().slice(0,10);
      const overdueInvoiceResponse=await post('/api/workspaces/'+businessWorkspace.id+'/invoices',{issueDate:overdueOn,dueDate:overdueOn,locale:'id',recipient:{name:'Late client',email,address:{street:'3 Client Road',city:'Jakarta',country:'Indonesia'}},lines:[{description:'Support',quantity:'1',unitPrice:'250'}]},cookie);
      expect(overdueInvoiceResponse.status).toBe(201);
      const overdueInvoice=(await overdueInvoiceResponse.json()).invoice;
      expect((await post('/api/workspaces/'+businessWorkspace.id+'/invoices/'+overdueInvoice.id+'/issue',{version:overdueInvoice.version},cookie)).status).toBe(200);
      const overdueForecast=await fetch(api+'/api/workspaces/'+businessWorkspace.id+'/assistant/forecast?horizon=30',{headers}).then(r=>r.json());
      const followupSuggestion=overdueForecast.suggestions.find((suggestion:any)=>suggestion.kind==='invoice_followup'&&suggestion.facts.invoiceId===overdueInvoice.id);
      expect(followupSuggestion).toBeDefined();
      expect(overdueForecast.uncertainReceivables.some((row:any)=>row.invoiceId===overdueInvoice.id)).toBe(true);
      const reminderProposalResponse=await post('/api/workspaces/'+businessWorkspace.id+'/assistant/suggestions/'+followupSuggestion.id+'/proposals',{actionType:'send_invoice_reminder',version:followupSuggestion.version,idempotencyKey:'tracking-invoice-reminder'},cookie);
      expect(reminderProposalResponse.status).toBe(200);
      const reminderProposal=(await reminderProposalResponse.json()).proposal;
      expect(reminderProposal.payload.outstanding).toBe('250.0000');
      const confirmationPath='/api/workspaces/'+businessWorkspace.id+'/assistant/proposals/'+reminderProposal.id+'/confirm';
      const simultaneousConfirmations=await Promise.all([post(confirmationPath,{payloadHash:reminderProposal.payloadHash},cookie),post(confirmationPath,{payloadHash:reminderProposal.payloadHash},cookie)]);
      expect(simultaneousConfirmations.map((response)=>response.status)).toEqual([200,200]);
      const confirmationResults=await Promise.all(simultaneousConfirmations.map((response)=>response.json()));
      expect(confirmationResults.filter((result:any)=>result.queued).length).toBe(1);
      expect(confirmationResults.filter((result:any)=>result.replayed).length).toBe(1);
      const reminderReplay=await post(confirmationPath,{payloadHash:reminderProposal.payloadHash},cookie);
      expect((await reminderReplay.json()).replayed).toBe(true);
      await dispatchInvoiceDeliveries();
      const reminderInvoiceNumber=reminderProposal.payload.invoiceNumber;
      const reminderMail=await waitForInvoiceReminder(reminderInvoiceNumber,`Pengingat pembayaran faktur Anda · ${reminderInvoiceNumber}`);
      expect((reminderMail.To??[]).some((recipient:any)=>recipient.Address===email)).toBe(true);
      expect((reminderMail.Text+'\n'+reminderMail.HTML).includes(`faktur ${reminderInvoiceNumber} masih memiliki saldo IDR 250.0000`)).toBe(true);
      const reminderMessages=await fetch(mailpit+'/api/v1/messages?limit=50').then(r=>r.json());
      expect((reminderMessages.messages??[]).filter((message:any)=>message.Subject===`Pengingat pembayaran faktur Anda · ${reminderInvoiceNumber}`&&JSON.stringify(message).includes(email)).length).toBe(1);
      const reminderOutboxCount=await client.begin(async(tx)=>{
        await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[currentSession.user.id,businessWorkspace.id]);
        const [count]=await tx.unsafe("select count(*)::int as count from invoice_deliveries where workspace_id=$1 and invoice_id=$2 and purpose='reminder'",[businessWorkspace.id,overdueInvoice.id]);
        return count.count;
      });
      expect(reminderOutboxCount).toBe(1);
      const assistantExport=await fetch(api+assistantPath+'/export',{headers});
      expect(assistantExport.status).toBe(200);
      expect(assistantExport.headers.get('cache-control')).toContain('no-store');
      const exportBody=await assistantExport.json();
      expect(exportBody.format).toBe('capybudget-assistant-export-v1');
      expect(exportBody.data.forecast_runs.length).toBeGreaterThan(0);
      await client.begin(async(tx)=>{
        await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[currentSession.user.id,personal.id]);
        await tx.unsafe("update finance_notifications set push_sent_at=null where workspace_id=$1 and user_id=$2 and kind in ('cashflow-shortfall','cashflow-low-balance','assistant-invoice-followup')",[personal.id,currentSession.user.id]);
      });
      const liveSettings=await fetch(api+assistantPath+'/settings',{headers}).then(r=>r.json());
      const revoke=await fetch(api+assistantPath+'/settings',{method:'PATCH',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({version:liveSettings.settings.version,sourcePermissions:{history:false}})});
      expect(revoke.status).toBe(200);
      await sweepBillReminders(new Date(),fakePushSender);
      expect(fakePushPayloads).toHaveLength(firstFakePushCount);
      const currentSettings=await fetch(api+assistantPath+'/settings',{headers}).then(r=>r.json());
      const erase=await fetch(api+assistantPath+'/data',{method:'DELETE',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({confirmation:'DELETE_ASSISTANT_DATA',consentVersion:currentSettings.settings.consentVersion})});
      expect(erase.status).toBe(200);
      const erasedState=await client.begin(async(tx)=>{
        await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[currentSession.user.id,personal.id]);
        const [counts]=await tx.unsafe('select (select count(*)::int from assistant_settings where workspace_id=$1 and user_id=$2) as settings,(select count(*)::int from forecast_runs where workspace_id=$1 and user_id=$2) as runs,(select count(*)::int from assistant_suggestions where workspace_id=$1 and user_id=$2) as suggestions,(select count(*)::int from category_feedback where workspace_id=$1 and user_id=$2) as feedback',[personal.id,currentSession.user.id]);
        return counts;
      });
      expect(erasedState).toEqual({settings:0,runs:0,suggestions:0,feedback:0});
      const afterDeleteSettings=await fetch(api+assistantPath+'/settings',{headers}).then(r=>r.json());
      expect(afterDeleteSettings.configured).toBe(false);
      expect((await fetch(api+assistantPath+'/category-rules',{headers}).then(r=>r.json())).items).toEqual([]);
      expect((await fetch(api+assistantPath+'/forecast?horizon=30',{headers})).status).toBe(403);
      const remainedDeleted=await client.begin(async(tx)=>{
        await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[currentSession.user.id,personal.id]);
        const [count]=await tx.unsafe('select count(*)::int as count from assistant_settings where workspace_id=$1 and user_id=$2',[personal.id,currentSession.user.id]);
        return count.count;
      });
      expect(remainedDeleted).toBe(0);
  },120000);
});
