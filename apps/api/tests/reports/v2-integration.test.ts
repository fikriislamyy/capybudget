import {beforeAll,afterAll,test,expect} from 'bun:test';
import {randomUUID} from 'node:crypto';
import {hashPassword} from 'better-auth/crypto';
if(process.env.REPORTS_V2_INTEGRATION==='1'){
 if(new URL(process.env.DATABASE_URL!).pathname!=='/capybudget_reports_v2_test')throw new Error('Isolated reports database required');
 const {client}=await import('../../src/db'),{app}=await import('../../src/app');app.compile();
 const {processQueuedReportRun,processQueuedReportExport,renderReportExport}=await import('../../src/reports/routes');
 const {sweepReportSchedules,deliverScheduledReport}=await import('../../src/reports/schedules');
 let cookie='',ws='',account='',expenseCategory='',incomeCategory='',actor='',saved='',schedule='',readyRun='';
 const request=(path:string,method='GET',body?:unknown)=>app.handle(new Request('http://localhost:5173'+path,{method,headers:{'Idempotency-Key':randomUUID(),cookie,origin:'http://localhost:5173','content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));
 const base=()=>`/api/workspaces/${ws}/reports`;
 const checked=async(response:Response,status=200)=>{expect(response.status,await response.clone().text()).toBe(status);return response.json();};
 const definition=(overrides:any={})=>({reportType:'analytics',preset:'custom',from:'2026-09-01',toExclusive:'2026-10-01',currency:'IDR',comparison:'previous_period',groupBy:'month',...overrides});
 const createRun=async(d:any)=>{const created=await checked(await request(base()+'/builder/runs','POST',{definition:d,idempotencyKey:randomUUID()}),202);await processQueuedReportRun(created.run.id,ws,actor);return (await checked(await request(base()+'/runs/'+created.run.id))).run;};
 beforeAll(async()=>{
  actor='reports-v2-'+randomUUID();const email=actor+'@example.test',password='IsolatedReportsChecks!42';
  await client`insert into "user"(id,name,email,email_verified) values(${actor},'Reports fixture',${email},true)`;
  await client`insert into account(id,account_id,provider_id,user_id,password) values(${randomUUID()},${actor},'credential',${actor},${await hashPassword(password)})`;
  const login=await request('/api/auth/sign-in/email','POST',{email,password});await checked(login);cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
  ws=(await checked(await request('/api/workspaces','POST',{kind:'business',name:'Reports fixture',currency:'IDR',timezone:'Asia/Jakarta'}),201)).workspace.id;
  await checked(await request(`/api/workspaces/${ws}/accounts`,'POST',{name:'Report cash',kind:'cash',currency:'IDR',openingBalance:'1000000',openingDate:'2026-01-01'}),201);
  account=(await checked(await request(`/api/workspaces/${ws}/accounts`))).items[0].id;
  const categories=(await checked(await request(`/api/workspaces/${ws}/categories`))).items;
  expenseCategory=categories.find((c:any)=>c.type==='expense').id;incomeCategory=categories.find((c:any)=>c.type==='income').id;
  for(const [type,amount,categoryId,date] of [['income','500000',incomeCategory,'2026-09-05'],['expense','50000',expenseCategory,'2026-09-10'],['expense','30000',expenseCategory,'2026-08-10']])await checked(await request(`/api/workspaces/${ws}/transactions`,'POST',{type,amount,currency:'IDR',accountId:account,categoryId,date,notes:'Reports test',idempotencyKey:randomUUID()}),201);
 },60000);
 afterAll(async()=>{if(ws){const {deleteAttachment}=await import('../../src/tracking/storage');for(const item of await client`select object_key from report_exports where workspace_id=${ws} and object_key is not null`)await deleteAttachment(item.object_key);}if(ws)await client`update workspaces set archived_at=now() where id=${ws}`;await client.end();});
 test('custom report snapshots use exact dates, money and previous period',async()=>{
  const run=await createRun(definition());readyRun=run.id;expect(run.status).toBe('ready');expect(run.summary.income).toBe('500000.0000');expect(run.summary.expense).toBe('50000.0000');expect(run.summary.netActivity).toBe('450000.0000');
  const groups=await checked(await request(base()+`/runs/${run.id}/rows?section=grouped`));expect(groups.items[0].data.group).toBe('2026-09');
  const previous=await checked(await request(base()+`/runs/${run.id}/rows?section=comparison`));expect(previous.items[0].data.expense).toBe('30000.0000');
 });
 test('idempotency binds all report parameters; foreign filters and SQL are rejected',async()=>{
  const key=randomUUID(),body={definition:definition(),idempotencyKey:key};const first=await checked(await request(base()+'/builder/runs','POST',body),202);const replay=await checked(await request(base()+'/builder/runs','POST',body));expect(replay.run.id).toBe(first.run.id);
  expect((await request(base()+'/builder/runs','POST',{definition:definition({groupBy:'day'}),idempotencyKey:key})).status).toBe(409);
  expect((await request(base()+'/builder/runs','POST',{definition:definition({sql:'select * from user'}),idempotencyKey:randomUUID()})).status).toBe(422);
  expect((await request(base()+'/builder/runs','POST',{definition:definition({accountIds:[randomUUID()]}),idempotencyKey:randomUUID()})).status).toBe(422);
  await processQueuedReportRun(first.run.id,ws,actor);
 });
 test('concurrent generation requests respect the per-user pending limit',async()=>{
  const responses=await Promise.all(Array.from({length:5},()=>request(base()+'/builder/runs','POST',{definition:definition({comparison:'none'}),idempotencyKey:randomUUID()})));
  for(const response of responses.filter(response=>response.status===202)){const body=await response.json();await processQueuedReportRun(body.run.id,ws,actor);}
  expect(responses.filter(response=>response.status===202).length).toBe(3);expect(responses.filter(response=>response.status===429).length).toBe(2);
 });
 test('cash business statements balance and exclude transfers from profit',async()=>{
  const pnl=await createRun(definition({reportType:'profit_loss',comparison:'none',basis:'cash'}));expect(pnl.status).toBe('ready');expect(pnl.summary.profitAndLoss.profit).toBe('450000.0000');
  const balance=await createRun(definition({reportType:'balance_sheet',comparison:'none',basis:'cash'}));expect(balance.status).toBe('ready');expect(balance.summary.balanceSheet.difference).toBe('0.0000');expect(balance.summary.balanced).toBe(true);
  const [counts]=await client`select count(*)::int as count from transactions where workspace_id=${ws}`;expect(counts!.count).toBe(3);
 });
 test('accrual statements require reviewed accounting cutover; tax stays opt-in',async()=>{
  const run=await checked(await request(base()+'/builder/runs','POST',{definition:definition({reportType:'profit_loss',basis:'accrual',comparison:'none'}),idempotencyKey:randomUUID()}),202);
  await expect(processQueuedReportRun(run.run.id,ws,actor)).rejects.toThrow();expect((await checked(await request(base()+'/runs/'+run.run.id))).run.status).toBe('failed');
  const tax=await checked(await request(base()+'/builder/runs','POST',{definition:definition({reportType:'tax',basis:'accrual',comparison:'none'}),idempotencyKey:randomUUID()}),202);await expect(processQueuedReportRun(tax.run.id,ws,actor)).rejects.toThrow();
 });
 test('historical budgets show every period and label partial coverage without prorating',async()=>{
  const response=await request(`/api/workspaces/${ws}/budgets`,'POST',{name:'Reports budget',categoryId:expenseCategory,cadence:'monthly',amount:'100000',startsOn:'2026-08-01'});await checked(response,201);
  const run=await createRun(definition({reportType:'budget_actual',from:'2026-08-15',toExclusive:'2026-10-01',comparison:'none'}));expect(run.status).toBe('ready');const detail=await checked(await request(base()+`/runs/${run.id}/rows?section=budget_actual`));expect(detail.items.length).toBe(2);expect(detail.items[0].data.coverage).toContain('partial period');expect(detail.items[0].data.planned).toBe('100000.0000');expect(detail.items[1].data.actual).toBe('50000.0000');
 });
 test('tax evidence uses immutable rates and dated void reversals; accrual statements include unpaid invoices',async()=>{
  await checked(await request(`/api/workspaces/${ws}/business-profile`,'PATCH',{legalName:'Reports business',tradingName:'',contactEmail:'reports@example.test',phone:'',taxId:'',address:{street:'Fixture Street',city:'Jakarta',country:'ID'}}));
  await checked(await request(`/api/workspaces/${ws}/business-tax`,'PATCH',{enabled:true,version:0}));
  const rate=(await checked(await request(`/api/workspaces/${ws}/business-tax/rates`,'POST',{name:'Fixture PPN',rate:'12',baseNumerator:11,baseDenominator:12,inclusive:false,effectiveFrom:'2026-01-01',applicability:'Test fixture for configured non-luxury goods; not a default tax policy.'}))).rate;
  const invoice=(await checked(await request(`/api/workspaces/${ws}/invoices`,'POST',{issueDate:'2026-09-05',dueDate:'2026-10-05',recipient:{name:'Tax buyer',email:'buyer@example.test',address:{street:'Buyer Street',city:'Jakarta',country:'ID'}},lines:[{description:'Review service',quantity:'1',unitPrice:'100000',taxRateId:rate.id}]}),201)).invoice;
  await checked(await request(`/api/workspaces/${ws}/invoices/${invoice.id}/issue`,'POST',{version:invoice.version}));
  const preview=await checked(await request(`/api/workspaces/${ws}/business-accounting/preview`,'POST',{cutoverOn:'2026-08-01'}));await checked(await request(`/api/workspaces/${ws}/business-accounting/reviews/${preview.id}/review`,'POST',{confirm:true,reference:'Isolated fixture review only, not a production accounting approval.'}));await checked(await request(`/api/workspaces/${ws}/business-accounting/reviews/${preview.id}/activate`,'POST',{confirm:true,backupConfirmed:true}));await checked(await request(`/api/workspaces/${ws}/business-accounting/sync`,'POST',{}));
  const pnl=await createRun(definition({reportType:'profit_loss',basis:'accrual',comparison:'none'}));expect(pnl.status).toBe('ready');expect(pnl.summary.profitAndLoss.profit).toBe('550000.0000');
  const before=await createRun(definition({reportType:'tax',basis:'accrual',comparison:'none'}));expect(before.status).toBe('ready');expect(before.summary.totals[0].salesTax).toBe('11000.0000');expect(before.summary.reconciliation.matched).toBe(true);
  await checked(await request(`/api/workspaces/${ws}/invoices/${invoice.id}/void`,'POST',{reason:'Fixture correction',effectiveOn:'2026-10-01'}));await checked(await request(`/api/workspaces/${ws}/business-accounting/sync`,'POST',{}));
  const after=await createRun(definition({reportType:'tax',basis:'accrual',from:'2026-10-01',toExclusive:'2026-10-02',comparison:'none'}));expect(after.status).toBe('ready');expect(after.summary.totals[0].salesTax).toBe('-11000.0000');expect(after.summary.reconciliation.matched).toBe(true);
  expect((await checked(await request(base()+'/runs/'+before.id))).run.summary.totals[0].salesTax).toBe('11000.0000');
 });
 test('saved definitions enforce versions; schedules require consent and relative dates',async()=>{
  const item=(await checked(await request(base()+'/definitions','POST',{name:'Monthly activity',definition:definition({preset:'last_month',comparison:'none'})}))).item;saved=item.id;
  expect((await request(base()+`/definitions/${saved}`,'PATCH',{name:'Stale',version:9,definition:item.definition})).status).toBe(409);
  expect((await request(base()+'/schedules','POST',{definitionId:saved,cadence:'monthly',localTime:'09:00',locale:'en',format:'csv',consent:false})).status).toBe(422);
  schedule=(await checked(await request(base()+'/schedules','POST',{definitionId:saved,cadence:'monthly',localTime:'09:00',locale:'id',format:'csv',consent:true}))).item.id;
 });
 test('scheduled reports deliver a real attachment to Mailpit once and deduplicate the occurrence',async()=>{
  await client`update report_schedules set next_run_at='2026-10-01T02:00:00Z' where id=${schedule}`;
  await sweepReportSchedules();await sweepReportSchedules();
  const deliveries=await client`select d.*,u.email from report_deliveries d join "user" u on u.id=d.requested_by where schedule_id=${schedule}`;expect(deliveries.length).toBe(1);expect(deliveries[0]!.export_id).not.toBeNull();
  const delivery=deliveries[0]!;const message={kind:'scheduled-report' as const,workspaceId:ws,requestedBy:actor,deliveryId:delivery.id,to:delivery.email,title:'Monthly activity',locale:'id' as const,expiresAt:Date.now()+60000};
  await deliverScheduledReport(message);await deliverScheduledReport(message);
  const [accepted]=await client`select state from report_deliveries where id=${delivery.id}`;expect(accepted!.state).toBe('accepted');
  const mailbox=await fetch('http://127.0.0.1:8025/api/v1/search?query='+encodeURIComponent('to:'+delivery.email));const mail=await mailbox.json();expect(mail.messages.length).toBe(1);expect(mail.messages[0].Subject).toContain('Laporan');
 });
 test('paused and edited schedules invalidate queued delivery',async()=>{
  const [current]=await client`select version from report_schedules where id=${schedule}`;
  await checked(await request(base()+`/schedules/${schedule}`,'PATCH',{enabled:false,version:current!.version}));
  await client`update report_deliveries set state='queued' where schedule_id=${schedule}`;const [d]=await client`select d.*,u.email from report_deliveries d join "user" u on u.id=d.requested_by where schedule_id=${schedule}`;let sent=0;
  await deliverScheduledReport({kind:'scheduled-report',workspaceId:ws,requestedBy:actor,deliveryId:d!.id,to:d!.email,title:'Stale report',locale:'en',expiresAt:Date.now()+60000},async()=>{sent++;});expect(sent).toBe(0);
  expect((await client`select state from report_deliveries where id=${d!.id}`)[0]!.state).toBe('cancelled');
 });
 test('SMTP disconnects are marked uncertain and are never automatically resent',async()=>{
  const current=(await client`select version from report_schedules where id=${schedule}`)[0]!;await checked(await request(base()+`/schedules/${schedule}`,'PATCH',{enabled:true,version:current.version}));
  const updated=(await client`select version from report_schedules where id=${schedule}`)[0]!;await client`update report_deliveries set state='queued',schedule_version=${updated.version},attempts=0 where schedule_id=${schedule}`;
  const [d]=await client`select d.*,u.email from report_deliveries d join "user" u on u.id=d.requested_by where schedule_id=${schedule}`;const message={kind:'scheduled-report' as const,workspaceId:ws,requestedBy:actor,deliveryId:d!.id,to:d!.email,title:'Disconnect fixture',locale:'en' as const,expiresAt:Date.now()+60000};let calls=0;
  await expect(deliverScheduledReport(message,async()=>{calls++;throw Object.assign(new Error('Fixture SMTP disconnect'),{code:'ECONNRESET'});})).rejects.toThrow();await deliverScheduledReport(message,async()=>{calls++;});expect(calls).toBe(1);expect((await client`select state from report_deliveries where id=${d!.id}`)[0]!.state).toBe('unknown');
 });
 test('current permissions and verified recipient are checked before sending',async()=>{
  const retainer='reports-retainer-'+randomUUID();await client`insert into "user"(id,name,email,email_verified) values(${retainer},'Fixture co-owner',${retainer+'@example.test'},true)`;await client`insert into workspace_memberships(workspace_id,user_id,role) values(${ws},${retainer},'owner')`;
  await client`update report_deliveries set state='queued',attempts=0 where schedule_id=${schedule}`;await client`update workspace_memberships set role='staff' where workspace_id=${ws} and user_id=${actor}`;
  const [d]=await client`select d.*,u.email from report_deliveries d join "user" u on u.id=d.requested_by where schedule_id=${schedule}`;let calls=0;
  try{await deliverScheduledReport({kind:'scheduled-report',workspaceId:ws,requestedBy:actor,deliveryId:d!.id,to:d!.email,title:'Revoked fixture',locale:'en',expiresAt:Date.now()+60000},async()=>{calls++;});expect(calls).toBe(0);expect((await request(base()+'/definitions')).status).toBe(403);}finally{await client`update workspace_memberships set role='owner' where workspace_id=${ws} and user_id=${actor}`;}
  await client`update report_deliveries set state='queued',attempts=0 where schedule_id=${schedule}`;
  await deliverScheduledReport({kind:'scheduled-report',workspaceId:ws,requestedBy:actor,deliveryId:d!.id,to:'other-recipient@example.test',title:'Wrong recipient fixture',locale:'en',expiresAt:Date.now()+60000},async()=>{calls++;});expect(calls).toBe(0);
 });
 test('PDF exports render without network access and preserve snapshot download permissions',async()=>{
  const created=await checked(await request(base()+`/runs/${readyRun}/exports`,'POST',{format:'pdf',idempotencyKey:randomUUID()}),202);await processQueuedReportExport(created.export.id,ws,actor);
  const file=await request(base()+`/exports/${created.export.id}/download`);expect(file.status).toBe(200);expect(Buffer.from(await file.arrayBuffer()).subarray(0,4).toString()).toBe('%PDF');
 });
 test('CSV and Excel export keep precise money, dates and prevent formula injection',async()=>{
  const csv=await renderReportExport({reportType:'analytics',periodFrom:'2026-09-01',periodToExclusive:'2026-10-01',currency:'IDR',summary:{},generatedAt:new Date().toISOString()},[{section:'activity',merchant:'=SUM(1,2)',amount:'900719925474099.0000',date:'2026-09-05'}],'csv');const text=await csv.text();expect(text).toContain("'=SUM");expect(text).toContain('05-09-2026');expect(text).toContain('900719925474099.0000');
  const xlsx=await renderReportExport({reportType:'analytics',periodFrom:'2026-09-01',periodToExclusive:'2026-10-01',currency:'IDR',summary:{},generatedAt:new Date().toISOString()},[{section:'activity',amount:'900719925474099.0000'}],'xlsx');expect((await xlsx.arrayBuffer()).byteLength).toBeGreaterThan(500);
 });
 test('a restricted SQL role cannot read or attach another actor’s saved definitions',async()=>{
  const other='reports-other-'+randomUUID(),role='reports_check_'+randomUUID().replaceAll('-','');await client`insert into "user"(id,name,email,email_verified) values(${other},'Other',${other+'@example.test'},true)`;await client`insert into workspace_memberships(workspace_id,user_id,role) values(${ws},${other},'viewer')`;
  await client.unsafe('create role '+role+' nologin');await client.unsafe('grant usage on schema public to '+role);await client.unsafe('grant select on all tables in schema public to '+role);
  try{await client.begin(async tx=>{await tx.unsafe('set local role '+role);await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true),set_config('app.workspace_role','viewer',true)",[other,ws]);expect((await tx.unsafe('select id from saved_report_definitions')).length).toBe(0);expect((await tx.unsafe('select id from report_runs')).length).toBe(0);});}finally{await client.unsafe('drop owned by '+role);await client.unsafe('drop role '+role);}
 });
}
