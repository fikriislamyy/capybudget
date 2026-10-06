import { createHash } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { q, reject, assertUnlinkedBusinessTransaction, makeTransaction, reverseTransaction, dirtyUnusualBaselines, audit, learnCategory, normalizedCategoryMerchant, refreshLearnedCategory, type Actor, type Input } from '../routes';
const error = (message:string) => { throw Object.assign(new Error(message), {status:409,code:'BULK_CONFLICT'}); };
export async function bulkPreview(tx:TransactionSql,ws:string,actor:Actor,body:any) {
  if(!body || !['edit','delete','restore'].includes(body.action) || !Array.isArray(body.items) || !body.items.length || body.items.length>100)reject('Choose 1–100 transactions and a valid action.');
  const ids=body.items.map((x:any)=>x.id);
  if(new Set(ids).size!==ids.length || ids.some((x:any)=>typeof x!=='string'||!/^[0-9a-f-]{36}$/i.test(x)) || body.items.some((x:any)=>!Number.isInteger(x.version)))reject('Each selected transaction needs its current ID and version.');
  const changes=body.changes??{};
  if(Object.keys(changes).some(k=>!['date','categoryId','tagIds'].includes(k))||body.action==='edit'&&!Object.keys(changes).length)reject('Bulk edits support date, category, and tags.');
  const rows=await q(tx,'select id,type,amount::text,currency,version,deleted_at,category_id from transactions where workspace_id=$1 and id=any($2::uuid[]) order by id',[ws,ids]);
  if(rows.length!==ids.length)error('A selected transaction is unavailable in this workspace.');
  for(const row of rows){if(row.version!==body.items.find((x:any)=>x.id===row.id).version)error('A selected transaction changed. Refresh your selection.');if(body.action==='restore'?!row.deleted_at:row.deleted_at)error('The selection includes a transaction in a different deletion state.');if(changes.categoryId&&(row.type==='transfer'||!row.category_id))reject('Category bulk edits require unsplit income or expense records.');}
  if(changes.categoryId){const [category]=await q(tx,'select id,type from categories where workspace_id=$1 and id=$2 and archived_at is null',[ws,changes.categoryId]);if(!category||rows.some((r:any)=>r.type!==category.type))reject('Choose a category matching every selected transaction type.');}
  const request={action:body.action,items:body.items,changes},hash=createHash('sha256').update(JSON.stringify(request)).digest('hex');
  const [operation]=await q(tx,'insert into bulk_operations(workspace_id,actor_user_id,action,request,request_hash) values($1,$2,$3,$4::jsonb,$5) returning id',[ws,actor.id,body.action,JSON.stringify(request),hash]);
  return {operationId:operation!.id,items:rows,count:rows.length,action:body.action,changes};
}
export async function bulkApply(tx:TransactionSql,ws:string,actor:Actor,id:string) {
  const [op]=await q(tx,'select * from bulk_operations where workspace_id=$1 and id=$2 and actor_user_id=$3 for update',[ws,id,actor.id]);
  if(!op)error('Preview not found.');if(op.status==='applied')return op.result;
  const request=op.request;
  const rows=await q(tx,'select * from transactions where workspace_id=$1 and id=any($2::uuid[]) order by id for update',[ws,request.items.map((x:any)=>x.id)]);
  if(rows.length!==request.items.length)error('A selected record is unavailable.');
  for(const before of rows){
    await assertUnlinkedBusinessTransaction(tx,ws,before.id);
    if(before.version!==request.items.find((x:any)=>x.id===before.id).version)error('A selected transaction changed since preview. Preview the batch again.');
    if(request.action==='restore'?!before.deleted_at:before.deleted_at)error('A selected transaction changed deletion state.');
    if(request.action!=='restore'){
      await q(tx,'delete from category_feedback where workspace_id=$1 and user_id=$2 and transaction_id=$3',[ws,actor.id,before.id]);
    }
    if(request.action==='edit'){
      const tags=await q(tx,'select tag_id from transaction_tags where workspace_id=$1 and transaction_id=$2',[ws,before.id]);
      const splits=await q(tx,'select category_id as "categoryId",amount::text,notes from transaction_splits where workspace_id=$1 and transaction_id=$2 order by position',[ws,before.id]);
      await reverseTransaction(tx,ws,actor,before.id,before.occurred_at);
      const input:Input={type:before.type,accountId:before.account_id,destinationAccountId:before.destination_account_id??undefined,categoryId:request.changes.categoryId??before.category_id??undefined,amount:String(before.amount),date:request.changes.date??String(before.occurred_at),notes:before.notes,merchant:before.merchant,tagIds:request.changes.tagIds??tags.map((x:any)=>x.tag_id),splits:splits.length?splits as any:undefined,destinationAmount:before.destination_amount?String(before.destination_amount):undefined};
      await makeTransaction(tx,ws,actor,input,before.id,before);
    }else if(request.action==='delete'){
      await reverseTransaction(tx,ws,actor,before.id,before.occurred_at);
      await q(tx,'update transactions set deleted_at=now(),deleted_by=$1,updated_by=$1,version=version+1,updated_at=now() where workspace_id=$2 and id=$3',[actor.id,ws,before.id]);
    }else{
      const [reversal]=await q(tx,"select id from journal_entries where workspace_id=$1 and transaction_id=$2 and reason='reversal' order by created_at desc limit 1",[ws,before.id]);
      if(!reversal)error('A deleted transaction has no reversal to restore.');
      const [entry]=await q(tx,"insert into journal_entries(workspace_id,transaction_id,effective_date,reason,reverses_entry_id,created_by) values($1,$2,$3,'restore',$4,$5) returning id",[ws,before.id,before.occurred_at,reversal.id,actor.id]);
      await q(tx,'insert into journal_lines(workspace_id,entry_id,ledger_account_id,debit,credit,currency,base_debit,base_credit) select workspace_id,$1,ledger_account_id,credit,debit,currency,base_credit,base_debit from journal_lines where workspace_id=$2 and entry_id=$3',[entry!.id,ws,reversal.id]);
      await q(tx,'update transactions set deleted_at=null,deleted_by=null,updated_by=$1,version=version+1,updated_at=now() where workspace_id=$2 and id=$3',[actor.id,ws,before.id]);
    }
    const merchant=normalizedCategoryMerchant(before.merchant);
    if(merchant)await refreshLearnedCategory(tx,ws,actor.id,before.type,merchant);
    if(request.action==='restore')await learnCategory(tx,ws,actor,{id:before.id,type:before.type,categoryId:before.category_id,merchant:before.merchant,version:before.version+1});
    if(request.action!=='edit')await q(tx,"update finance_notifications set resolved_at=coalesce(resolved_at,now()),resolution_reason=$1,updated_at=now() where workspace_id=$2 and kind='unusual-spending' and source_type='transaction' and source_id=$3 and resolved_at is null",['transaction_'+(request.action==='restore'?'restored':'deleted'),ws,before.id]);
    await dirtyUnusualBaselines(tx,ws,before.category_id,before.currency,before.type,String(before.occurred_at));
    await audit(tx,ws,actor.id,'transaction',before.id,'bulk-'+request.action,{...before,operationId:id},request.changes);
  }
  const result={operationId:id,count:rows.length,action:request.action,items:rows.map((x:any)=>({id:x.id,version:x.version+1}))};
  await q(tx,"update bulk_operations set status='applied',result=$1::jsonb,applied_at=now() where workspace_id=$2 and id=$3",[JSON.stringify(result),ws,id]);
  return result;
}
