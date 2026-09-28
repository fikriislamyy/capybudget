import { client } from '../db';
import { enqueueEmail } from '../email/queue';
import { nextOccurrenceDate, workspaceToday } from '../tracking/recurrence';
import webpush from 'web-push';
import { decryptPushAuth } from './push-crypto';

let running = false;

export async function sweepBillReminders(now = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    const workspaces = await client.unsafe("select id,owner_user_id,timezone from workspaces where archived_at is null");
    for (const workspace of workspaces) {
      try {
        await client.begin(async (tx) => {
          await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)", [workspace.owner_user_id, workspace.id]);
          const today = workspaceToday(workspace.timezone, now), end = new Date(`${today}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 90);
          const through = end.toISOString().slice(0,10);
          const bills = await tx.unsafe('select * from bills where workspace_id=$1 and enabled and archived_at is null and next_due_date<=$2 order by next_due_date limit 200', [workspace.id, through]);
          for (const bill of bills) {
            let due = bill.next_due_date as string, count = 0;
            while (due <= through && count++ < 100) {
              await tx.unsafe('insert into bill_occurrences(workspace_id,bill_id,due_on,name,amount,currency) values($1,$2,$3,$4,$5,$6) on conflict do nothing', [workspace.id,bill.id,due,bill.name,bill.amount,bill.currency]);
              if (bill.frequency === 'once') break;
              const occurrenceCount = Number((await tx.unsafe('select count(*)::int as n from bill_occurrences where workspace_id=$1 and bill_id=$2 and due_on >= $3', [workspace.id,bill.id,bill.anchor_date]))[0]!.n);
              const next = nextOccurrenceDate(bill.anchor_date,bill.frequency,Number(bill.interval),occurrenceCount);
              if (next <= due || (bill.end_date && next > bill.end_date)) break;
              due = next;
            }
            await tx.unsafe("update bills set next_due_date=$3,enabled=case when frequency='once' and exists(select 1 from bill_occurrences where workspace_id=$1 and bill_id=$2) then false else enabled end,updated_at=now() where workspace_id=$1 and id=$2", [workspace.id,bill.id,due]);
          }
          const dueItems = await tx.unsafe("select o.id,o.name,o.amount::text,o.currency,o.due_on,b.reminder_days from bill_occurrences o join bills b on b.workspace_id=o.workspace_id and b.id=o.bill_id where o.workspace_id=$1 and o.status='unpaid' and o.due_on >= $2::date and o.due_on <= $3::date and b.archived_at is null", [workspace.id,today,through]);
          for (const item of dueItems) {
            const days = Math.round((new Date(`${item.due_on}T00:00:00Z`).valueOf()-new Date(`${today}T00:00:00Z`).valueOf())/86400000);
            if (!(item.reminder_days as number[]).includes(days)) continue;
            const key=`bill:${item.id}:due-in:${days}`, title=days?'Bill due soon':'Bill due today';
            const [notification] = await tx.unsafe("insert into finance_notifications(workspace_id,user_id,kind,source_id,dedupe_key,title,message) values($1,$2,'bill-reminder',$3,$4,$5,$6) on conflict(workspace_id,user_id,dedupe_key) do update set dedupe_key=excluded.dedupe_key returning id,email_sent_at", [workspace.id,workspace.owner_user_id,item.id,key,title,`${item.name} · ${item.currency} ${item.amount} · ${item.due_on}`]);
            if (notification!.email_sent_at) continue;
            const [preference] = await tx.unsafe("select enabled from finance_notification_preferences where workspace_id=$1 and user_id=$2 and event_type='bill-reminder' and channel='email'", [workspace.id,workspace.owner_user_id]);
            if (preference?.enabled === false) continue;
            const [user] = await tx.unsafe('select email from "user" where id=$1', [workspace.owner_user_id]);
            if (!user?.email) continue;
            await enqueueEmail({kind:'bill-reminder',to:user.email,billName:item.name,amount:item.amount,currency:item.currency,dueDate:item.due_on,workspaceId:workspace.id,userId:workspace.owner_user_id,occurrenceId:item.id,locale:'en',expiresAt:now.valueOf()+7*86400000},`bill-${notification!.id}`);
            await tx.unsafe('update finance_notifications set email_sent_at=now() where id=$1', [notification!.id]);
          }
          const [pushPreference]=await tx.unsafe("select enabled from finance_notification_preferences where workspace_id=$1 and user_id=$2 and event_type='bill-reminder' and channel='push'",[workspace.id,workspace.owner_user_id]);
          const publicKey=process.env.VAPID_PUBLIC_KEY,privateKey=process.env.VAPID_PRIVATE_KEY,subject=process.env.VAPID_SUBJECT??'mailto:hello@capybudget.local';
          if(pushPreference?.enabled===true&&publicKey&&privateKey){
            webpush.setVapidDetails(subject,publicKey,privateKey);
            const notifications=await tx.unsafe("select n.id from finance_notifications n join bill_occurrences o on o.workspace_id=n.workspace_id and o.id=n.source_id where n.workspace_id=$1 and n.user_id=$2 and n.kind='bill-reminder' and n.push_sent_at is null and n.created_at >= $3::date and o.status='unpaid'",[workspace.id,workspace.owner_user_id,today]);
            const subscriptions=await tx.unsafe('select id,endpoint,p256dh,auth from push_subscriptions where workspace_id=$1 and user_id=$2',[workspace.id,workspace.owner_user_id]);
            for(const notification of notifications){
              let delivered=false;
              for(const subscription of subscriptions){
                try{
                  await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:decryptPushAuth(subscription.auth)}},JSON.stringify({title:'A bill is due',body:'Open CapyBudget to view your upcoming bill.',url:'/bills',tag:`bill-${notification.id}`}));
                  delivered=true;
                }catch(error){
                  const status=(error as {statusCode?:number}).statusCode;
                  if(status===404||status===410)await tx.unsafe('delete from push_subscriptions where id=$1',[subscription.id]);
                  else console.error('Browser reminder delivery failed',{status:status??'unknown'});
                }
              }
              if(delivered)await tx.unsafe('update finance_notifications set push_sent_at=now() where id=$1',[notification.id]);
            }
          }
        });
      } catch (error) { console.error('Bill reminder sweep failed for workspace', { workspaceId: workspace.id, error: error instanceof Error ? error.name : 'unknown' }); }
    }
  } finally { running = false; }
}

export function startBillReminderScheduler(): void {
  void sweepBillReminders();
  const timer = setInterval(() => void sweepBillReminders(), 60_000);
  timer.unref();
}
