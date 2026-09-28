import { describe, expect, test } from 'bun:test';

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
async function waitForOtp(){
  const until=Date.now()+15000;
  while(Date.now()<until){
    const listing=await fetch(mailpit+'/api/v1/messages?limit=30').then(r=>r.json());
    for(const m of listing.messages??[]){
      if(m.Subject!=='Your CapyBudget verification code'||!JSON.stringify(m).includes(email))continue;
      const mail=await fetch(mailpit+'/api/v1/message/'+m.ID).then(r=>r.json());
      const otp=(mail.Text+'\n'+mail.HTML).match(/\b\d{6}\b/)?.[0];
      if(otp)return otp;
    }
    await Bun.sleep(200);
  }
  throw new Error('Mailpit did not receive the verification code');
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
      const transfer=await create({type:'transfer',accountId:bank.id,destinationAccountId:cash.id,amount:'200.00',date:'2026-09-03',notes:'Cash withdrawal'},crypto.randomUUID());
      expect(transfer.status).toBe(201);
      const transferRecord=await transfer.json();
      const rows=await fetch(api+'/api/workspaces/'+personal.id+'/accounts',{headers}).then(r=>r.json());
      expect(rows.items.find((a:any)=>a.id===bank.id).balance).toBe('1200.0000');
      expect(rows.items.find((a:any)=>a.id===cash.id).balance).toBe('200.0000');
      const summary=await fetch(api+'/api/workspaces/'+personal.id+'/summary?from=2026-09-01&to=2026-09-30',{headers}).then(r=>r.json());
      expect(summary.income).toBe('500.0000');
      expect(summary.expense).toBe('100.0000');
      const filtered=await fetch(api+'/api/workspaces/'+personal.id+'/transactions?accountIds='+bank.id+'&categoryIds='+expenseCategory.id+'&tagIds='+tag.id+'&minAmount=90&maxAmount=110',{headers}).then(r=>r.json());
      expect(filtered.items.length).toBe(1);
      expect(filtered.items[0].id).toBe((await expenseResult.json()).id);
      const firstPage=await fetch(api+'/api/workspaces/'+personal.id+'/transactions?limit=2&sort=date&direction=asc',{headers}).then(r=>r.json());
      expect(firstPage.items.length).toBe(2);
      expect(firstPage.nextCursor).toBeTruthy();
      const secondPage=await fetch(api+'/api/workspaces/'+personal.id+'/transactions?limit=2&sort=date&direction=asc&cursor='+encodeURIComponent(firstPage.nextCursor),{headers}).then(r=>r.json());
      expect(secondPage.items.length).toBe(1);
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
      expect(afterRetry.items.find((a:any)=>a.id===bank.id).balance).toBe('1000.0000');
      const deleted=await fetch(api+'/api/workspaces/'+personal.id+'/transactions/'+transferRecord.id+'?version=1',{method:'DELETE',headers});
      expect(deleted.status).toBe(204);
      const afterDelete=await fetch(api+'/api/workspaces/'+personal.id+'/accounts',{headers}).then(r=>r.json());
      expect(afterDelete.items.find((a:any)=>a.id===bank.id).balance).toBe('1200.0000');

      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date());
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
      expect(finalBalances.items.find((a:any)=>a.id===bank.id).balance).toBe('1225.0000');
  },45000);
});
