import {revealRow} from '../security/business-fields';
import { client } from '../db';
import { enqueueEmail } from '../email/queue';
import { getAttachment } from '../tracking/storage';
import type { EmailMessage } from '../email/types';
let dispatching=false;
export async function dispatchInvoiceDeliveries(){
 if(dispatching)return;dispatching=true;
 try{
  const workspaces=await client.unsafe("select id,owner_user_id from workspaces where kind='business' and archived_at is null");
  for(const ws of workspaces){
   try{
    const due=await client.begin(async tx=>{
     await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[ws.owner_user_id,ws.id]);
     return tx.unsafe("with pending as (select d.id from invoice_deliveries d join invoices i on i.workspace_id=d.workspace_id and i.id=d.invoice_id where d.workspace_id=$1 and i.state='issued' and ((d.state in ('pending','failed') and d.next_attempt_at<=now()) or (d.state='queued' and d.lease_until<now())) order by d.created_at for update of d skip locked limit 25) update invoice_deliveries d set state='queued',lease_until=now()+interval '3 minutes',updated_at=now() from pending p where d.id=p.id returning d.id,d.workspace_id,d.requested_by,d.recipient_snapshot,d.locale,d.invoice_id,d.purpose,d.reminder_message_snapshot",[ws.id]);
    });
    for(const raw of due){
     const d=revealRow(raw,ws.id);
     try{
      const [inv]=await client.unsafe('select number from invoices where workspace_id=$1 and id=$2',[ws.id,d.invoice_id]);
      if(d.purpose==='reminder')await enqueueEmail({kind:'invoice-reminder',to:d.recipient_snapshot,invoiceNumber:inv.number,reminderMessage:d.reminder_message_snapshot,workspaceId:d.workspace_id,deliveryId:d.id,requestedBy:d.requested_by,locale:d.locale,expiresAt:Date.now()+7*86400000},'invoice-reminder-'+d.id);
      else await enqueueEmail({kind:'invoice-delivery',to:d.recipient_snapshot,invoiceNumber:inv.number,workspaceId:d.workspace_id,deliveryId:d.id,requestedBy:d.requested_by,locale:d.locale,expiresAt:Date.now()+7*86400000},'invoice-delivery-'+d.id);
     }catch(error){
      await client.begin(async tx=>{await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[ws.owner_user_id,ws.id]);await tx.unsafe("update invoice_deliveries set state='pending',lease_until=null,next_attempt_at=now()+interval '30 seconds',error_code='queue_unavailable',updated_at=now() where workspace_id=$1 and id=$2 and state='queued'",[ws.id,d.id]);});
      console.error('Invoice delivery queue is unavailable',{deliveryId:d.id,error:error instanceof Error?error.name:'unknown'});
     }
    }
   }catch(error){console.error('Invoice outbox scan failed',{workspaceId:ws.id,error:error instanceof Error?error.name:'unknown'});}
  }
 }finally{dispatching=false;}
}
export async function loadInvoiceDelivery(message:Extract<EmailMessage,{kind:'invoice-delivery'}>){
 return client.begin(async tx=>{
  await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[message.requestedBy,message.workspaceId]);
  const [raw]=await tx.unsafe("select d.id,d.state,d.recipient_snapshot,d.locale,d.document_id,i.number,i.state as invoice_state,b.object_key from invoice_deliveries d join workspace_memberships m on m.workspace_id=d.workspace_id and m.user_id=d.requested_by join invoices i on i.workspace_id=d.workspace_id and i.id=d.invoice_id join business_documents b on b.workspace_id=d.workspace_id and b.id=d.document_id where d.workspace_id=$1 and d.id=$2 and d.requested_by=$3 and b.state='ready' for update of d",[message.workspaceId,message.deliveryId,message.requestedBy]);
  const d=raw?revealRow(raw,message.workspaceId):undefined;
  if(!d||d.state==='cancelled'||d.state==='accepted'||d.invoice_state==='void')return null;
  await tx.unsafe("update invoice_deliveries set state='sending',attempts=attempts+1,lease_until=now()+interval '2 minutes',updated_at=now() where workspace_id=$1 and id=$2",[message.workspaceId,message.deliveryId]);
  return {to:d.recipient_snapshot,locale:d.locale,number:d.number,objectKey:d.object_key};
 });
}
export async function markInvoiceDeliveryAccepted(message:Extract<EmailMessage,{kind:'invoice-delivery'}>){
 return client.begin(async tx=>{
  await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[message.requestedBy,message.workspaceId]);
  await tx.unsafe("update invoice_deliveries set state='accepted',accepted_at=now(),lease_until=null,error_code=null,updated_at=now() where workspace_id=$1 and id=$2 and state='sending'",[message.workspaceId,message.deliveryId]);
  await tx.unsafe('update invoices set first_sent_at=coalesce(first_sent_at,now()),updated_at=now() where workspace_id=$1 and id=(select invoice_id from invoice_deliveries where workspace_id=$1 and id=$2)',[message.workspaceId,message.deliveryId]);
 });
}
export async function markInvoiceDeliveryFailed(message:Extract<EmailMessage,{kind:'invoice-delivery'}>,uncertain=false){
 return client.begin(async tx=>{
  await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[message.requestedBy,message.workspaceId]);
  await tx.unsafe("update invoice_deliveries set state=$3,lease_until=null,error_code=$4,next_attempt_at=now()+interval '1 hour',updated_at=now() where workspace_id=$1 and id=$2 and state='sending'",[message.workspaceId,message.deliveryId,uncertain?'uncertain':'failed',uncertain?'smtp_outcome_uncertain':'smtp_delivery_failed']);
 });
}
export async function sendInvoicePdf(message:Extract<EmailMessage,{kind:'invoice-delivery'}>){
 const delivery=await loadInvoiceDelivery(message);if(!delivery)return false;
 const object=await getAttachment(delivery.objectKey),bytes=new Uint8Array(await object.Body!.transformToByteArray());
 const {sendEmail}=await import('../email/mailer');
 await sendEmail({...message,to:delivery.to,invoiceNumber:delivery.number,locale:delivery.locale},[{filename:'invoice-'+delivery.number+'.pdf',content:bytes,contentType:'application/pdf'}]);
 await markInvoiceDeliveryAccepted(message);
 return true;
}
export async function sendInvoiceReminder(message:Extract<EmailMessage,{kind:'invoice-reminder'}>){
 const delivery=await client.begin(async tx=>{
  await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[message.requestedBy,message.workspaceId]);
  const [row]=await tx.unsafe(`select d.id,d.state,d.recipient_snapshot,d.locale,d.reminder_message_snapshot,i.number,i.total::text,
    (i.total>coalesce((select sum(p.amount) from invoice_payments p where p.workspace_id=i.workspace_id and p.invoice_id=i.id and p.reversed_at is null),0)) as has_outstanding,i.state as invoice_state
    from invoice_deliveries d join workspace_memberships m on m.workspace_id=d.workspace_id and m.user_id=d.requested_by
    join invoices i on i.workspace_id=d.workspace_id and i.id=d.invoice_id
    where d.workspace_id=$1 and d.id=$2 and d.requested_by=$3 and d.purpose='reminder' for update of d`,[message.workspaceId,message.deliveryId,message.requestedBy]);
  if(!row||['cancelled','accepted'].includes(row.state)||row.invoice_state!=='issued'||!row.has_outstanding){if(row&&row.state!=='accepted')await tx.unsafe("update invoice_deliveries set state='cancelled',updated_at=now() where workspace_id=$1 and id=$2",[message.workspaceId,message.deliveryId]);return null;}
  await tx.unsafe("update invoice_deliveries set state='sending',attempts=attempts+1,lease_until=now()+interval '2 minutes',updated_at=now() where workspace_id=$1 and id=$2",[message.workspaceId,message.deliveryId]);
  const decrypted=revealRow(row,message.workspaceId);return {to:decrypted.recipient_snapshot,locale:row.locale,number:row.number,message:decrypted.reminder_message_snapshot};
 });
 if(!delivery)return false;
 const {sendEmail}=await import('../email/mailer');await sendEmail({...message,to:delivery.to,invoiceNumber:delivery.number,reminderMessage:delivery.message,locale:delivery.locale});
 await client.begin(async tx=>{await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[message.requestedBy,message.workspaceId]);await tx.unsafe("update invoice_deliveries set state='accepted',accepted_at=now(),lease_until=null,error_code=null,updated_at=now() where workspace_id=$1 and id=$2 and state='sending'",[message.workspaceId,message.deliveryId]);});
 return true;
}
export async function markInvoiceReminderFailed(message:Extract<EmailMessage,{kind:'invoice-reminder'}>,uncertain=false){
 await client.begin(async tx=>{await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[message.requestedBy,message.workspaceId]);await tx.unsafe("update invoice_deliveries set state=$3,lease_until=null,error_code=$4,next_attempt_at=now()+interval '1 hour',updated_at=now() where workspace_id=$1 and id=$2 and state='sending'",[message.workspaceId,message.deliveryId,uncertain?'uncertain':'failed',uncertain?'smtp_outcome_uncertain':'smtp_delivery_failed']);});
}
export function startInvoiceDeliveryScheduler(){
 void dispatchInvoiceDeliveries();const timer=setInterval(()=>void dispatchInvoiceDeliveries(),30_000);timer.unref();
}
