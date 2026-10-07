import {test,expect,beforeAll,afterAll} from 'bun:test';
import {randomUUID} from 'node:crypto';
import {hashPassword} from 'better-auth/crypto';
if(process.env.ASSISTANT_V2_INTEGRATION==='1'){
 if(new URL(process.env.DATABASE_URL!).pathname!=='/capybudget_assistant_v2_test')throw new Error('Isolated assistant database required');
 const {client}=await import('../../src/db'),{app}=await import('../../src/app');app.compile();let cookie='',ws='',account='',category='',actorId='',calls=0,lastProviderPayload='';
 const originalFetch=globalThis.fetch;let responseValue:unknown={tool:'spending',category:'',period:'this_month'};
 globalThis.fetch=(async(input:any,init?:any)=>{if((String(input).startsWith('https://api.groq.com/openai/v1/')||String(input).startsWith('https://api.meta.ai/v1/'))){calls++;lastProviderPayload=String(init?.body??'');return String(input).endsWith('/audio/transcriptions')?Response.json({text:(responseValue as any).transcript}):String(input).endsWith('/asr/transcribe')?Response.json(responseValue):Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(responseValue)}}]});}return originalFetch(input,init);}) as typeof fetch;
 const request=(path:string,method='GET',body?:unknown)=>app.handle(new Request('http://localhost:5173'+path,{method,headers:{cookie,origin:'http://localhost:5173','content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));const base=()=>'/api/workspaces/'+ws+'/assistant';
 beforeAll(async()=>{await client`update workspaces set archived_at=now() where owner_user_id like 'assistant-v2-%' and name='Assistant fixture' and archived_at is null`;const id='assistant-v2-'+randomUUID(),email=id+'@example.test',password='IsolatedAssistantChecks!42';actorId=id;await client`insert into "user"(id,name,email,email_verified) values(${id},'Assistant fixture',${email},true)`;await client`insert into account(id,account_id,provider_id,user_id,password) values(${randomUUID()},${id},'credential',${id},${await hashPassword(password)})`;
  const login=await request('/api/auth/sign-in/email','POST',{email,password});expect(login.status,await login.clone().text()).toBe(200);cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
  const created=await request('/api/workspaces','POST',{kind:'business',name:'Assistant fixture',currency:'IDR',timezone:'Asia/Jakarta'});expect(created.status,await created.clone().text()).toBe(201);ws=(await created.json()).workspace.id;
  const added=await request('/api/workspaces/'+ws+'/accounts','POST',{name:'Fixture cash',kind:'cash',currency:'IDR',openingBalance:'1000000',openingDate:'2026-01-01'});expect(added.status,await added.clone().text()).toBe(201);const accounts=await (await request('/api/workspaces/'+ws+'/accounts')).json();account=accounts.items[0].id;const cats=await (await request('/api/workspaces/'+ws+'/categories')).json();category=cats.items.find((c:any)=>c.type==='expense').id;
  await client`update accounts set opening_date='2026-01-01' where workspace_id=${ws}`;
  const settings=await request(base()+'/settings','PATCH',{version:1,sourcePermissions:{history:true,merchant:true,goals:true},accounts:accounts.items.map((a:any)=>({id:a.id,included:true,allowExternalAi:true,lowBalanceThreshold:'0',protectedAmount:'0'}))});expect(settings.status,await settings.clone().text()).toBe(200);
 },30000);
 afterAll(async()=>{globalThis.fetch=originalFetch;if(ws)await client`update workspaces set archived_at=now() where id=${ws}`;await client.end();});
 test('analytics is local and safe without external consent',async()=>{const before=calls,r=await request(base()+'/v2/analytics');expect(r.status,await r.clone().text()).toBe(200);expect(calls).toBe(before);expect((await r.json()).comparison).not.toBeNull();});
 test('provider is never called without consent',async()=>{const before=calls,r=await request(base()+'/v2/chat','POST',{text:'How much did I spend?',requestKey:randomUUID()});expect(r.status).toBe(403);expect(calls).toBe(before);});
 test('chat is grounded in local facts and retries call the provider once',async()=>{const prefs=await (await request(base()+'/settings')).json();const enabled=await request(base()+'/settings','PATCH',{version:prefs.settings.version,externalAiEnabled:true,externalAiProvider:'groq'});expect(enabled.status,await enabled.clone().text()).toBe(200);const body={text:'How much did I spend this month?',requestKey:randomUUID()},before=calls,r=await request(base()+'/v2/chat','POST',body);expect(r.status,await r.clone().text()).toBe(200);const answer=await r.json();expect(answer.facts.amount).toBe('0.0000');expect(lastProviderPayload).not.toContain('Fixture cash');expect(lastProviderPayload).not.toContain(ws);expect(lastProviderPayload).not.toContain(account);const retry=await request(base()+'/v2/chat','POST',body);expect(await retry.json()).toEqual(answer);expect(calls).toBe(before+1);});
 test('colloquial purchase messages propose entry instead of reporting zero spending',async()=>{
  responseValue={tool:'spending',category:'Point Cofee Indomaret',period:'this_month'};const text='capy, gue abis transaksi 50k idr di Point Cofee Indomaret menggunakan BCA',before=calls;
  const [countBefore]=await client`select count(*)::int as count from transactions where workspace_id=${ws}`;
  const response=await request(base()+'/v2/chat','POST',{text,locale:'id',requestKey:randomUUID()});expect(response.status,await response.clone().text()).toBe(200);expect(await response.json()).toMatchObject({tool:'transaction_entry',facts:null,proposal:{kind:'review_transaction_entry',text},message:expect.stringContaining('Belum ada transaksi yang disimpan')});expect(calls).toBe(before);
  const [countAfter]=await client`select count(*)::int as count from transactions where workspace_id=${ws}`;expect(countAfter!.count).toBe(countBefore!.count);
 });
 test('unrecognized tools and cross-workspace requests cannot access data',async()=>{responseValue={tool:'sql',category:'',period:'this_month'};const r=await request(base()+'/v2/chat','POST',{text:'select secrets',requestKey:randomUUID()});expect(r.status).toBe(503);expect((await request('/api/workspaces/'+randomUUID()+'/assistant/v2/analytics')).status).toBe(404);});
 test('entry review is not a posting; confirmation is idempotent',async()=>{responseValue={type:'expense',amountToken:'45k',currency:'IDR',dateToken:'today',accountName:'',categoryName:'',merchant:''};const r=await request(base()+'/v2/entry','POST',{text:'lunch 45k today',requestKey:randomUUID()});expect(r.status,await r.clone().text()).toBe(200);const draft=await r.json();const [before]=await client`select count(*)::int as count from transactions where workspace_id=${ws}`;
  expect(draft.fields.amount).toBe('45000.0000');const body={confirmation:'CREATE_TRANSACTION',version:draft.version,fields:{...draft.fields,accountId:account,categoryId:category,date:'2026-10-06',type:'expense'}};const saved=await request(base()+'/v2/entry/'+draft.id+'/confirm','POST',body);expect(saved.status,await saved.clone().text()).toBe(200);const retry=await request(base()+'/v2/entry/'+draft.id+'/confirm','POST',body);expect((await retry.json()).transactionId).toBe((await saved.json()).transactionId);const [after]=await client`select count(*)::int as count from transactions where workspace_id=${ws}`;expect(after!.count).toBe(before!.count+1);
 });
 test('revoking consent removes conversation history and prevents new provider calls',async()=>{const prefs=await (await request(base()+'/settings')).json();const changed=await request(base()+'/settings','PATCH',{version:prefs.settings.version,externalAiEnabled:false});expect(changed.status,await changed.clone().text()).toBe(200);expect((await (await request(base()+'/v2/conversations')).json()).items).toEqual([]);const before=calls;expect((await request(base()+'/v2/chat','POST',{text:'spend',requestKey:randomUUID()})).status).toBe(403);expect(calls).toBe(before);});
 test('schedule validation and stale version do not create duplicate schedules',async()=>{const body={version:0,enabled:true,cadence:'weekly',nudgeFrequency:'off',channels:['in_app'],sendTime:'09:00',quietStart:'21:00',quietEnd:'08:00'},r=await request(base()+'/v2/summary-schedule','PUT',body);expect(r.status,await r.clone().text()).toBe(200);expect((await request(base()+'/v2/summary-schedule','PUT',body)).status).toBe(409);const summary=await request(base()+'/v2/summaries');expect(summary.status,await summary.clone().text()).toBe(200);});
 test('scenarios are saved comparisons with an unchanged ledger and stale sources are rejected',async()=>{const response=await request(base()+'/forecast?horizon=30');expect(response.status,await response.clone().text()).toBe(200);const baseForecast=await response.json();const [before]=await client`select count(*)::int as count from transactions where workspace_id=${ws}`;const result=await request(base()+'/v2/scenarios','POST',{baseRunId:baseForecast.run.id,name:'Laptop idea',overrides:[{kind:'purchase',accountId:account,date:baseForecast.forecast.asOfDate,amount:'10'}]});expect(result.status,await result.clone().text()).toBe(200);const [after]=await client`select count(*)::int as count from transactions where workspace_id=${ws}`;expect(after!.count).toBe(before!.count);const stored=(await (await request(base()+'/v2/scenarios')).json()).items;expect(stored.length).toBe(1);expect(stored[0].stale).toBe(false);await client`update assistant_account_settings set protected_amount=100 where workspace_id=${ws} and account_id=${account}`;const stale=await request(base()+'/v2/scenarios','POST',{baseRunId:baseForecast.run.id,name:'Stale idea',overrides:[{kind:'purchase',accountId:account,date:baseForecast.forecast.asOfDate,amount:'10'}]});expect(stale.status).toBe(409);});
 test('summary sweeps deduplicate periods and delivery checks the current schedule',async()=>{
  const loaded=await (await request(base()+'/v2/summaries')).json(),version=loaded.schedule.version;const changed=await request(base()+'/v2/summary-schedule','PUT',{version,enabled:true,cadence:'weekly',nudgeFrequency:'off',channels:['in_app','email'],sendTime:'00:00',quietStart:'00:00',quietEnd:'00:00'});expect(changed.status,await changed.clone().text()).toBe(200);
  const {sweepAssistantSummaries}=await import('../../src/assistant/v2/summaries');await sweepAssistantSummaries();await sweepAssistantSummaries();const rows=await client`select * from assistant_summaries where workspace_id=${ws}`;expect(rows.length).toBe(1);
  const [delivery]=await client`select d.*,n.title,n.message,u.email from finance_notification_deliveries d join finance_notifications n on n.id=d.notification_id join "user" u on u.id=d.user_id where d.workspace_id=${ws} and n.kind='assistant-summary'`;expect(delivery).toBeDefined();
  const {deliverAssistantSummary}=await import('../../src/assistant/v2/summary-email');const message={kind:'assistant-summary' as const,workspaceId:ws,userId:delivery!.user_id,deliveryId:delivery!.id,notificationId:delivery!.notification_id,to:delivery!.email,title:delivery!.title,message:delivery!.message,locale:'en' as const,expiresAt:Date.now()+60000};let sent=0;await deliverAssistantSummary(message,async()=>{sent++;});await deliverAssistantSummary(message,async()=>{sent++;});expect(sent).toBe(1);
  // Reset only this isolated delivery fixture to exercise the real local SMTP transport.
  await client`update finance_notification_deliveries set status='pending',available_at=now(),send_started_at=null where id=${delivery!.id}`;
  const {sendEmail}=await import('../../src/email/mailer');await deliverAssistantSummary(message,sendEmail);
  const mailbox=await originalFetch('http://127.0.0.1:8025/api/v1/search?query='+encodeURIComponent('to:'+delivery!.email));expect(mailbox.ok).toBe(true);const mail=await mailbox.json();expect(mail.messages.length).toBeGreaterThan(0);
  const [accepted]=await client`select status from finance_notification_deliveries where id=${delivery!.id}`;expect(accepted!.status).toBe('accepted');
  const off=await request(base()+'/v2/summary-schedule','PUT',{version:(await changed.json()).version,enabled:false,cadence:'weekly',nudgeFrequency:'off',channels:['in_app'],sendTime:'00:00',quietStart:'00:00',quietEnd:'00:00'});expect(off.status).toBe(200);const [resolved]=await client`select resolved_at from finance_notifications where id=${delivery!.notification_id}`;expect(resolved!.resolved_at).not.toBeNull();
 });

 test('a restricted SQL role cannot see another actor or reference their forecast',async()=>{
  const other='assistant-foreign-'+randomUUID(),role='assistant_check_'+randomUUID().replaceAll('-',''),run=randomUUID();
  await client`insert into "user"(id,name,email,email_verified) values(${other},'Other actor',${other+'@example.test'},true)`;await client`insert into workspace_memberships(workspace_id,user_id,role) values(${ws},${other},'viewer')`;await client`insert into assistant_settings(workspace_id,user_id) values(${ws},${other})`;await client`insert into forecast_runs(id,workspace_id,user_id,as_of_date,horizon_days,currency,engine_version,consent_version,scope_hash,input_hash,input_snapshot,status,expires_at) values(${run},${ws},${other},'2026-10-06',30,'IDR','fixture',1,'foreign','foreign','{}','ready',now()+interval '1 day')`;
  await client`insert into assistant_feedback(workspace_id,user_id,source_type,source_id,kind,fingerprint,vote,vote_at) values(${ws},${other},'suggestion',${randomUUID()},'savings','foreign','not_helpful',now())`;
  await client.unsafe('create role "'+role+'" noinherit nosuperuser nobypassrls');
  try{await client.unsafe('grant usage on schema public to "'+role+'"');await client.unsafe('grant select,insert on all tables in schema public to "'+role+'"');
   await client.begin(async tx=>{await tx.unsafe('set local role "'+role+'"');await tx`select set_config('app.user_id',${actorId},true),set_config('app.workspace_id',${ws},true),set_config('app.workspace_role','owner',true)`;expect((await tx`select id from forecast_runs where id=${run}`).length).toBe(0);expect((await tx`select id from assistant_feedback where user_id=${other}`).length).toBe(0);});
   await expect(client.begin(async tx=>{await tx.unsafe('set local role "'+role+'"');await tx`select set_config('app.user_id',${actorId},true),set_config('app.workspace_id',${ws},true),set_config('app.workspace_role','owner',true)`;await tx`insert into forecast_scenarios(workspace_id,user_id,consent_version,base_run_id,name,base_input_hash,overrides,result) values(${ws},${actorId},1,${run},'Forbidden reference','foreign','[]','{}')`;})).rejects.toMatchObject({code:'23503'});
  }finally{await client.unsafe('drop owned by "'+role+'"');await client.unsafe('drop role "'+role+'"');}
 });

 test('concurrent quota reservations permit only one final slot',async()=>{
  const prefs=await (await request(base()+'/settings')).json();expect((await request(base()+'/settings','PATCH',{version:prefs.settings.version,externalAiEnabled:true,externalAiProvider:'groq'})).status).toBe(200);const [usage]=await client`select count(*)::int as count from ai_invocations where workspace_id=${ws} and user_id=${actorId} and created_at>=date_trunc('day',now())`;const previous=process.env.ASSISTANT_DAILY_AI_LIMIT;process.env.ASSISTANT_DAILY_AI_LIMIT=String(usage!.count+1);responseValue={tool:'spending',category:'',period:'this_month'};const before=calls;
  try{const results=await Promise.all([request(base()+'/v2/chat','POST',{text:'spending this month',requestKey:randomUUID()}),request(base()+'/v2/chat','POST',{text:'spending this month',requestKey:randomUUID()})]);expect(results.map(r=>r.status).sort()).toEqual([200,429]);expect(calls).toBe(before+1);}finally{if(previous===undefined)delete process.env.ASSISTANT_DAILY_AI_LIMIT;else process.env.ASSISTANT_DAILY_AI_LIMIT=previous;}
 });
 test('revocation during a provider call discards the result before storage',async()=>{
  const previousFetch=globalThis.fetch;let release!:()=>void,started!:()=>void;const waiting=new Promise<void>(resolve=>release=resolve),providerStarted=new Promise<void>(resolve=>started=resolve);
  globalThis.fetch=(async(input:any,init?:any)=>{if(String(input).startsWith('https://api.groq.com/openai/v1/')){started();await waiting;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({tool:'spending',category:'',period:'this_month'})}}]});}return previousFetch(input,init);}) as typeof fetch;
  try{const pending=request(base()+'/v2/chat','POST',{text:'my spending',requestKey:randomUUID()});await providerStarted;const prefs=await (await request(base()+'/settings')).json();const revoked=await request(base()+'/settings','PATCH',{version:prefs.settings.version,externalAiEnabled:false});expect(revoked.status).toBe(200);release();expect((await pending).status).toBe(409);expect((await (await request(base()+'/v2/conversations')).json()).items).toEqual([]);}finally{release();globalThis.fetch=previousFetch;}
 });

 test('viewers can manage private assistant preferences but cannot confirm financial writes',async()=>{
  const keeper='assistant-owner-'+randomUUID();await client`insert into "user"(id,name,email,email_verified) values(${keeper},'Owner fixture',${keeper+'@example.test'},true)`;await client`insert into workspace_memberships(workspace_id,user_id,role) values(${ws},${keeper},'owner')`;
  await client`update workspace_memberships set role='viewer' where workspace_id=${ws} and user_id=${actorId}`;
  try{const prefs=await (await request(base()+'/settings')).json();const enabled=await request(base()+'/settings','PATCH',{version:prefs.settings.version,externalAiEnabled:true,externalAiProvider:'groq'});expect(enabled.status,await enabled.clone().text()).toBe(200);responseValue={tool:'spending',category:'',period:'this_month'};const read=await request(base()+'/v2/chat','POST',{text:'spending this month',requestKey:randomUUID()});expect(read.status,await read.clone().text()).toBe(200);expect((await request(base()+'/v2/entry/'+randomUUID()+'/confirm','POST',{confirmation:'CREATE_TRANSACTION'})).status).toBe(403);}finally{await client`update workspace_memberships set role='owner' where workspace_id=${ws} and user_id=${actorId}`;}
 });

 test('voice processing requires separate consent and returns an editable transcript',async()=>{
  const voice=()=>app.handle(new Request('http://localhost:5173'+base()+'/v2/voice',{method:'POST',headers:{cookie,origin:'http://localhost:5173','content-type':'audio/webm','idempotency-key':randomUUID()},body:new Uint8Array([1,2,3])}));
  const before=calls;expect((await voice()).status).toBe(403);expect(calls).toBe(before);const prefs=await (await request(base()+'/settings')).json();expect((await request(base()+'/settings','PATCH',{version:prefs.settings.version,voiceAiEnabled:true})).status).toBe(200);responseValue={transcript:'makan 45k hari ini'};const result=await voice();expect(result.status,await result.clone().text()).toBe(200);expect((await result.json()).transcript).toBe('makan 45k hari ini');
 });

 test('switching providers requires explicit re-consent and records text and voice model identity',async()=>{
  const before=calls;process.env.ASSISTANT_AI_PROVIDER='muse';process.env.MUSE_API_KEY='isolated-meta-key';
  try{
   const p=await (await request(base()+'/settings')).json();expect(p.settings).toMatchObject({externalAiEnabled:false,voiceAiEnabled:false,externalAiProvider:'muse',voiceInputFormat:'wav'});expect(JSON.stringify(p)).not.toContain('isolated-meta-key');
   expect((await request(base()+'/v2/chat','POST',{text:'spending',requestKey:randomUUID()})).status).toBe(403);expect((await (await request(base()+'/v2/conversations')).json()).items).toEqual([]);expect(calls).toBe(before);
   expect((await request(base()+'/settings','PATCH',{version:p.settings.version,externalAiEnabled:true,externalAiProvider:'groq'})).status).toBe(409);
   const grant=await request(base()+'/settings','PATCH',{version:p.settings.version,externalAiEnabled:true,externalAiProvider:'muse',voiceAiEnabled:true});expect(grant.status,await grant.clone().text()).toBe(200);
   responseValue={tool:'spending',category:'',period:'this_month'};const requestKey=randomUUID(),answer=await request(base()+'/v2/chat','POST',{text:'spending this month',requestKey});expect(answer.status,await answer.clone().text()).toBe(200);
   const [saved]=await client`select provider,model from ai_invocations where workspace_id=${ws} and request_key=${requestKey}`;expect(saved).toMatchObject({provider:'muse',model:'muse-spark-1.3'});
   const {encodePcmWav}=await import('../../../web/src/lib/assistant/audio');responseValue={transcript:'makan 45k hari ini'};const voiceKey=randomUUID(),voice=await app.handle(new Request('http://localhost:5173'+base()+'/v2/voice',{method:'POST',headers:{cookie,origin:'http://localhost:5173','content-type':'audio/wav','idempotency-key':voiceKey},body:encodePcmWav(new Float32Array(24000))}));expect(voice.status,await voice.clone().text()).toBe(200);expect((await voice.json()).transcript).toBe('makan 45k hari ini');
   const [voiceSaved]=await client`select provider,model from ai_invocations where workspace_id=${ws} and request_key=${voiceKey}`;expect(voiceSaved).toMatchObject({provider:'muse',model:'muse-voice-transcribe-1.0'});
  }finally{process.env.ASSISTANT_AI_PROVIDER='groq';delete process.env.MUSE_API_KEY;}
 });

 test('V2 feedback validates ownership, stays idempotent, persists, hides dismissed cards and exports',async()=>{
  const [prefs]=await client`select consent_version from assistant_settings where workspace_id=${ws} and user_id=${actorId}`;
  const id=randomUUID(),fingerprint='fixture-feedback:'+id;
  await client`insert into insight_findings(id,workspace_id,user_id,consent_version,kind,fingerprint,detector_version,evidence,facts) values(${id},${ws},${actorId},${prefs!.consent_version},'budget_overspend',${fingerprint},'fixture','[]','{}')`;
  const path=base()+'/v2/feedback/finding/'+id;
  expect((await request(path,'POST',{action:'anything'})).status).toBe(422);
  expect((await request(base()+'/v2/feedback/finding/'+randomUUID(),'POST',{action:'helpful'})).status).toBe(404);
  expect((await request('/api/workspaces/'+randomUUID()+'/assistant/v2/feedback/finding/'+id,'POST',{action:'helpful'})).status).toBe(404);
  const [before]=await client`select count(*)::int as count from transactions where workspace_id=${ws}`;
  expect((await request(path,'POST',{action:'not_helpful',kind:'forged',userId:'other'})).status).toBe(200);
  const [first]=await client`select * from assistant_feedback where source_id=${id}`;
  expect(first!.kind).toBe('budget_overspend');expect(first!.user_id).toBe(actorId);
  expect((await request(path,'POST',{action:'not_helpful'})).status).toBe(200);
  const rows=await client`select * from assistant_feedback where source_id=${id}`;expect(rows.length).toBe(1);expect(new Date(rows[0]!.vote_at).toISOString()).toBe(new Date(first!.vote_at).toISOString());
  expect((await request(path,'POST',{action:'helpful'})).status).toBe(200);
  const exported=await request(base()+'/export');expect(exported.status).toBe(200);expect((await exported.json()).data.assistant_feedback.some((f:any)=>f.source_id===id&&f.vote==='helpful')).toBe(true);
  expect((await request(path,'POST',{action:'dismiss'})).status).toBe(200);
  const [hidden]=await client`select state from insight_findings where id=${id}`;expect(hidden!.state).toBe('dismissed');
  const [after]=await client`select count(*)::int as count from transactions where workspace_id=${ws}`;expect(after!.count).toBe(before!.count);
 });
 test('negative feedback cancels queued optional nudges, leaves due alerts and resets after helpful feedback',async()=>{
  const [prefs]=await client`select consent_version from assistant_settings where workspace_id=${ws} and user_id=${actorId}`;
  const summaries=await (await request(base()+'/v2/summaries')).json();
  const saved=await request(base()+'/v2/summary-schedule','PUT',{version:summaries.schedule.version,enabled:false,cadence:'weekly',nudgeFrequency:'daily',channels:['in_app','email'],sendTime:'00:00',quietStart:'00:00',quietEnd:'00:00'});expect(saved.status,await saved.clone().text()).toBe(200);const schedule=await saved.json();
  const [dueAlert]=await client`insert into finance_notifications(workspace_id,user_id,kind,source_id,source_type,dedupe_key,title,message) values(${ws},${actorId},'bill-reminder',${randomUUID()},'bill_occurrence',${'due-alert:'+randomUUID()},'Due today','Fixture') returning id`;
  const ids=[randomUUID(),randomUUID()];let notificationId='',deliveryId='';
  for(let i=0;i<ids.length;i++){
   const metrics={asOfDate:'2026-09-0'+(i+1),safeToSpend:null,upcomingBills:[],feedbackTopics:[{kind:'cashflow_checkin',fingerprint:'cashflow:fixture-'+i}]};
   await client`insert into assistant_summaries(id,workspace_id,user_id,consent_version,period_start,period_end,kind,metrics,schedule_version) values(${ids[i]!},${ws},${actorId},${prefs!.consent_version},${'2026-09-0'+(i+1)},${'2026-09-0'+(i+1)},'nudge',${JSON.stringify(metrics)}::jsonb,${schedule.version})`;
   const [n]=await client`insert into finance_notifications(workspace_id,user_id,kind,source_id,source_type,dedupe_key,title,message) values(${ws},${actorId},'assistant-summary',${ids[i]!},'assistant_summary',${'feedback-fixture:'+ids[i]},'Fixture','Fixture') returning id`;
   const [d]=await client`insert into finance_notification_deliveries(workspace_id,user_id,notification_id,channel,destination_key,preference_version) values(${ws},${actorId},${n!.id},'email','feedback-fixture',${schedule.version}) returning id`;
   notificationId=n!.id;deliveryId=d!.id;
   expect((await request(base()+'/v2/feedback/summary/'+ids[i],'POST',{action:'not_helpful'})).status).toBe(200);
  }
  const [queued]=await client`select status from finance_notification_deliveries where id=${deliveryId}`;expect(queued!.status).toBe('cancelled');
  const {deliverAssistantSummary}=await import('../../src/assistant/v2/summary-email');let sends=0;await deliverAssistantSummary({kind:'assistant-summary',workspaceId:ws,userId:actorId,notificationId,deliveryId,to:'fixture@example.test',title:'Fixture',message:'Fixture',locale:'en',expiresAt:Date.now()+60000},async()=>{sends++;});expect(sends).toBe(0);const [untouched]=await client`select resolved_at from finance_notifications where id=${dueAlert!.id}`;expect(untouched!.resolved_at).toBeNull();
  const {feedbackRows,feedbackAllows}=await import('../../src/assistant/v2/feedback');
  let rows=await client.begin(async tx=>feedbackRows(tx,ws,actorId));expect(feedbackAllows(rows,{kind:'cashflow_checkin',fingerprint:'cashflow:tomorrow'})).toBe(false);
  const {sweepAssistantSummaries}=await import('../../src/assistant/v2/summaries');const {workspaceToday}=await import('../../src/tracking/recurrence');const today=workspaceToday('Asia/Jakarta');await client`update assistant_account_settings set protected_amount=100000000 where workspace_id=${ws} and user_id=${actorId} and account_id=${account}`;await sweepAssistantSummaries();expect((await client`select id from assistant_summaries where workspace_id=${ws} and user_id=${actorId} and kind='nudge' and period_start=${today}`).length).toBe(0);
  expect((await request(base()+'/v2/feedback/summary/'+ids[0],'POST',{action:'helpful'})).status).toBe(200);
  rows=await client.begin(async tx=>feedbackRows(tx,ws,actorId));expect(feedbackAllows(rows,{kind:'cashflow_checkin',fingerprint:'cashflow:tomorrow'})).toBe(true);await sweepAssistantSummaries();expect((await client`select id from assistant_summaries where workspace_id=${ws} and user_id=${actorId} and kind='nudge' and period_start=${today}`).length).toBe(1);
  // Cancelling assistant nudges never changes notification preferences or financial records.
  const [current]=await client`select nudge_frequency from assistant_summary_schedules where workspace_id=${ws} and user_id=${actorId}`;expect(current!.nudge_frequency).toBe('daily');
 });

 test('detections use scoped actual transactions, reveal evidence and retire deleted sources without financial writes or alerts',async()=>{
  const {workspaceToday}=await import('../../src/tracking/recurrence');const {shiftDate}=await import('../../src/assistant/v2/calculations');const today=workspaceToday('Asia/Jakarta'),baselineIds=Array.from({length:8},()=>randomUUID()),candidate=randomUUID(),duplicates=[randomUUID(),randomUUID()];
  for(let i=0;i<baselineIds.length;i++)await client`insert into transactions(id,workspace_id,account_id,category_id,type,amount,currency,occurred_at,merchant) values(${baselineIds[i]!},${ws},${account},${category},'expense',100,'IDR',${shiftDate(today,-10+i)},'Daily food')`;
  await client`insert into transactions(id,workspace_id,account_id,category_id,type,amount,currency,occurred_at,merchant) values(${candidate},${ws},${account},${category},'expense',500,'IDR',${today},'Larger purchase')`;
  for(const id of duplicates)await client`insert into transactions(id,workspace_id,account_id,category_id,type,amount,currency,occurred_at,merchant) values(${id},${ws},${account},${category},'expense',45,'IDR',${today},'One shop')`;
  const [before]=await client`select count(*)::int as count from transactions where workspace_id=${ws}`;const [beforeAlerts]=await client`select count(*)::int as count from finance_notifications where workspace_id=${ws}`;const providerCalls=calls;
  const response=await request(base()+'/v2/analytics');expect(response.status,await response.clone().text()).toBe(200);const result=await response.json();
  const unusual=result.findings.find((f:any)=>f.kind==='unusual_spending'&&f.evidence.includes(candidate));expect(unusual.facts).toMatchObject({threshold:'300.0000',sampleSize:8,historyDays:8});expect(unusual.detector_version).toBe('assistant-detection-v2.2');expect(result.findings.some((f:any)=>f.kind==='possible_duplicate'&&duplicates.every(id=>f.evidence.includes(id)))).toBe(true);
  const evidence=await request(base()+'/v2/findings/'+unusual.id+'/evidence');expect(evidence.status).toBe(200);expect((await evidence.json()).items.some((r:any)=>r.id===candidate)).toBe(true);
  const [after]=await client`select count(*)::int as count from transactions where workspace_id=${ws}`;const [afterAlerts]=await client`select count(*)::int as count from finance_notifications where workspace_id=${ws}`;expect(after!.count).toBe(before!.count);expect(afterAlerts!.count).toBe(beforeAlerts!.count);expect(calls).toBe(providerCalls);
  // Reviewed findings must also disappear when their source is subsequently removed.
  expect((await request(base()+'/v2/findings/'+unusual.id,'PATCH',{state:'legitimate'})).status).toBe(200);await client`update transactions set deleted_at=now() where id=${candidate}`;
  const refreshed=await (await request(base()+'/v2/analytics')).json();expect(refreshed.findings.some((f:any)=>f.id===unusual.id)).toBe(false);expect((await request(base()+'/v2/findings/'+unusual.id+'/evidence')).status).toBe(404);
 });
 test('comparison evidence is bounded, uses the same periods and rechecks source permissions',async()=>{
  const {workspaceToday}=await import('../../src/tracking/recurrence');const today=workspaceToday('Asia/Jakarta');
  const inserted=[];for(let i=0;i<51;i++){const id=randomUUID();inserted.push(id);await client`insert into transactions(id,workspace_id,account_id,category_id,type,amount,currency,occurred_at,merchant) values(${id},${ws},${account},${category},'expense',2,'IDR',${today},'Evidence fixture')`;}
  const response=await request(base()+'/v2/comparison-evidence?groupBy=category&groupKey='+category);expect(response.status).toBe(200);const result=await response.json();expect(result.items.length).toBe(50);expect(result.truncated).toBe(true);expect(result.count).toBeGreaterThanOrEqual(51);expect(result.items.every((row:any)=>row.currency==='IDR'&&(row.period==='current'||row.period==='previous'))).toBe(true);
  expect((await (await request(base()+'/v2/comparison-evidence?groupBy=category&groupKey='+randomUUID())).json()).items).toEqual([]);
  expect((await request(base()+'/v2/comparison-evidence?groupBy=sql&groupKey=anything')).status).toBe(422);
  expect((await request('/api/workspaces/'+randomUUID()+'/assistant/v2/comparison-evidence?groupBy=category&groupKey='+category)).status).toBe(404);
  let prefs=await (await request(base()+'/settings')).json();const permissions=prefs.settings.sourcePermissions;
  expect((await request(base()+'/settings','PATCH',{version:prefs.settings.version,sourcePermissions:{...permissions,history:false}})).status).toBe(200);
  expect((await request(base()+'/v2/comparison-evidence?groupBy=category&groupKey='+category)).status).toBe(403);
  prefs=await (await request(base()+'/settings')).json();expect((await request(base()+'/settings','PATCH',{version:prefs.settings.version,sourcePermissions:permissions})).status).toBe(200);
  await client`update transactions set deleted_at=now() where id=any(${inserted}::uuid[])`;
 });
 test('receivables name customers and evidence excludes unpermitted invoices and contact details',async()=>{
  const contact=randomUUID(),invoice=randomUUID(),hidden=randomUUID();
  await client`insert into business_contacts(id,workspace_id,name,kind,details) values(${contact},${ws},'Evidence customer','customer','{"email":"private@example.test"}')`;
  for(const [id,number,paymentAccount] of [[invoice,'EVIDENCE-1',account],[hidden,'HIDDEN-1',null]])await client`insert into invoices(id,workspace_id,contact_id,number,state,issue_date,due_date,currency,currency_scale,recipient_snapshot,total,expected_account_id,issued_at) values(${id},${ws},${contact},${number},'issued','2026-01-01','2026-01-15','IDR',0,'{}',1000,${paymentAccount},now())`;
  let prefs=await (await request(base()+'/settings')).json();const permissions=prefs.settings.sourcePermissions;
  expect((await request(base()+'/settings','PATCH',{version:prefs.settings.version,sourcePermissions:{...permissions,invoices:true},externalAiEnabled:true,externalAiProvider:'groq'})).status).toBe(200);
  responseValue={tool:'receivables',category:'',period:'this_month'};
  const response=await request(base()+'/v2/chat','POST',{text:'Who owes me money?',requestKey:randomUUID()});expect(response.status,await response.clone().text()).toBe(200);const answer=await response.json();expect(answer.facts).toEqual([expect.objectContaining({id:invoice,number:'EVIDENCE-1',customerName:'Evidence customer',outstanding:'1000.0000'})]);expect(answer.citations[0].label).toContain('Evidence customer');expect(lastProviderPayload).not.toContain('Evidence customer');
  const evidence=await request(base()+'/v2/customers/'+contact+'/evidence');expect(evidence.status).toBe(200);const body=await evidence.json();expect(body.items.map((i:any)=>i.id)).toEqual([invoice]);expect(JSON.stringify(body)).not.toContain('private@example.test');
  prefs=await (await request(base()+'/settings')).json();expect((await request(base()+'/settings','PATCH',{version:prefs.settings.version,sourcePermissions:{...permissions,invoices:false}})).status).toBe(200);
  expect((await request(base()+'/v2/customers/'+contact+'/evidence')).status).toBe(403);
  prefs=await (await request(base()+'/settings')).json();expect((await request(base()+'/settings','PATCH',{version:prefs.settings.version,sourcePermissions:permissions})).status).toBe(200);
  await client`update invoices set archived_at=now() where id in (${invoice},${hidden})`;
 });
 test('coaching feedback has stable identities, hides only advice and is removed with Assistant data',async()=>{
  const goals=[randomUUID(),randomUUID()];for(const id of goals)await client`insert into savings_goals(id,workspace_id,name,target_amount,currency,target_date) values(${id},${ws},'Feedback goal',100,'IDR','2026-12-31')`;
  const first=(await (await request(base()+'/v2/analytics')).json()).goals;expect(first.length).toBe(2);
  const target=first[0].feedbackTarget.id;expect((await request(base()+'/v2/feedback/finding/'+target,'POST',{action:'helpful'})).status).toBe(200);
  const reloaded=(await (await request(base()+'/v2/analytics')).json()).goals;expect(reloaded.find((g:any)=>g.feedbackTarget.id===target).feedbackTarget.feedback).toBe('helpful');
  expect((await request(base()+'/v2/feedback/finding/'+target,'POST',{action:'dismiss'})).status).toBe(200);
  const hidden=(await (await request(base()+'/v2/analytics')).json()).goals;expect(hidden.length).toBe(1);expect((await client`select id from savings_goals where workspace_id=${ws}`).length).toBe(2);
  const [prefs]=await client`select consent_version from assistant_settings where workspace_id=${ws} and user_id=${actorId}`;
  const erased=await request(base()+'/data','DELETE',{confirmation:'DELETE_ASSISTANT_DATA',consentVersion:prefs!.consent_version});expect(erased.status,await erased.clone().text()).toBe(200);expect((await client`select id from assistant_feedback where workspace_id=${ws} and user_id=${actorId}`).length).toBe(0);expect((await client`select id from savings_goals where workspace_id=${ws}`).length).toBe(2);
 });

}
