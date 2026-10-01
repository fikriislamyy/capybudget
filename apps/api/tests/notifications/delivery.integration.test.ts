import { test, expect } from 'bun:test';
import { client } from '../../src/db';
import { processEmailJob } from '../../src/email/processor';
import { encryptEmailMessage } from '../../src/email/crypto';
import type { EmailMessage } from '../../src/email/types';
import { sweepBillReminders } from '../../src/personal-finance/reminder-scheduler';
import { classifySmtpError } from '../../src/email/smtp-outcome';
import { sendEmail } from '../../src/email/mailer';
import nodemailer from 'nodemailer';
import { resolve } from 'node:path';
import { workspaceToday } from '../../src/tracking/recurrence';

const enabled=process.env.TRACKING_INTEGRATION==='1';
if(enabled&&(!process.env.DATABASE_URL||!new URL(process.env.DATABASE_URL).pathname.endsWith('_test')))throw new Error('Disposable *_test database required');

test.skipIf(!enabled)('durable notification delivery claims, suppression, failures, recovery, and deletion',async()=>{
 const user=crypto.randomUUID(),ws=crypto.randomUUID(),email=`delivery-${user}@example.test`,today=workspaceToday('Asia/Jakarta'),now=new Date(today+'T02:00:00Z');
 await client.unsafe('insert into "user"(id,name,email,email_verified) values($1,$1,$2,true)',[user,email]);
 await client.unsafe("insert into workspaces(id,owner_user_id,name,kind) values($1,$2,'Delivery acceptance','personal')",[ws,user]);
 await client.unsafe('insert into workspace_memberships(workspace_id,user_id) values($1,$2)',[ws,user]);
 const scoped=async(sql:string,values:any[]=[])=>client.begin(async tx=>{await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[user,ws]);return tx.unsafe(sql,values);});
 async function fixture(){
  const bill=crypto.randomUUID(),occ=crypto.randomUUID(),notice=crypto.randomUUID(),delivery=crypto.randomUUID();
  await scoped("insert into bills(id,workspace_id,name,amount,currency,frequency,anchor_date,next_due_date) values($1,$2,'Acceptance bill',10,'IDR','once',$3,$3)",[bill,ws,today]);
  await scoped("insert into bill_occurrences(id,workspace_id,bill_id,due_on,name,amount,currency) values($1,$2,$3,$4,'Acceptance bill',10,'IDR')",[occ,ws,bill,today]);
  await scoped("insert into finance_notifications(id,workspace_id,user_id,kind,source_id,source_type,dedupe_key,title,message) values($1::uuid,$2,$3,'bill-reminder',$4,'bill_occurrence',$5,'Acceptance bill','Due today')",[notice,ws,user,occ,`bill:${occ}:${today}:due-in:0`]);
  await scoped("insert into finance_notification_deliveries(id,workspace_id,user_id,notification_id,channel,destination_key,preference_version) values($1,$2,$3,$4,'email',$5,1)",[delivery,ws,user,notice,'email:'+user]);
  const message:EmailMessage={kind:'bill-reminder',to:email,userId:user,workspaceId:ws,billName:'Acceptance bill',amount:'10',currency:'IDR',dueDate:today,occurrenceId:occ,notificationId:notice,deliveryId:delivery,locale:'en',expiresAt:Date.now()+86400000};
  const job={data:encryptEmailMessage(message),attemptsMade:0,opts:{attempts:5}};
  return {bill,occ,notice,delivery,message,job};
 }
 const status=async(id:string)=>(await scoped('select * from finance_notification_deliveries where id=$1',[id]))[0];
 let sends=0;const sender=async()=>{sends++;await Bun.sleep(10);};
 // Two independent processes exercise PostgreSQL locks, rather than the in-process guard.
 const concurrent=await fixture();await scoped('delete from finance_notifications where id=$1',[concurrent.notice]);
 const script=`import {sweepBillReminders} from './apps/api/src/personal-finance/reminder-scheduler';import {sweepNotifications} from './apps/api/src/notifications/scheduler';await sweepNotifications(new Date('${now.toISOString()}'));await sweepBillReminders(new Date('${now.toISOString()}'),undefined,async()=>{});process.exit(0);`;
 const runners=[0,1].map(()=>Bun.spawn([process.execPath,'--env-file=.env','-e',script],{cwd:resolve(import.meta.dir,'../../../..'),env:process.env,stdout:'pipe',stderr:'pipe'}));
 for(const child of runners){const errors=await new Response(child.stderr).text();expect(await child.exited,errors).toBe(0);expect(errors).not.toContain('sweep failed');}
 expect((await scoped('select id from finance_notifications where workspace_id=$1 and source_id=$2',[ws,concurrent.occ])).length).toBe(1);
 expect((await scoped('select d.id from finance_notification_deliveries d join finance_notifications n on n.id=d.notification_id where n.workspace_id=$1 and n.source_id=$2',[ws,concurrent.occ])).length).toBe(1);
 const duplicate=await fixture();
 await Promise.all([processEmailJob(duplicate.job,sender),processEmailJob(duplicate.job,sender)]);
 expect(sends).toBe(1);expect((await status(duplicate.delivery)).status).toBe('accepted');expect((await status(duplicate.delivery)).attempts).toBe(1);
 await processEmailJob(duplicate.job,sender);expect(sends).toBe(1);
 for(const reason of ['paid','archived','rescheduled','membership','preference','expired','recipient','snoozed','workspace-archive']){
  const item=await fixture(),before=sends;
  if(reason==='paid')await scoped("update bill_occurrences set status='paid' where id=$1",[item.occ]);
  if(reason==='archived')await scoped('update bills set archived_at=now() where id=$1',[item.bill]);
  if(reason==='rescheduled')await scoped("update bill_occurrences set due_on=due_on+1 where id=$1",[item.occ]);
  if(reason==='membership')await client.unsafe('delete from workspace_memberships where workspace_id=$1 and user_id=$2',[ws,user]);
  if(reason==='preference')await scoped("insert into finance_notification_preferences(workspace_id,user_id,event_type,channel,enabled,version) values($1,$2,'bill-reminder','email',false,2)",[ws,user]);
  if(reason==='expired')await scoped("update finance_notifications set expires_at=now()-interval '1 minute' where id=$1",[item.notice]);
  if(reason==='recipient')await client.unsafe('update "user" set email=$2 where id=$1',[user,'changed-'+email]);
  if(reason==='snoozed')await scoped("update finance_notifications set snoozed_until=now()+interval '1 hour' where id=$1",[item.notice]);
  if(reason==='workspace-archive')await client.unsafe('update workspaces set archived_at=now() where id=$1',[ws]);
  await processEmailJob(item.job,sender);expect(sends).toBe(before);expect((await status(item.delivery)).status).toBe(reason==='snoozed'?'pending':'cancelled');if(reason==='snoozed')expect(new Date((await status(item.delivery)).available_at).valueOf()).toBeGreaterThan(Date.now());
  if(reason==='membership')await client.unsafe('insert into workspace_memberships(workspace_id,user_id) values($1,$2)',[ws,user]);
  if(reason==='preference')await scoped('delete from finance_notification_preferences where workspace_id=$1 and user_id=$2',[ws,user]);
  if(reason==='recipient')await client.unsafe('update "user" set email=$2 where id=$1',[user,email]);
  if(reason==='workspace-archive')await client.unsafe('update workspaces set archived_at=null where id=$1',[ws]);
 }
 const expired=await fixture();expired.job.data=encryptEmailMessage({...expired.message,expiresAt:Date.now()-1});
 await processEmailJob(expired.job,sender);expect((await status(expired.delivery)).status).toBe('expired');
 for(const code of ['ETIMEDOUT','ECONNRESET','ESOCKET','SMTP_CONFIG','EAUTH']){
  const item=await fixture();let attempts=0;
  const reject=async()=>{attempts++;throw Object.assign(new Error('controlled transport failure'),{code});};
  await expect(processEmailJob(item.job,reject)).rejects.toThrow();
  expect((await status(item.delivery)).status).toBe(['SMTP_CONFIG','EAUTH'].includes(code)?'failed':'unknown');
  await processEmailJob(item.job,reject);expect(attempts).toBe(1);
 }
 // A real SMTP server disconnects after consuming DATA, before returning acceptance.
 const sockets=new Set<any>();let buffer='',inData=false,dataAttempts=0;
 const smtp=Bun.listen({hostname:'127.0.0.1',port:0,socket:{open(socket){sockets.add(socket);socket.write('220 test SMTP\r\n');},close(socket){sockets.delete(socket);},data(socket,data){buffer+=Buffer.from(data).toString();if(inData){if(buffer.includes('\r\n.\r\n')){dataAttempts++;socket.end();}return;}let end;while((end=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+2);if(line.startsWith('EHLO'))socket.write('250 test\r\n');else if(line==='DATA'){inData=true;socket.write('354 Send data\r\n');break;}else socket.write('250 OK\r\n');}}}});
 const transport=nodemailer.createTransport({host:'127.0.0.1',port:smtp.port,secure:false,socketTimeout:1000});
 const disconnect=await fixture();
 try{const realSender=async(message:EmailMessage)=>{await transport.sendMail({from:'test@example.test',to:message.to,subject:'Acceptance disconnect',text:'test'});};await expect(processEmailJob(disconnect.job,realSender)).rejects.toThrow();expect((await status(disconnect.delivery)).status).toBe('unknown');await processEmailJob(disconnect.job,realSender);expect(dataAttempts).toBe(1);}finally{transport.close();for(const socket of sockets)socket.end();smtp.stop(true);}
 expect(classifySmtpError({code:'ESOCKET',responseCode:451})).toMatchObject({uncertain:false,permanent:false});
 expect(classifySmtpError({code:'EENVELOPE',responseCode:550})).toMatchObject({uncertain:false,permanent:true});
 const missing=await fixture(),from=process.env.EMAIL_FROM;delete process.env.EMAIL_FROM;
 try{await expect(processEmailJob(missing.job,sendEmail)).rejects.toThrow();expect((await status(missing.delivery)).status).toBe('failed');}finally{process.env.EMAIL_FROM=from;}
 const retry=await fixture();let attempts=0;const failure=async()=>{attempts++;throw Object.assign(new Error('connection refused'),{code:'ECONNREFUSED'});};
 for(let i=0;i<5;i++){
  await scoped("update finance_notification_deliveries set available_at=now()-interval '1 second' where id=$1",[retry.delivery]);
  await expect(processEmailJob(retry.job,failure)).rejects.toThrow();
  expect((await status(retry.delivery)).status).toBe(i===4?'failed':'retryable');
  await processEmailJob(retry.job,failure);expect(attempts).toBe(i+1);
 }
 const crash=await fixture();
 await scoped("update finance_notification_deliveries set status='processing',lease_expires_at=now()-interval '1 second',send_started_at=null where id=$1",[crash.delivery]);
 const recovered:EmailMessage[]=[];
 await sweepBillReminders(now,undefined,async(message)=>{recovered.push(message);});
 expect((await status(crash.delivery)).status).toBe('retryable');
 // The manually inserted fixture has a different stage key, but is not lost by recovery.
 await processEmailJob(crash.job,sender);expect((await status(crash.delivery)).status).toBe('accepted');
 const uncertain=await fixture();await scoped("update finance_notification_deliveries set status='processing',lease_expires_at=now()-interval '1 second',send_started_at=now() where id=$1",[uncertain.delivery]);
 await sweepBillReminders(now,undefined,async()=>{});expect((await status(uncertain.delivery)).status).toBe('unknown');
 const before=sends;await processEmailJob(uncertain.job,sender);expect(sends).toBe(before);
 // Rollback before commit cannot leave an orphaned outbox row.
 const rolledBack=crypto.randomUUID();await expect(client.begin(async tx=>{await tx.unsafe("insert into finance_notifications(id,workspace_id,user_id,kind,source_id,dedupe_key,title,message) values($1::uuid,$2,$3,'bill-reminder',$1::uuid,$1::text,'rollback','rollback')",[rolledBack,ws,user]);throw new Error('crash before commit');})).rejects.toThrow();
 expect((await scoped('select id from finance_notifications where id=$1',[rolledBack])).length).toBe(0);
 // Simulate loss/outage of Redis: no provider acceptance, and the next sweep reconstructs queued jobs.
 const outageScript="import {enqueueEmail} from './apps/api/src/email/queue';const started=Date.now();try{await enqueueEmail({kind:'verification',to:'outage@example.test',otp:'123456',locale:'en',expiresAt:Date.now()+60000});process.exit(2);}catch{process.exit(Date.now()-started<3000?0:3);}";
 const outage=Bun.spawn([process.execPath,'--env-file=.env','-e',outageScript],{cwd:resolve(import.meta.dir,'../../../..'),env:{...process.env,REDIS_URL:'redis://127.0.0.1:6398/6'},stdout:'pipe',stderr:'pipe'});
 const outageTimeout=setTimeout(()=>outage.kill(),4000);try{await new Response(outage.stderr).text();expect(await outage.exited).toBe(0);}finally{clearTimeout(outageTimeout);}
 const queueFixture=await fixture();await scoped('delete from finance_notifications where id=$1',[queueFixture.notice]);
 await sweepBillReminders(now,undefined,async()=>{throw Object.assign(new Error('Redis unavailable'),{code:'REDIS_UNAVAILABLE'});});
 const pending=await scoped("select d.id,d.status,n.id as notice from finance_notification_deliveries d join finance_notifications n on n.id=d.notification_id where n.source_id=$1",[queueFixture.occ]);
 expect(pending.length).toBe(1);expect(pending[0]!.status).toBe('pending');
 let recoveredMessage:EmailMessage|undefined;await sweepBillReminders(now,undefined,async m=>{if(m.kind==='bill-reminder'&&m.occurrenceId===queueFixture.occ)recoveredMessage=m;});
 expect(recoveredMessage).toBeDefined();await processEmailJob({data:encryptEmailMessage(recoveredMessage!),attemptsMade:0,opts:{attempts:5}},sender);expect((await status(pending[0]!.id)).status).toBe('accepted');
 const deleted=await fixture();
 await scoped('delete from bill_occurrences where workspace_id=$1',[ws]);await scoped('delete from bills where workspace_id=$1',[ws]);
 await client.unsafe('delete from workspaces where id=$1',[ws]);
 expect((await client.unsafe('select id from finance_notifications where workspace_id=$1',[ws])).length).toBe(0);
 expect((await client.unsafe('select id from finance_notification_deliveries where workspace_id=$1',[ws])).length).toBe(0);
 const beforeDeletion=sends;await processEmailJob(deleted.job,sender);await sweepBillReminders(now,undefined,async()=>{});expect(sends).toBe(beforeDeletion);
 const ws2=crypto.randomUUID(),n2=crypto.randomUUID(),d2=crypto.randomUUID();
 await client.unsafe("insert into workspaces(id,owner_user_id,name,kind) values($1,$2,'Delete owner','personal')",[ws2,user]);
 await client.unsafe('insert into workspace_memberships(workspace_id,user_id) values($1,$2)',[ws2,user]);
 await client.unsafe("insert into finance_notifications(id,workspace_id,user_id,kind,source_id,dedupe_key,title,message) values($1::uuid,$2,$3,'bill-reminder',$4,$1::text,'delete','delete')",[n2,ws2,user,deleted.occ]);
 await client.unsafe("insert into finance_notification_deliveries(id,workspace_id,user_id,notification_id,channel,destination_key) values($1,$2,$3,$4,'email',$3)",[d2,ws2,user,n2]);
 const staleOwner={...deleted.message,workspaceId:ws2,notificationId:n2,deliveryId:d2};
 await client.unsafe('delete from "user" where id=$1',[user]);
 expect((await client.unsafe('select id from finance_notifications where user_id=$1',[user])).length).toBe(0);expect((await client.unsafe('select id from finance_notification_deliveries where user_id=$1',[user])).length).toBe(0);
 await processEmailJob({data:encryptEmailMessage(staleOwner),attemptsMade:0,opts:{attempts:5}},sender);expect(sends).toBe(beforeDeletion);

},60000);
