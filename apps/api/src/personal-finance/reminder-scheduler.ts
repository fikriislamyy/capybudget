import { client } from '../db';
import { enqueueEmail } from '../email/queue';
import { nextOccurrenceDate, workspaceToday } from '../tracking/recurrence';
import webpush from 'web-push';
import { decryptPushAuth } from './push-crypto';

let running = false;

type PushSender = (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;

export async function sweepBillReminders(now = new Date(), pushSender?: PushSender): Promise<void> {
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
          if(pushPreference?.enabled===true&&(pushSender||publicKey&&privateKey)){
            if(!pushSender)webpush.setVapidDetails(subject,publicKey!,privateKey!);
            const notifications=await tx.unsafe("select n.id from finance_notifications n join bill_occurrences o on o.workspace_id=n.workspace_id and o.id=n.source_id where n.workspace_id=$1 and n.user_id=$2 and n.kind='bill-reminder' and n.push_sent_at is null and n.created_at >= $3::date and o.status='unpaid'",[workspace.id,workspace.owner_user_id,today]);
            const subscriptions=await tx.unsafe('select id,endpoint,p256dh,auth from push_subscriptions where workspace_id=$1 and user_id=$2',[workspace.id,workspace.owner_user_id]);
            for(const notification of notifications){
              let delivered=false;
              for(const subscription of subscriptions){
                try{
                  const target={endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:decryptPushAuth(subscription.auth)}};
                  const payload=JSON.stringify({title:'A bill is due',body:'Open CapyBudget to view your upcoming bill.',url:'/bills',tag:`bill-${notification.id}`});
                  if(pushSender)await pushSender(target,payload);else await webpush.sendNotification(target,payload);
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

          const assistantAlerts=await tx.unsafe(`select n.id,n.title,n.message,n.user_id as "userId",u.email,a.locale,a.consent_version as "consentVersion",r.consent_version as "runConsentVersion",f.checked_at as "checkedAt",p.updated_at as "preferenceUpdatedAt"
            from finance_notifications n
            join assistant_suggestions s on s.workspace_id=n.workspace_id and s.user_id=n.user_id and s.id=n.assistant_suggestion_id
            join forecast_runs r on r.workspace_id=s.workspace_id and r.id=s.run_id
            join assistant_settings a on a.workspace_id=n.workspace_id and a.user_id=n.user_id
            join assistant_refresh_state f on f.workspace_id=n.workspace_id and f.user_id=n.user_id
            join finance_notification_preferences p on p.workspace_id=n.workspace_id and p.user_id=n.user_id and p.event_type='assistant-alert' and p.channel='email' and p.enabled=true
            join "user" u on u.id=n.user_id
            where n.workspace_id=$1 and n.kind in ('cashflow-shortfall','cashflow-low-balance','assistant-invoice-followup') and n.resolved_at is null and n.email_sent_at is null and s.state in ('active','reviewing') and s.expires_at>now()
              and a.local_forecast_enabled and a.suggestions_enabled and a.consent_version=r.consent_version and f.checked_at>=n.created_at
              and not (s.facts->>'scope'='account' and exists(select 1 from finance_notifications wn join assistant_suggestions ws on ws.workspace_id=wn.workspace_id and ws.user_id=wn.user_id and ws.id=wn.assistant_suggestion_id where wn.workspace_id=n.workspace_id and wn.user_id=n.user_id and wn.kind=n.kind and wn.resolved_at is null and ws.state in ('active','reviewing') and ws.facts->>'scope'='workspace' and ws.facts->>'date'=s.facts->>'date'))
            order by n.created_at limit 50`,[workspace.id]);
          for(const alert of assistantAlerts){
            if(!alert.email||Number(alert.consentVersion)!==Number(alert.runConsentVersion))continue;
            const freshnessVersion=new Date(alert.checkedAt).valueOf(),preferenceVersion=new Date(alert.preferenceUpdatedAt).valueOf();
            await enqueueEmail({kind:'assistant-alert',to:alert.email,workspaceId:workspace.id,userId:alert.userId,notificationId:alert.id,title:alert.title,message:alert.message,locale:alert.locale==='id'?'id':'en',expiresAt:now.valueOf()+7*86400000},`assistant-${alert.id}-${freshnessVersion}-${preferenceVersion}`);
          }
          const pushAlerts=await tx.unsafe(`select n.id,n.user_id as "userId",a.locale
            from finance_notifications n join assistant_suggestions s on s.workspace_id=n.workspace_id and s.user_id=n.user_id and s.id=n.assistant_suggestion_id
            join forecast_runs r on r.workspace_id=s.workspace_id and r.id=s.run_id
            join assistant_settings a on a.workspace_id=n.workspace_id and a.user_id=n.user_id
            join assistant_refresh_state f on f.workspace_id=n.workspace_id and f.user_id=n.user_id
            join finance_notification_preferences p on p.workspace_id=n.workspace_id and p.user_id=n.user_id and p.event_type='assistant-alert' and p.channel='push' and p.enabled=true
            where n.workspace_id=$1 and n.kind in ('cashflow-shortfall','cashflow-low-balance','assistant-invoice-followup') and n.resolved_at is null and n.push_sent_at is null and s.state in ('active','reviewing') and s.expires_at>now()
              and a.local_forecast_enabled and a.suggestions_enabled and a.consent_version=r.consent_version and f.checked_at>=n.created_at
              and not (s.facts->>'scope'='account' and exists(select 1 from finance_notifications wn join assistant_suggestions ws on ws.workspace_id=wn.workspace_id and ws.user_id=wn.user_id and ws.id=wn.assistant_suggestion_id where wn.workspace_id=n.workspace_id and wn.user_id=n.user_id and wn.kind=n.kind and wn.resolved_at is null and ws.state in ('active','reviewing') and ws.facts->>'scope'='workspace' and ws.facts->>'date'=s.facts->>'date')) order by n.created_at limit 50`,[workspace.id]);
          if(pushAlerts.length&&(pushSender||publicKey&&privateKey)){
            if(!pushSender)webpush.setVapidDetails(subject,publicKey!,privateKey!);
            for(const alert of pushAlerts){
              const subscriptions=await tx.unsafe('select id,endpoint,p256dh,auth from push_subscriptions where workspace_id=$1 and user_id=$2',[workspace.id,alert.userId]);let delivered=false;
              for(const subscription of subscriptions){try{const target={endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:decryptPushAuth(subscription.auth)}};const payload=JSON.stringify({title:alert.locale==='id'?'Pembaruan arus kas':'Cashflow update',body:alert.locale==='id'?'Buka CapyBudget untuk meninjau proyeksi Anda.':'Open CapyBudget to review your forecast.',url:'/assistant',tag:`assistant-${alert.id}`});if(pushSender)await pushSender(target,payload);else await webpush.sendNotification(target,payload);delivered=true;}catch(error){const status=(error as {statusCode?:number}).statusCode;if(status===404||status===410)await tx.unsafe('delete from push_subscriptions where id=$1',[subscription.id]);else console.error('Assistant alert delivery failed',{status:status??'unknown'});}}
              if(delivered)await tx.unsafe('update finance_notifications set push_sent_at=coalesce(push_sent_at,now()) where workspace_id=$1 and user_id=$2 and id=$3 and resolved_at is null',[workspace.id,alert.userId,alert.id]);
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
