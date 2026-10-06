import type {TransactionSql} from 'postgres';
import {appLink} from '../email/layout';
/** Resolve a payable link at delivery time. Never create a checkout from email work. */
export async function invoicePaymentLink(tx:TransactionSql,ws:string,invoiceId:string,requestId:string|null=null){
 const [row]=await tx.unsafe(`select p.id,p.public_token,p.provider_expiry,c.sandbox from payment_requests p
 join payment_connections c on c.workspace_id=p.workspace_id and c.id=p.connection_id
 join invoices i on i.workspace_id=p.workspace_id and i.id=p.invoice_id
 where p.workspace_id=$1 and p.invoice_id=$2 and ($3::uuid is null or p.id=$3)
 and c.provider='pakasir' and p.checkout_method='qris' and p.state='ready'
 and p.provider_status->>'status' is distinct from 'SUCCESS'
 and i.state='issued' and i.archived_at is null and p.amount>0
 and p.amount=i.total-coalesce((select sum(r.amount-r.refunded_amount) from invoice_payments r where r.workspace_id=i.workspace_id and r.invoice_id=i.id and r.reversed_at is null),0)
 order by p.created_at desc limit 1`,[ws,invoiceId,requestId]);
 if(!row||typeof row.public_token!=='string'||!/^[0-9a-f]{64}$/.test(row.public_token)||!row.provider_expiry||Date.parse(row.provider_expiry)<=Date.now()||!Number.isFinite(Date.parse(row.provider_expiry)))return null;
 const url=new URL('/pay/'+row.public_token,process.env.PUBLIC_APP_URL??process.env.WEB_ORIGIN??appLink('/'));
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Configure a valid public frontend origin for payment emails.');
 return {id:String(row.id),url:url.href,sandbox:Boolean(row.sandbox),expiresAt:String(row.provider_expiry)};
}
