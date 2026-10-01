import { UnrecoverableError, type Job } from 'bullmq';
import { decryptEmailMessage } from './crypto';
import { sendEmail } from './mailer';
import type { EncryptedEmailJob } from './types';
import { client } from '../db';
import { markInvoiceDeliveryFailed, markInvoiceReminderFailed, sendInvoicePdf, sendInvoiceReminder } from '../business/worker';

import { classifySmtpError } from './smtp-outcome';

export async function processEmailJob(job: Pick<Job<EncryptedEmailJob>, 'data' | 'attemptsMade' | 'opts'>, deliver = sendEmail) {
    let message;
    try {
      // Authenticate expired payloads so their durable outbox rows can also expire.
      message = decryptEmailMessage(job.data, true);
    } catch {
      throw new UnrecoverableError('Email job expired or could not be decrypted');
    }
    if (job.data.expiresAt <= Date.now()) {
      const deliveryId=message.kind==='bill-reminder'||message.kind==='assistant-alert'?message.deliveryId:undefined;
      if (deliveryId && (message.kind === 'bill-reminder' || message.kind === 'assistant-alert')) await client.begin(async(tx)=>{await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[message.userId,message.workspaceId]);await tx.unsafe("update finance_notification_deliveries set status='expired',lease_expires_at=null,updated_at=now() where workspace_id=$1 and user_id=$2 and id=$3 and status in ('pending','retryable')",[message.workspaceId,message.userId,deliveryId]);});
      return;
    }
    if((message.kind==='bill-reminder'||message.kind==='assistant-alert')&&message.notificationId&&message.deliveryId){
      const delayed=await client.begin(async tx=>{await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[message.userId,message.workspaceId]);return tx.unsafe("update finance_notification_deliveries d set available_at=greatest(d.available_at,n.snoozed_until),updated_at=now() from finance_notifications n where d.workspace_id=$1 and d.user_id=$2 and d.id=$3 and n.workspace_id=d.workspace_id and n.user_id=d.user_id and n.id=d.notification_id and n.id=$4 and n.snoozed_until>now() and d.status in ('pending','retryable') returning d.id",[message.workspaceId,message.userId,message.deliveryId!,message.notificationId!]);});
      if(delayed.length)return;
    }
    if(message.kind==='bill-reminder'){
      const deliveryId=message.deliveryId,notificationId=message.notificationId;
      const setDelivery=async(sql:string,values:unknown[])=>client.begin(async(tx)=>{await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[message.userId,message.workspaceId]);return tx.unsafe(sql,values as never[]);});
      if(deliveryId){const [claimed]=await setDelivery("update finance_notification_deliveries set status='processing',attempts=attempts+1,send_started_at=null,lease_expires_at=now()+interval '1 minute',updated_at=now() where workspace_id=$1 and user_id=$2 and id=$3 and channel='email' and status in ('pending','retryable') and available_at<=now() and attempts<5 and expires_at>now() returning id",[message.workspaceId,message.userId,deliveryId]);if(!claimed)return;}
      const canSend=await client.begin(async(tx)=>{
        await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[message.userId,message.workspaceId]);
        const [occurrence]=await tx.unsafe("select id from bill_occurrences where workspace_id=$1 and id=$2 and due_on=$3::date and status='unpaid' and exists(select 1 from bills b where b.workspace_id=bill_occurrences.workspace_id and b.id=bill_occurrences.bill_id and (b.enabled or b.frequency='once') and b.archived_at is null)",[message.workspaceId,message.occurrenceId,message.dueDate]);
        const [preference]=await tx.unsafe("select enabled,version from finance_notification_preferences where workspace_id=$1 and user_id=$2 and event_type='bill-reminder' and channel='email'",[message.workspaceId,message.userId]);
        const [membership]=await tx.unsafe('select 1 from workspace_memberships m join workspaces w on w.id=m.workspace_id and w.archived_at is null where m.workspace_id=$1 and m.user_id=$2',[message.workspaceId,message.userId]);
        const [recipient]=await tx.unsafe('select email_verified,email from "user" where id=$1',[message.userId]);
        let deliveryVersion:number|null=null;if(deliveryId){const [delivery]=await tx.unsafe('select preference_version from finance_notification_deliveries where workspace_id=$1 and user_id=$2 and id=$3',[message.workspaceId,message.userId,deliveryId]);deliveryVersion=delivery?.preference_version??null;}
        const [notification]=notificationId?await tx.unsafe("select id from finance_notifications where workspace_id=$1 and user_id=$2 and id=$3 and resolved_at is null and dismissed_at is null and (snoozed_until is null or snoozed_until<=now()) and expires_at>now()",[message.workspaceId,message.userId,notificationId]):[true];
        return Boolean(occurrence)&&Boolean(notification)&&Boolean(membership)&&recipient?.email_verified===true&&recipient.email===message.to&&preference?.enabled!==false&&(!deliveryId||Number(deliveryVersion)===Number(preference?.version??1));
      });
      if(!canSend){if(deliveryId)await setDelivery("update finance_notification_deliveries set status='cancelled',lease_expires_at=null,updated_at=now() where workspace_id=$1 and user_id=$2 and id=$3 and status='processing'",[message.workspaceId,message.userId,deliveryId]);console.info('Discarded stale bill reminder email');return;}
      if(deliveryId){const [started]=await setDelivery("update finance_notification_deliveries set send_started_at=now(),updated_at=now() where workspace_id=$1 and user_id=$2 and id=$3 and status='processing' returning id",[message.workspaceId,message.userId,deliveryId]);if(!started)return;}
      try{await deliver(message);}catch(error){if(deliveryId){const {code,uncertain,permanent}=classifySmtpError(error);await setDelivery("update finance_notification_deliveries set status=case when $4::boolean then 'unknown' when $6::boolean or attempts>=5 then 'failed' else 'retryable' end,last_error_code=$5,available_at=now()+make_interval(secs=>least(3600,power(2,least(attempts,10))::int)),send_started_at=case when $4::boolean then send_started_at else null end,lease_expires_at=null,updated_at=now() where workspace_id=$1 and user_id=$2 and id=$3 and status='processing'",[message.workspaceId,message.userId,deliveryId,uncertain,code,permanent]);if(uncertain||permanent)throw new UnrecoverableError(uncertain?'SMTP delivery outcome is uncertain':'SMTP delivery failed permanently');}throw error;}
      if(deliveryId)await setDelivery("update finance_notification_deliveries set status='accepted',accepted_at=now(),lease_expires_at=null,updated_at=now() where workspace_id=$1 and user_id=$2 and id=$3 and status='processing'",[message.workspaceId,message.userId,deliveryId]);
      if(notificationId)await setDelivery('update finance_notifications set email_sent_at=coalesce(email_sent_at,now()),updated_at=now() where workspace_id=$1 and user_id=$2 and id=$3',[message.workspaceId,message.userId,notificationId]);
      return;
    }
    if(message.kind==='invoice-delivery'){
      try { await sendInvoicePdf(message); }
      catch(error) {
        const uncertain=classifySmtpError(error).uncertain;
        if(uncertain){await markInvoiceDeliveryFailed(message,true);throw new UnrecoverableError('SMTP delivery outcome is uncertain');}
        if(job.attemptsMade+1 >= (job.opts.attempts??5))await markInvoiceDeliveryFailed(message);
        throw error;
      }
      return;
    }
    if(message.kind==='invoice-reminder'){
      try{await sendInvoiceReminder(message);}
      catch(error){const uncertain=classifySmtpError(error).uncertain;if(uncertain){await markInvoiceReminderFailed(message,true);throw new UnrecoverableError('SMTP delivery outcome is uncertain');}if(job.attemptsMade+1 >= (job.opts.attempts??5))await markInvoiceReminderFailed(message);throw error;}
      return;
    }
    if(message.kind==='assistant-alert'){
      const setDelivery=async(sql:string,values:unknown[])=>client.begin(async(tx)=>{await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[message.userId,message.workspaceId]);return tx.unsafe(sql,values as never[]);});
      const [claimed]=await setDelivery("update finance_notification_deliveries set status='processing',attempts=attempts+1,send_started_at=null,lease_expires_at=now()+interval '1 minute',updated_at=now() where workspace_id=$1 and user_id=$2 and id=$3 and channel='email' and status in ('pending','retryable') and available_at<=now() and attempts<5 and expires_at>now() returning id",[message.workspaceId,message.userId,message.deliveryId]);
      if(!claimed)return;
      const canSend=await client.begin(async(tx)=>{
        await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[message.userId,message.workspaceId]);
        const [row]=await tx.unsafe(`select n.id from finance_notifications n
          join finance_notification_deliveries d on d.workspace_id=n.workspace_id and d.user_id=n.user_id and d.notification_id=n.id
          join assistant_suggestions s on s.workspace_id=n.workspace_id and s.user_id=n.user_id and s.id=n.assistant_suggestion_id
          join forecast_runs r on r.workspace_id=s.workspace_id and r.id=s.run_id
          join assistant_settings a on a.workspace_id=n.workspace_id and a.user_id=n.user_id
          join assistant_refresh_state f on f.workspace_id=n.workspace_id and f.user_id=n.user_id
          join workspace_memberships m on m.workspace_id=n.workspace_id and m.user_id=n.user_id
          join workspaces w on w.id=m.workspace_id and w.archived_at is null
          join "user" u on u.id=n.user_id and u.email_verified=true and u.email=$5
          join finance_notification_preferences p on p.workspace_id=n.workspace_id and p.user_id=n.user_id and p.event_type='assistant-alert' and p.channel='email' and p.enabled=true
          where n.workspace_id=$1 and n.user_id=$2 and n.id=$3 and d.id=$4 and d.status='processing' and d.preference_version=p.version and n.kind in ('cashflow-shortfall','cashflow-low-balance','assistant-invoice-followup') and n.resolved_at is null and n.dismissed_at is null and (n.snoozed_until is null or n.snoozed_until<=now()) and n.expires_at>now() and n.email_sent_at is null
          and s.state in ('active','reviewing') and s.expires_at>now() and a.local_forecast_enabled and a.suggestions_enabled and a.consent_version=r.consent_version and f.checked_at>=n.created_at
          and not (s.facts->>'scope'='account' and exists(select 1 from finance_notifications wn join assistant_suggestions ws on ws.workspace_id=wn.workspace_id and ws.user_id=wn.user_id and ws.id=wn.assistant_suggestion_id where wn.workspace_id=n.workspace_id and wn.user_id=n.user_id and wn.kind=n.kind and wn.resolved_at is null and ws.state in ('active','reviewing') and ws.facts->>'scope'='workspace' and ws.facts->>'date'=s.facts->>'date'))`,[message.workspaceId,message.userId,message.notificationId,message.deliveryId,message.to]);
        return Boolean(row);
      });
      if(!canSend){await setDelivery("update finance_notification_deliveries set status='cancelled',lease_expires_at=null,updated_at=now() where workspace_id=$1 and user_id=$2 and id=$3 and status='processing'",[message.workspaceId,message.userId,message.deliveryId]);return;}
      const [started]=await setDelivery("update finance_notification_deliveries set send_started_at=now(),updated_at=now() where workspace_id=$1 and user_id=$2 and id=$3 and status='processing' returning id",[message.workspaceId,message.userId,message.deliveryId]);if(!started)return;
      try{await deliver(message);}catch(error){const {code,uncertain,permanent}=classifySmtpError(error);await setDelivery("update finance_notification_deliveries set status=case when $4::boolean then 'unknown' when $6::boolean or attempts>=5 then 'failed' else 'retryable' end,last_error_code=$5,available_at=now()+make_interval(secs=>least(3600,power(2,least(attempts,10))::int)),send_started_at=case when $4::boolean then send_started_at else null end,lease_expires_at=null,updated_at=now() where workspace_id=$1 and user_id=$2 and id=$3 and status='processing'",[message.workspaceId,message.userId,message.deliveryId,uncertain,code,permanent]);if(uncertain||permanent)throw new UnrecoverableError(uncertain?'SMTP delivery outcome is uncertain':'SMTP delivery failed permanently');throw error;}
      await setDelivery("update finance_notification_deliveries set status='accepted',accepted_at=now(),lease_expires_at=null,updated_at=now() where workspace_id=$1 and user_id=$2 and id=$3 and status='processing'",[message.workspaceId,message.userId,message.deliveryId]);
      await setDelivery('update finance_notifications set email_sent_at=coalesce(email_sent_at,now()),updated_at=now() where workspace_id=$1 and user_id=$2 and id=$3 and resolved_at is null',[message.workspaceId,message.userId,message.notificationId]);
      return;
    }
    await deliver(message);
}
