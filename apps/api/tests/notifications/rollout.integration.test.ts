import { test, expect } from 'bun:test';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { mkdtemp, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const enabled=process.env.TRACKING_INTEGRATION==='1';
if(enabled&&(!process.env.DATABASE_URL||!new URL(process.env.DATABASE_URL).pathname.endsWith('_test')))throw new Error('Disposable *_test database required');
test.skipIf(!enabled)('legacy migration preserves identities, read state, opt-outs and does not resend historical mail',async()=>{
 const root=resolve(import.meta.dir,'../../drizzle'),journal=await Bun.file(join(root,'meta/_journal.json')).json();
 const folder=await mkdtemp(join(tmpdir(),'capybudget-notification-rollout-'));
 const name='notification_rollout_'+crypto.randomUUID().replaceAll('-','')+'_test';
 const url=new URL(process.env.DATABASE_URL!),adminUrl=new URL(url);adminUrl.pathname='/postgres';
 const admin=postgres(adminUrl.toString(),{max:1});await admin.unsafe(`create database ${name}`);url.pathname='/'+name;
 const sql=postgres(url.toString(),{max:2}),db=drizzle(sql);
 const user=crypto.randomUUID(),ws=crypto.randomUUID(),notice=crypto.randomUUID(),bill=crypto.randomUUID(),occ=crypto.randomUUID();
 try{
  await mkdir(join(folder,'meta'));await writeFile(join(folder,'meta/_journal.json'),JSON.stringify({...journal,entries:journal.entries.filter((e:any)=>e.idx<=15)}));
  for(const entry of journal.entries.filter((e:any)=>e.idx<=15))await copyFile(join(root,entry.tag+'.sql'),join(folder,entry.tag+'.sql'));
  await migrate(db,{migrationsFolder:folder});
  await sql.unsafe('insert into "user"(id,name,email,email_verified) values($1,$1,$2,true)',[user,user+'@example.test']);
  await sql.unsafe("insert into workspaces(id,owner_user_id,name,kind) values($1,$2,'Legacy rollout','personal')",[ws,user]);
  await sql.unsafe('insert into workspace_memberships(workspace_id,user_id) values($1,$2)',[ws,user]);
  const [day]=await sql.unsafe("select ((now() at time zone 'Asia/Jakarta')::date)::text as today");
  await sql.unsafe("insert into bills(id,workspace_id,name,amount,currency,frequency,anchor_date,next_due_date,created_at) values($1,$2,'Old bill',10,'IDR','once',$3,$3,now()-interval '1 day')",[bill,ws,day!.today]);
  await sql.unsafe("insert into bill_occurrences(id,workspace_id,bill_id,due_on,name,amount,currency,created_at) values($1,$2,$3,$4,'Old bill',10,'IDR',now()-interval '1 day')",[occ,ws,bill,day!.today]);
  const key=`bill:${occ}:due-in:0`;
  await sql.unsafe("insert into finance_notifications(id,workspace_id,user_id,kind,source_id,dedupe_key,title,message,read_at,email_sent_at,created_at) values($1,$2,$3,'bill-reminder',$4,$5,'Legacy notification','Preserved',now()-interval '12 hours',now()-interval '12 hours',now()-interval '1 day')",[notice,ws,user,occ,key]);
  await sql.unsafe("insert into finance_notification_preferences(workspace_id,user_id,event_type,channel,enabled) values($1,$2,'bill-reminder','email',false)",[ws,user]);
  const [before]=await sql.unsafe('select id,read_at,email_sent_at from finance_notifications where id=$1',[notice]);
  await migrate(db,{migrationsFolder:root});
  const [after]=await sql.unsafe('select id,read_at,email_sent_at from finance_notifications where id=$1',[notice]);
  expect(after).toEqual(before);expect((await sql.unsafe('select dedupe_key from finance_notifications where id=$1',[notice]))[0]!.dedupe_key).toBe(`bill:${occ}:${day!.today}:due-in:0`);
  expect((await sql.unsafe('select enabled from finance_notification_preferences where workspace_id=$1 and user_id=$2',[ws,user]))[0]!.enabled).toBe(false);
  expect((await sql.unsafe("select state->>'cutoverAt' as at from finance_notification_evaluation_state where workspace_id=$1 and rule_key='rollout'",[ws]))[0]!.at).toBeTruthy();
  const sweepScript="import {sweepBillReminders} from './apps/api/src/personal-finance/reminder-scheduler';import {sweepNotifications} from './apps/api/src/notifications/scheduler';const now=new Date('"+day!.today+"T02:00:00Z');await sweepNotifications(now);await sweepBillReminders(now,undefined,async()=>{throw new Error('Historical email must not be enqueued')});process.exit(0);";
  const child=Bun.spawn([process.execPath,'--env-file=.env','-e',sweepScript],{cwd:resolve(root,'../../..'),env:{...process.env,DATABASE_URL:url.toString()},stdout:'pipe',stderr:'pipe'});
  const errors=await new Response(child.stderr).text();expect(await child.exited).toBe(0);expect(errors).not.toContain('Historical email');
  expect((await sql.unsafe('select count(*)::int as count from finance_notification_deliveries where workspace_id=$1',[ws]))[0]!.count).toBe(0);
  expect((await sql.unsafe('select id,read_at,email_sent_at from finance_notifications where id=$1',[notice]))[0]).toEqual(before);
  // Even an enabled legacy preference with an unsent historical notice must not create fresh mail.
  await sql.unsafe("update finance_notification_preferences set enabled=true where workspace_id=$1 and user_id=$2",[ws,user]);
  await sql.unsafe('update finance_notifications set email_sent_at=null where id=$1',[notice]);
  const enabledChild=Bun.spawn([process.execPath,'--env-file=.env','-e',sweepScript],{cwd:resolve(root,'../../..'),env:{...process.env,DATABASE_URL:url.toString()},stdout:'pipe',stderr:'pipe'});
  const enabledErrors=await new Response(enabledChild.stderr).text();expect(await enabledChild.exited).toBe(0);expect(enabledErrors).not.toContain('Historical email');
  expect((await sql.unsafe('select count(*)::int as count from finance_notification_deliveries where workspace_id=$1',[ws]))[0]!.count).toBe(0);

 }finally{await sql.end();await admin.unsafe(`drop database ${name} with (force)`);await admin.end();await rm(folder,{recursive:true,force:true});}
},60000);
