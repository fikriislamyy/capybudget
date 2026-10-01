import { Elysia } from 'elysia';
import { createHash, randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { auth } from '../auth';
import { client } from '../db';
import { nextOccurrenceDate, workspaceToday, type RecurrenceFrequency } from './recurrence';
import { deleteAttachment, getAttachment, putAttachment } from './storage';
import { scheduleRecurringWorkspace } from './queue';

type Actor = { id: string; name: string };
type Input = {
  type: 'income' | 'expense' | 'transfer';
  accountId: string;
  destinationAccountId?: string;
  categoryId?: string;
  amount: string;
  currency?: string;
  date: string;
  notes?: string;
  merchant?: string;
  tagIds?: string[];
};
const uuidRe = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const amountRe = /^(0|[1-9]\d{0,14})(\.\d{1,4})?$/;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function fail(status: number, code: string, message: string) {
  return Response.json({ code, message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
function reject(message: string): never {
  throw Object.assign(new Error(message), { status: 422, code: 'INVALID_INPUT' });
}
function decimal(value: unknown) {
  if (typeof value !== 'string' || !amountRe.test(value) || Number(value) === 0) reject('Enter a positive amount with at most four decimal places.');
  return value;
}
function isoDate(value: unknown) {
  if (typeof value !== 'string' || !dateRe.test(value) || new Date(value + 'T00:00:00Z').toISOString().slice(0,10) !== value) reject('Enter a valid date in YYYY-MM-DD format.');
  return value;
}
async function readLimitedBody(request:Request,limit:number){
  if(!request.body)return new Uint8Array();
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let length=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw new RangeError('body too large');}chunks.push(value);}
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
async function actorFor(request: Request): Promise<Actor | Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return fail(401,'AUTH_REQUIRED','Sign in to continue.');
  if (!session.user.emailVerified) return fail(403,'EMAIL_VERIFICATION_REQUIRED','Verify your email to continue.');
  return { id: session.user.id, name: session.user.name };
}
async function withWorkspace<T>(request: Request, workspaceId: string, run: (tx: TransactionSql, actor: Actor) => Promise<T>): Promise<T | Response> {
  if (!uuidRe.test(workspaceId)) return fail(400,'INVALID_WORKSPACE_ID','Workspace ID is invalid.');
  const actor = await actorFor(request);
  if (actor instanceof Response) return actor;
  try {
    return await client.begin(async (tx) => {
      await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[actor.id,workspaceId]);
      const membership = await tx.unsafe('select 1 from workspace_memberships where workspace_id=$1 and user_id=$2',[workspaceId,actor.id]);
      if (!membership.length) throw Object.assign(new Error('Workspace not found.'),{status:404,code:'WORKSPACE_NOT_FOUND'});
      return run(tx,actor);
    }) as T | Response;
  } catch (e) {
    const err=e as Error & {status?:number;code?:string};
    if(err.status) return fail(err.status,err.code??'REQUEST_FAILED',err.message);
    if(['23505','23503','23514'].includes(err.code??'')) return fail(422,'INVALID_REFERENCE','One or more selected values are invalid.');
    console.error('Tracking request failed',{sqlState:err.code});
    return fail(500,'INTERNAL_ERROR','The request could not be completed.');
  }
}
const q = (tx: TransactionSql, text: string, values: unknown[] = []) => tx.unsafe(text,values as never[]);

async function seed(tx: TransactionSql, workspaceId: string, currency: string) {
  await q(tx,"insert into ledger_accounts(workspace_id,code,name,class,currency) values($1,'equity:opening','Opening balance','equity',$2) on conflict do nothing",[workspaceId,currency]);
  const defaults=[['income','Salary','leaf'],['income','Other income','circle-plus'],['expense','Food and dining','utensils'],['expense','Transport','car'],['expense','Housing','house'],['expense','Bills and utilities','zap'],['expense','Shopping','shopping-bag'],['expense','Health','heart-pulse'],['expense','Entertainment','clapperboard'],['expense','Other expense','circle-help']];
  for(let i=0;i<defaults.length;i++){
    const [type,name,icon]=defaults[i]!;
    const code='category:'+type+':'+i;
    await q(tx,'insert into ledger_accounts(workspace_id,code,name,class,currency) values($1,$2,$3,$4,$5) on conflict do nothing',[workspaceId,code,name,type,currency]);
    await q(tx,'insert into categories(workspace_id,name,normalized_name,type,ledger_account_id,icon,sort_order) select $1,$2,lower($2),$3,id,$4,$5 from ledger_accounts where workspace_id=$1 and code=$6 on conflict do nothing',[workspaceId,name,type,icon,i,code]);
  }
}
async function audit(tx: TransactionSql, ws: string, actor: string, type: string, id: string, action: string, before: unknown, after: unknown) {
  await q(tx,'insert into audit_logs(workspace_id,actor_user_id,entity_type,entity_id,action,before,after) values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',[ws,actor,type,id,action,before?JSON.stringify(before):null,after?JSON.stringify(after):null]);
}

async function learnCategory(tx:TransactionSql,ws:string,actor:Actor,transaction:any,previousCategoryId?:string|null){
  if(!['income','expense'].includes(transaction.type)||!transaction.categoryId)return;
  const merchant=String(transaction.merchant??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US').slice(0,200);if(!merchant)return;
  await q(tx,'insert into assistant_settings(workspace_id,user_id) values($1,$2) on conflict do nothing',[ws,actor.id]);
  const [prefs]=await q(tx,'select categorization_enabled,consent_version,source_permissions from assistant_settings where workspace_id=$1 and user_id=$2',[ws,actor.id]);if(!prefs?.categorization_enabled||!(prefs.source_permissions?.merchant??false))return;
  const matches=await q(tx,'select id,category_id as "categoryId",origin,matcher_type as "matcherType" from category_rules where workspace_id=$1 and user_id=$2 and transaction_type=$3 and enabled and ((matcher_type=\'merchant_exact\' and normalized_match=$4) or (matcher_type=\'merchant_contains\' and strpos($4::text,normalized_match)>0)) order by case when origin=\'explicit\' then 0 else 1 end,matcher_type,support_count desc limit 1',[ws,actor.id,transaction.type,merchant]);
  const matched=matches[0],source=matched?.origin==='explicit'?'explicit_rule':matched?.origin==='learned'?'learned_rule':'manual';
  const decision=matched&&matched.categoryId===transaction.categoryId?'accepted':matched?'corrected':'accepted';
  await q(tx,'insert into category_feedback(workspace_id,user_id,transaction_id,transaction_version,previous_category_id,chosen_category_id,normalized_merchant,prediction_source,rule_id,decision,consent_version) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict(workspace_id,user_id,transaction_id,transaction_version) do nothing',[ws,actor.id,transaction.id,transaction.version,previousCategoryId??null,transaction.categoryId,merchant,source,matched?.id??null,decision,prefs.consent_version]);
  await refreshLearnedCategory(tx,ws,actor.id,transaction.type,merchant);
}

function normalizedCategoryMerchant(value: unknown) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US').slice(0, 200);
}

async function refreshLearnedCategory(tx:TransactionSql,ws:string,userId:string,type:string,merchant:string){
  const groups=await q(tx,`select chosen_category_id as "categoryId",count(*)::int as count from (
    select distinct on(f.transaction_id) f.transaction_id,f.chosen_category_id,f.transaction_version
    from category_feedback f join transactions t on t.workspace_id=f.workspace_id and t.id=f.transaction_id
    where f.workspace_id=$1 and f.user_id=$2 and f.normalized_merchant=$3 and t.type=$4 and t.deleted_at is null
    order by f.transaction_id,f.transaction_version desc
  ) current group by chosen_category_id order by count desc`,[ws,userId,merchant,type]);
  const total=groups.reduce((sum:number,row:any)=>sum+Number(row.count),0),winner=groups[0];
  const accepted=winner?Number(winner.count):0;
  if(total>=3&&winner&&accepted/total>=0.9){
    await q(tx,`insert into category_rules(workspace_id,user_id,transaction_type,matcher_type,normalized_match,category_id,origin,support_count,accepted_count,rejected_count,enabled)
      values($1,$2,$3,'merchant_exact',$4,$5,'learned',$6,$7,$8,true)
      on conflict(workspace_id,user_id,transaction_type,matcher_type,normalized_match) do update set category_id=excluded.category_id,origin='learned',support_count=excluded.support_count,accepted_count=excluded.accepted_count,rejected_count=excluded.rejected_count,enabled=true,version=category_rules.version+1,updated_at=now() where category_rules.origin='learned'`,[ws,userId,type,merchant,winner.categoryId,total,accepted,total-accepted]);
  }else{
    await q(tx,"update category_rules set enabled=false,support_count=$5,accepted_count=$6,rejected_count=$5::int-$6::int,version=version+1,updated_at=now() where workspace_id=$1 and user_id=$2 and transaction_type=$3 and matcher_type='merchant_exact' and normalized_match=$4 and origin='learned'",[ws,userId,type,merchant,total,accepted]);
  }
}

async function dirtyUnusualBaselines(tx:TransactionSql,ws:string,categoryId:string|null,currency:string,type:string,date:string){
  if(type!=='expense')return;
  const [workspace]=await q(tx,'select owner_user_id from workspaces where id=$1',[ws]);if(!workspace)return;
  const rules=await q(tx,"select scope_key from finance_notification_rules where workspace_id=$1 and user_id=$2 and rule_type='unusual_spending' and enabled and currency=$3 and category_id is not distinct from $4::uuid",[ws,workspace.owner_user_id,currency,categoryId]);
  for(const rule of rules)await q(tx,"insert into finance_notification_evaluation_state(workspace_id,user_id,rule_key,scope_key,period_key,state,dirty_version,processed_version) values($1,$2,'unusual_spending',$3,'dirty',jsonb_build_object('fromDate',($4::date+1)::text,'throughDate',($4::date+90)::text,'lastId',null),1,0) on conflict(workspace_id,user_id,rule_key,scope_key,period_key) do update set state=jsonb_build_object('fromDate',least(coalesce(nullif(finance_notification_evaluation_state.state->>'fromDate','')::date,(excluded.state->>'fromDate')::date),(excluded.state->>'fromDate')::date)::text,'throughDate',greatest(coalesce(nullif(finance_notification_evaluation_state.state->>'throughDate','')::date,(excluded.state->>'throughDate')::date),(excluded.state->>'throughDate')::date)::text,'lastId',null),dirty_version=finance_notification_evaluation_state.dirty_version+1,next_evaluation_at=now(),updated_at=now()",[ws,workspace.owner_user_id,rule.scope_key,date]);
}

async function makeTransaction(tx: TransactionSql, ws: string, actor: Actor, input: Input, existingId?: string, before?:any) {
  if(!['income','expense','transfer'].includes(input.type)) reject('Choose a valid transaction type.');
  if(!uuidRe.test(input.accountId)) reject('Choose an account.');
  const amount=decimal(input.amount), date=isoDate(input.date);
  if((input.notes?.length??0)>2000 || (input.merchant?.length??0)>200) reject('Notes or merchant name is too long.');
  if(!input.notes?.trim()&&!input.merchant?.trim()) reject('Add a note or merchant name.');
  const [account]=await q(tx,'select id,ledger_account_id,currency from accounts where workspace_id=$1 and id=$2 and archived_at is null and deleted_at is null',[ws,input.accountId]);
  if(!account) reject('Choose an active account in this workspace.');
  let category:any=null, destination:any=null;
  if(input.type==='transfer'){
    if(!input.destinationAccountId||!uuidRe.test(input.destinationAccountId)||input.destinationAccountId===input.accountId||input.categoryId) reject('Choose two different accounts for this transfer.');
    [destination]=await q(tx,'select id,ledger_account_id,currency from accounts where workspace_id=$1 and id=$2 and archived_at is null and deleted_at is null',[ws,input.destinationAccountId]);
    if(!destination||destination.currency!==account.currency) reject('Choose a destination account in the same currency.');
  }else{
    if(!input.categoryId||!uuidRe.test(input.categoryId)||input.destinationAccountId) reject('Choose a category for this transaction.');
    [category]=await q(tx,'select id,type,ledger_account_id from categories where workspace_id=$1 and id=$2 and archived_at is null',[ws,input.categoryId]);
    if(!category||category.type!==input.type) reject('Choose an active category matching the transaction type.');
    if(input.currency&&input.currency!==account.currency) reject('Transaction currency must match its account.');
  }
  const tags=[...new Set(input.tagIds??[])];
  if(tags.length>20||tags.some(id=>!uuidRe.test(id))) reject('Choose up to 20 valid tags.');
  const id=existingId??randomUUID();
  const [row]=existingId
    ? await q(tx,'update transactions set account_id=$1,destination_account_id=$2,category_id=$3,amount=$4,currency=$5,type=$6,occurred_at=$7,notes=$8,merchant=$9,updated_by=$10,updated_at=now(),version=version+1 where workspace_id=$11 and id=$12 returning id,type,account_id as "accountId",destination_account_id as "destinationAccountId",category_id as "categoryId",amount::text,currency,occurred_at as date,notes,merchant,version',[input.accountId,input.destinationAccountId??null,input.categoryId??null,amount,account.currency,input.type,date,input.notes?.trim()??null,input.merchant?.trim()??null,actor.id,ws,id])
    : await q(tx,'insert into transactions(id,workspace_id,account_id,destination_account_id,category_id,amount,currency,type,occurred_at,notes,merchant,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) returning id,type,account_id as "accountId",destination_account_id as "destinationAccountId",category_id as "categoryId",amount::text,currency,occurred_at as date,notes,merchant,version',[id,ws,input.accountId,input.destinationAccountId??null,input.categoryId??null,amount,account.currency,input.type,date,input.notes?.trim()??null,input.merchant?.trim()??null,actor.id]);
  if(before)await dirtyUnusualBaselines(tx,ws,before.category_id,before.currency,before.type,String(before.occurred_at).slice(0,10));
  await dirtyUnusualBaselines(tx,ws,input.type==='expense'?input.categoryId??null:null,account.currency,input.type,date);
  if(existingId)await q(tx,'delete from transaction_tags where workspace_id=$1 and transaction_id=$2',[ws,id]);
  const journalId=randomUUID();
  await q(tx,'insert into journal_entries(id,workspace_id,transaction_id,effective_date,reason,created_by) values($1,$2,$3,$4,$5,$6)',[journalId,ws,id,date,'create',actor.id]);
  let lines:{ledger:string;debit:string;credit:string}[];
  if(input.type==='transfer') lines=[{ledger:destination.ledger_account_id,debit:amount,credit:'0'},{ledger:account.ledger_account_id,debit:'0',credit:amount}];
  else if(input.type==='income') lines=[{ledger:account.ledger_account_id,debit:amount,credit:'0'},{ledger:category.ledger_account_id,debit:'0',credit:amount}];
  else lines=[{ledger:category.ledger_account_id,debit:amount,credit:'0'},{ledger:account.ledger_account_id,debit:'0',credit:amount}];
  for(const line of lines) await q(tx,'insert into journal_lines(workspace_id,entry_id,ledger_account_id,debit,credit,currency) values($1,$2,$3,$4,$5,$6)',[ws,journalId,line.ledger,line.debit,line.credit,account.currency]);
  for(const tagId of tags){
    const [tag]=await q(tx,'select id from tags where workspace_id=$1 and id=$2 and archived_at is null',[ws,tagId]);
    if(!tag) reject('A selected tag is unavailable.');
    await q(tx,'insert into transaction_tags(workspace_id,transaction_id,tag_id) values($1,$2,$3)',[ws,id,tagId]);
  }
  await audit(tx,ws,actor.id,'transaction',id,'create',null,row);
  return {...row,id,journalId};
}

async function materializeRecurring(tx:TransactionSql,workspaceId:string,actor:Actor,days=30){
  const horizon=Math.min(60,Math.max(1,days));
  const [workspace]=await q(tx,'select timezone from workspaces where id=$1',[workspaceId]);
  const today=workspaceToday(workspace.timezone),until=new Date(Date.now()+horizon*86400000).toISOString().slice(0,10);
  const rules=await q(tx,"select * from recurring_rules where workspace_id=$1 and status='active' order by next_due_date for update",[workspaceId]);
  for(const rule of rules){
    const pending=await q(tx,"select id,scheduled_date,template_snapshot from recurring_occurrences where workspace_id=$1 and rule_id=$2 and status='pending' and scheduled_date<=$3 order by scheduled_date for update",[workspaceId,rule.id,today]);
    if(rule.mode==='auto')for(const occurrence of pending){
      const snap=occurrence.template_snapshot;
      const transaction=await makeTransaction(tx,workspaceId,actor,{type:snap.type,accountId:snap.accountId,destinationAccountId:snap.destinationAccountId??undefined,categoryId:snap.categoryId??undefined,amount:snap.amount,currency:snap.currency,date:occurrence.scheduled_date,notes:snap.notes});
      await q(tx,"update recurring_occurrences set status='posted',transaction_id=$1,updated_at=now() where workspace_id=$2 and id=$3",[transaction.id,workspaceId,occurrence.id]);
    }
    let step=Number(rule.next_occurrence_index),due=nextOccurrenceDate(String(rule.anchor_date),rule.frequency as RecurrenceFrequency,rule.interval,step),created=0;
    while(due<=until&&created<100&&(!rule.end_date||due<=String(rule.end_date))){
      const snapshot={type:rule.type,accountId:rule.account_id,destinationAccountId:rule.destination_account_id,categoryId:rule.category_id,amount:String(rule.amount),currency:rule.currency,notes:rule.notes??rule.name};
      const [occurrence]=await q(tx,"insert into recurring_occurrences(workspace_id,rule_id,scheduled_date,rule_version,template_snapshot,status) values($1,$2,$3,$4,$5::jsonb,'pending') on conflict(workspace_id,rule_id,scheduled_date) do nothing returning id,status",[workspaceId,rule.id,due,rule.version,JSON.stringify(snapshot)]);
      if(occurrence&&rule.mode==='auto'&&due<=today){
        const transaction=await makeTransaction(tx,workspaceId,actor,{...snapshot,date:due} as Input);
        await q(tx,"update recurring_occurrences set status='posted',transaction_id=$1,updated_at=now() where workspace_id=$2 and id=$3",[transaction.id,workspaceId,occurrence.id]);
      }
      step++;created++;due=nextOccurrenceDate(String(rule.anchor_date),rule.frequency as RecurrenceFrequency,rule.interval,step);
    }
    if(rule.end_date&&due>String(rule.end_date))await q(tx,"update recurring_rules set status='archived',updated_at=now(),version=version+1 where workspace_id=$1 and id=$2",[workspaceId,rule.id]);
    else await q(tx,'update recurring_rules set next_due_date=$1,next_occurrence_index=$2,updated_at=now() where workspace_id=$3 and id=$4',[due,step,workspaceId,rule.id]);
  }
  return q(tx,'select o.id,o.rule_id as "ruleId",r.name as "ruleName",o.scheduled_date as date,o.status,o.transaction_id as "transactionId",o.template_snapshot->>\'amount\' as amount,o.template_snapshot->>\'currency\' as currency from recurring_occurrences o join recurring_rules r on r.id=o.rule_id where o.workspace_id=$1 and o.scheduled_date between $2::date and $3::date order by o.scheduled_date,r.name',[workspaceId,today,until]);
}

/** Worker entry point: establish fresh, transaction-local tenant context for one owner workspace. */
export async function processRecurringWorkspace(workspaceId:string,ownerUserId:string){
  return client.begin(async(tx)=>{
    await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[ownerUserId,workspaceId]);
    const [membership]=await tx.unsafe('select 1 from workspace_memberships where workspace_id=$1 and user_id=$2',[workspaceId,ownerUserId]);
    if(!membership)return 0;
    const items=await materializeRecurring(tx,workspaceId,{id:ownerUserId,name:'CapyBudget scheduler'},30);
    return items.length;
  });
}

async function reverseTransaction(tx: TransactionSql, ws: string, actor: Actor, id: string, date: string) {
  const [old]=await q(tx,'select j.id from journal_entries j where j.workspace_id=$1 and j.transaction_id=$2 and j.reason in (\'create\',\'restore\') and not exists(select 1 from journal_entries r where r.workspace_id=j.workspace_id and r.reverses_entry_id=j.id) order by j.created_at desc limit 1 for update',[ws,id]);
  if(!old)return;
  const lines=await q(tx,'select ledger_account_id,debit::text,credit::text,currency from journal_lines where workspace_id=$1 and entry_id=$2',[ws,old.id]);
  const reversalId=randomUUID();
  await q(tx,'insert into journal_entries(id,workspace_id,transaction_id,effective_date,reason,reverses_entry_id,created_by) values($1,$2,$3,$4,\'reversal\',$5,$6)',[reversalId,ws,id,date,old.id,actor.id]);
  for(const line of lines)await q(tx,'insert into journal_lines(workspace_id,entry_id,ledger_account_id,debit,credit,currency) values($1,$2,$3,$4,$5,$6)',[ws,reversalId,line.ledger_account_id,line.credit,line.debit,line.currency]);
}

export const trackingRoutes=new Elysia({name:'tracking-routes'})
 .get('/api/workspaces',async({request})=>{
   const actor=await actorFor(request); if(actor instanceof Response)return actor;
   return client.begin(async(tx)=>{
     await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id','',true)",[actor.id]);
     const items=await tx.unsafe('select w.id,w.name,w.kind,w.currency,w.timezone from workspaces w join workspace_memberships m on m.workspace_id=w.id where m.user_id=$1 and w.archived_at is null order by w.kind,w.created_at',[actor.id]);
     const result=[...items];
     if(!result.some((w:any)=>w.kind==='personal')){
       const [created]=await tx.unsafe("insert into workspaces(owner_user_id,name,kind) values($1,'Personal','personal') on conflict(owner_user_id) where kind='personal' do nothing returning id,name,kind,currency,timezone",[actor.id]);
       const [w]=created?[created]:await tx.unsafe("select id,name,kind,currency,timezone from workspaces where owner_user_id=$1 and kind='personal' and archived_at is null",[actor.id]);
       await tx.unsafe("insert into workspace_memberships(workspace_id,user_id,role) values($1,$2,'owner') on conflict do nothing",[w.id,actor.id]);
       await tx.unsafe("select set_config('app.workspace_id',$1,true)",[String(w.id)]);
       await seed(tx,String(w.id),'IDR'); result.push(w);
     }
     return Response.json({items:result},{headers:{'Cache-Control':'no-store'}});
   });
 })
 .post('/api/workspaces',async({request,body})=>{
   const actor=await actorFor(request);if(actor instanceof Response)return actor;
   const b=body as any;
   if(typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>100||b.kind!=='business')return fail(422,'INVALID_INPUT','Enter a business workspace name.');
   const currency=typeof b.currency==='string'?b.currency.toUpperCase():'IDR';
   const timezone=typeof b.timezone==='string'?b.timezone:'Asia/Jakarta';
   if(!/^[A-Z]{3}$/.test(currency))return fail(422,'INVALID_CURRENCY','Use a three-letter currency code.');
   try{new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{return fail(422,'INVALID_TIMEZONE','Choose a valid timezone.');}
   return client.begin(async(tx)=>{
     await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id','',true)",[actor.id]);
     const [w]=await tx.unsafe("insert into workspaces(owner_user_id,name,kind,currency,timezone) values($1,$2,'business',$3,$4) returning id,name,kind,currency,timezone",[actor.id,b.name.trim(),currency,timezone]);
     await tx.unsafe("insert into workspace_memberships(workspace_id,user_id,role) values($1,$2,'owner')",[w.id,actor.id]);
     await tx.unsafe("select set_config('app.workspace_id',$1,true)",[String(w.id)]);
     await tx.unsafe('insert into business_profiles(workspace_id,legal_name) values($1,$2) on conflict(workspace_id) do nothing',[w.id,b.name.trim()]);
     await seed(tx,String(w.id),currency);return Response.json({workspace:w},{status:201});
   });
 })
 .get('/api/workspaces/:workspaceId/accounts',async({request,params})=>withWorkspace(request,params.workspaceId,async(tx)=>{
   const items=await q(tx,'select a.id,a.name,a.kind,a.currency,a.opening_balance::text as "openingBalance",a.opening_date as "openingDate",a.version,coalesce(sum(l.debit-l.credit),0)::text as balance from accounts a left join journal_lines l on l.workspace_id=a.workspace_id and l.ledger_account_id=a.ledger_account_id where a.workspace_id=$1 and a.archived_at is null and a.deleted_at is null group by a.id order by a.created_at,a.id',[params.workspaceId]);
   return {items};
 }))
 .post('/api/workspaces/:workspaceId/accounts',async({request,params,body})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
   const b=body as any;
   if(typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>100||!['cash','bank','e_wallet','credit_card','savings','investment'].includes(b.kind))reject('Enter a name and valid account type.');
   const balance=typeof b.openingBalance==='string'?b.openingBalance:'0';
   if(!/^-?(0|[1-9]\d{0,14})(\.\d{1,4})?$/.test(balance))reject('Enter a valid opening balance.');
   const openingDate=b.openingDate?isoDate(b.openingDate):new Date().toISOString().slice(0,10);
   const [w]=await q(tx,'select currency from workspaces where id=$1',[params.workspaceId]);
   const id=randomUUID(),ledger=randomUUID();
   await q(tx,'insert into ledger_accounts(id,workspace_id,code,name,class,currency) values($1,$2,$3,$4,$5,$6)',[ledger,params.workspaceId,'wallet:'+id,b.name.trim(),b.kind==='credit_card'?'liability':'asset',w.currency]);
   const [account]=await q(tx,'insert into accounts(id,workspace_id,name,kind,currency,opening_balance,opening_date,ledger_account_id) values($1,$2,$3,$4,$5,$6,$7,$8) returning id,name,kind,currency,opening_balance::text as "openingBalance",opening_date as "openingDate",version',[id,params.workspaceId,b.name.trim(),b.kind,w.currency,balance,openingDate,ledger]);
   if(!/^[-+]?0(?:\.0{1,4})?$/.test(balance)){
     const [equity]=await q(tx,"select id from ledger_accounts where workspace_id=$1 and code='equity:opening'",[params.workspaceId]);
     const j=randomUUID(),abs=balance.startsWith('-')?balance.slice(1):balance;
     const positive=!balance.startsWith('-');
     await q(tx,'insert into journal_entries(id,workspace_id,effective_date,reason,created_by) values($1,$2,$3,\'opening\',$4)',[j,params.workspaceId,openingDate,actor.id]);
     await q(tx,'insert into journal_lines(workspace_id,entry_id,ledger_account_id,debit,credit,currency) values($1,$2,$3,$4,$5,$6),($1,$2,$7,$8,$9,$6)',[params.workspaceId,j,ledger,positive?abs:'0',positive?'0':abs,w.currency,equity.id,positive?'0':abs,positive?abs:'0']);
   }
   await audit(tx,params.workspaceId,actor.id,'account',id,'create',null,account);
   return Response.json({account},{status:201});
 }))
 .patch('/api/workspaces/:workspaceId/accounts/:id',async({request,params,body})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
   const b=body as any;if(!uuidRe.test(params.id))reject('Account ID is invalid.');if(b.archived!==undefined&&typeof b.archived!=='boolean')reject('Archived must be true or false.');
   const [before]=await q(tx,'select * from accounts where workspace_id=$1 and id=$2 and deleted_at is null for update',[params.workspaceId,params.id]);if(!before)return fail(404,'ACCOUNT_NOT_FOUND','Account not found.');
   if(b.name!==undefined&&(typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>100))reject('Enter a valid account name.');
   if(b.archived===true){const [rules]=await q(tx,"select count(*)::int as count from recurring_rules where workspace_id=$1 and status='active' and (account_id=$2 or destination_account_id=$2)",[params.workspaceId,params.id]);if(rules.count)return fail(409,'ACCOUNT_IN_ACTIVE_RULE','Pause or archive recurring rules using this account first.');}
   const [after]=await q(tx,'update accounts set name=coalesce($1,name),archived_at=case when $2::boolean then coalesce(archived_at,now()) when $2::boolean is false then null else archived_at end,updated_at=now(),version=version+1 where workspace_id=$3 and id=$4 returning id,name,kind,currency,archived_at as "archivedAt",version',[b.name?.trim()??null,b.archived??null,params.workspaceId,params.id]);
   await audit(tx,params.workspaceId,actor.id,'account',params.id,b.archived?'archive':b.archived===false?'unarchive':'edit',before,after);return {account:after};
 }))
 .get('/api/workspaces/:workspaceId/categories',async({request,params})=>withWorkspace(request,params.workspaceId,async(tx)=>({items:await q(tx,'select id,name,type,parent_id as "parentId",icon,color,sort_order as "sortOrder" from categories where workspace_id=$1 and archived_at is null order by type,sort_order,name',[params.workspaceId])})))
 .post('/api/workspaces/:workspaceId/categories',async({request,params,body})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
   const b=body as any;
   if(typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>80||!['income','expense'].includes(b.type))reject('Enter a category name and type.');
   const id=randomUUID(),ledger=randomUUID(),name=b.name.trim(),normalized=name.toLocaleLowerCase();
   if(b.parentId){
     if(!uuidRe.test(b.parentId))reject('Parent category is invalid.');
     const [parent]=await q(tx,'select id,type,parent_id from categories where workspace_id=$1 and id=$2 and archived_at is null',[params.workspaceId,b.parentId]);
     if(!parent||parent.type!==b.type||parent.parent_id)reject('Choose a top-level category of the same type.');
   }
   const [workspace]=await q(tx,'select currency from workspaces where id=$1',[params.workspaceId]);
   await q(tx,'insert into ledger_accounts(id,workspace_id,code,name,class,currency) values($1,$2,$3,$4,$5,$6)',[ledger,params.workspaceId,'category:'+id,name,b.type,workspace.currency]);
   const [category]=await q(tx,'insert into categories(id,workspace_id,name,normalized_name,type,parent_id,ledger_account_id,icon,color) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id,name,type,parent_id as "parentId",icon,color',[id,params.workspaceId,name,normalized,b.type,b.parentId??null,ledger,b.icon??null,b.color??null]);
   await audit(tx,params.workspaceId,actor.id,'category',id,'create',null,category);
   return Response.json({category},{status:201});
 }))
 .patch('/api/workspaces/:workspaceId/categories/:id',async({request,params,body})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
   const b=body as any;if(!uuidRe.test(params.id))reject('Category ID is invalid.');if(b.archived!==undefined&&typeof b.archived!=='boolean')reject('Archived must be true or false.');
   const [before]=await q(tx,'select * from categories where workspace_id=$1 and id=$2 for update',[params.workspaceId,params.id]);if(!before)return fail(404,'CATEGORY_NOT_FOUND','Category not found.');
   if(b.name!==undefined&&(typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>80))reject('Enter a valid category name.');
   const [after]=await q(tx,'update categories set name=coalesce($1,name),normalized_name=coalesce(lower($1),normalized_name),archived_at=case when $2::boolean then coalesce(archived_at,now()) when $2::boolean is false then null else archived_at end,updated_at=now() where workspace_id=$3 and id=$4 returning id,name,type,parent_id as "parentId",archived_at as "archivedAt"',[b.name?.trim()??null,b.archived??null,params.workspaceId,params.id]);
   await audit(tx,params.workspaceId,actor.id,'category',params.id,b.archived?'archive':b.archived===false?'unarchive':'edit',before,after);return {category:after};
 }))
 .get('/api/workspaces/:workspaceId/tags',async({request,params})=>withWorkspace(request,params.workspaceId,async(tx)=>({items:await q(tx,'select id,name,color from tags where workspace_id=$1 and archived_at is null order by name',[params.workspaceId])})))
 .post('/api/workspaces/:workspaceId/tags',async({request,params,body})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
   const b=body as any;
   if(typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>50)reject('Enter a tag name.');
   const id=randomUUID(),name=b.name.trim(),normalized=name.toLocaleLowerCase();
   const [tag]=await q(tx,'insert into tags(id,workspace_id,name,normalized_name,color) values($1,$2,$3,$4,$5) returning id,name,color',[id,params.workspaceId,name,normalized,b.color??null]);
   await audit(tx,params.workspaceId,actor.id,'tag',id,'create',null,tag);
   return Response.json({tag},{status:201});
 }))
 .patch('/api/workspaces/:workspaceId/tags/:id',async({request,params,body})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
   const b=body as any;if(!uuidRe.test(params.id))reject('Tag ID is invalid.');if(b.archived!==undefined&&typeof b.archived!=='boolean')reject('Archived must be true or false.');
   const [before]=await q(tx,'select * from tags where workspace_id=$1 and id=$2 for update',[params.workspaceId,params.id]);if(!before)return fail(404,'TAG_NOT_FOUND','Tag not found.');
   if(b.name!==undefined&&(typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>50))reject('Enter a valid tag name.');
   const [after]=await q(tx,'update tags set name=coalesce($1,name),normalized_name=coalesce(lower($1),normalized_name),archived_at=case when $2::boolean then coalesce(archived_at,now()) when $2::boolean is false then null else archived_at end where workspace_id=$3 and id=$4 returning id,name,color,archived_at as "archivedAt"',[b.name?.trim()??null,b.archived??null,params.workspaceId,params.id]);
   await audit(tx,params.workspaceId,actor.id,'tag',params.id,b.archived?'archive':b.archived===false?'unarchive':'edit',before,after);return {tag:after};
 }))
 .get('/api/workspaces/:workspaceId/transactions',async({request,params})=>withWorkspace(request,params.workspaceId,async(tx)=>{
   const u=new URL(request.url),limit=Math.min(100,Math.max(1,Number(u.searchParams.get('limit')??50)||50));
   const from=u.searchParams.get('from'),to=u.searchParams.get('to'),type=u.searchParams.get('type'),qtext=(u.searchParams.get('q')??'').trim().slice(0,100);
   if(from)isoDate(from);if(to)isoDate(to);if(from&&to&&from>to)reject('The start date must be before the end date.');
   if(type&&!['income','expense','transfer'].includes(type))reject('Transaction type is invalid.');
   const sort=u.searchParams.get('sort')??'date',direction=u.searchParams.get('direction')??'desc';
   if(!['date','amount','category','tag'].includes(sort)||!['asc','desc'].includes(direction))reject('Sort field or direction is invalid.');
   const parseIds=(key:string)=>{const raw=u.searchParams.get(key);if(!raw)return undefined;const ids=raw.split(',').filter(Boolean);if(ids.length>100||ids.some(id=>!uuidRe.test(id)))reject('A filter ID is invalid.');return [...new Set(ids)];};
   const accountIds=parseIds('accountIds'),categoryIds=parseIds('categoryIds'),tagIds=parseIds('tagIds');
   const min=u.searchParams.get('minAmount'),max=u.searchParams.get('maxAmount');
   if(min!==null&&!amountRe.test(min))reject('Minimum amount is invalid.');
   if(max!==null&&!amountRe.test(max))reject('Maximum amount is invalid.');
   const filters={from,to,type,qtext,accountIds,categoryIds,tagIds,min,max,sort,direction};
   const filterHash=createHash('sha256').update(JSON.stringify(filters)).digest('base64url');
   const values:unknown[]=[params.workspaceId],where=['t.workspace_id=$1','t.deleted_at is null'];
   const add=(clause:(n:number)=>string,value:unknown)=>{values.push(value);where.push(clause(values.length));};
   if(from)add(n=>'t.occurred_at >= $'+n+'::date',from);
   if(to)add(n=>'t.occurred_at <= $'+n+'::date',to);
   if(type)add(n=>'t.type=$'+n,type);
   if(qtext)add(n=>'(coalesce(t.notes,\'\') ilike $'+n+' or coalesce(t.merchant,\'\') ilike $'+n+')','%'+qtext+'%');
   if(accountIds)add(n=>'(t.account_id=any($'+n+'::uuid[]) or t.destination_account_id=any($'+n+'::uuid[]))',accountIds);
   if(categoryIds)add(n=>'(t.category_id=any($'+n+'::uuid[]) or c.parent_id=any($'+n+'::uuid[]))',categoryIds);
   if(tagIds)add(n=>'exists(select 1 from transaction_tags ft where ft.workspace_id=t.workspace_id and ft.transaction_id=t.id and ft.tag_id=any($'+n+'::uuid[]))',tagIds);
   if(min!==null)add(n=>'t.amount >= $'+n+'::numeric',min);
   if(max!==null)add(n=>'t.amount <= $'+n+'::numeric',max);
   const keyExpr=sort==='amount'?'t.amount':sort==='category'?'coalesce(c.normalized_name,\'\')':sort==='tag'?'coalesce((select min(g.normalized_name) from transaction_tags st join tags g on g.workspace_id=st.workspace_id and g.id=st.tag_id where st.workspace_id=t.workspace_id and st.transaction_id=t.id),\'\')':'t.occurred_at';
   const keyType=sort==='date'?'date':sort==='amount'?'numeric':'text';
   const cursor=u.searchParams.get('cursor');
   if(cursor){
     try{
       const decoded=JSON.parse(Buffer.from(cursor,'base64url').toString());
       if(decoded.hash!==filterHash||decoded.sort!==sort||decoded.direction!==direction||typeof decoded.value!=='string'||!uuidRe.test(decoded.id))throw new Error();
       values.push(decoded.value,decoded.id);
       const n=values.length-1;
       where.push('('+keyExpr+',t.id) '+(direction==='asc'?'>':'<')+' ($'+n+'::'+keyType+',$'+(n+1)+'::uuid)');
     }catch{reject('This page cursor is invalid or no longer matches the filters.');}
   }
   const order=keyExpr+' '+(direction==='asc'?'ASC':'DESC')+',t.id '+(direction==='asc'?'ASC':'DESC');
   values.push(limit+1);
   const rows=await q(tx,'select t.id,t.type,t.account_id as "accountId",t.destination_account_id as "destinationAccountId",t.category_id as "categoryId",c.name as "categoryName",a.name as "accountName",d.name as "destinationAccountName",t.amount::text,t.currency,t.occurred_at as date,t.notes,t.merchant,t.version,t.created_at as "createdAt",('+keyExpr+')::text as "cursorValue",coalesce((select json_agg(json_build_object(\'id\',g.id,\'name\',g.name) order by g.normalized_name) from transaction_tags tt join tags g on g.workspace_id=tt.workspace_id and g.id=tt.tag_id where tt.workspace_id=t.workspace_id and tt.transaction_id=t.id),\'[]\'::json) as tags,coalesce((select json_agg(json_build_object(\'id\',x.id,\'name\',x.original_name,\'mimeType\',x.mime_type) order by x.created_at) from attachments x where x.workspace_id=t.workspace_id and x.transaction_id=t.id and x.status=\'ready\' and x.deleted_at is null),\'[]\'::json) as attachments from transactions t left join categories c on c.workspace_id=t.workspace_id and c.id=t.category_id join accounts a on a.workspace_id=t.workspace_id and a.id=t.account_id left join accounts d on d.workspace_id=t.workspace_id and d.id=t.destination_account_id where '+where.join(' and ')+' order by '+order+' limit $'+values.length,values);
   const hasMore=rows.length>limit,items=rows.slice(0,limit),last=items[items.length-1];
   const nextCursor=hasMore&&last?Buffer.from(JSON.stringify({hash:filterHash,sort,direction,value:String(last.cursorValue),id:String(last.id)})).toString('base64url'):null;
   return {items:items.map(({cursorValue:_,...item}:any)=>item),nextCursor};
 }))
 .get('/api/workspaces/:workspaceId/transactions/deleted',async({request,params})=>withWorkspace(request,params.workspaceId,async(tx)=>({items:await q(tx,'select t.id,t.type,t.amount::text,t.currency,t.occurred_at as date,t.notes,t.merchant,t.version from transactions t where t.workspace_id=$1 and t.deleted_at is not null order by t.deleted_at desc limit 50',[params.workspaceId])})))
 .get('/api/workspaces/:workspaceId/recurring-rules',async({request,params})=>withWorkspace(request,params.workspaceId,async(tx)=>{
   const items=await q(tx,'select r.id,r.name,r.type,r.account_id as "accountId",r.destination_account_id as "destinationAccountId",r.category_id as "categoryId",r.amount::text,r.currency,r.notes,r.frequency,r.interval,r.anchor_date as "anchorDate",r.end_date as "endDate",r.next_due_date as "nextDueDate",r.mode,r.status,r.version from recurring_rules r where r.workspace_id=$1 order by r.status,r.next_due_date,r.name',[params.workspaceId]);
   return {items};
 }))
 .post('/api/workspaces/:workspaceId/recurring-rules',async({request,params,body})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
   const b=body as any;
   if(typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>100)reject('Enter a recurring rule name.');
   if(!['day','week','month','year'].includes(b.frequency)||!Number.isInteger(b.interval)||b.interval<1||b.interval>365)reject('Choose a valid repeat schedule.');
   if(!['manual','auto'].includes(b.mode??'manual'))reject('Choose manual confirmation or automatic recording.');
   const amount=decimal(b.amount),anchor=isoDate(b.anchorDate);
   const [workspace]=await q(tx,'select currency,timezone from workspaces where id=$1',[params.workspaceId]);
   if(anchor<workspaceToday(workspace.timezone))reject('Recurring rules must start today or later. Use an explicit preview before importing past occurrences.');
   const [account]=await q(tx,'select id,currency from accounts where workspace_id=$1 and id=$2 and archived_at is null and deleted_at is null',[params.workspaceId,b.accountId]);
   if(!account)reject('Choose an active account in this workspace.');
   if(account.currency!==workspace.currency)reject('Account currency must match the workspace currency.');
   let categoryId=null,destinationId=null;
   if(b.type==='transfer'){
     const [destination]=await q(tx,'select id,currency from accounts where workspace_id=$1 and id=$2 and archived_at is null and deleted_at is null',[params.workspaceId,b.destinationAccountId]);
     if(!destination||destination.id===account.id||destination.currency!==account.currency)reject('Choose a different destination account in the same currency.');
     destinationId=destination.id;
   }else if(b.type==='income'||b.type==='expense'){
     const [category]=await q(tx,'select id,type from categories where workspace_id=$1 and id=$2 and archived_at is null',[params.workspaceId,b.categoryId]);
     if(!category||category.type!==b.type)reject('Choose an active category matching the transaction type.');
     categoryId=category.id;
   }else reject('Choose income, expense, or transfer.');
   const endDate=b.endDate?isoDate(b.endDate):null;
   if(endDate&&endDate<anchor)reject('The end date must be on or after the start date.');
   if((b.notes?.length??0)>2000)reject('Notes are too long.');
   const [rule]=await q(tx,'insert into recurring_rules(workspace_id,name,type,account_id,destination_account_id,category_id,amount,currency,notes,frequency,interval,anchor_date,timezone,end_date,next_due_date,mode,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$12,$15,$16) returning id,name,type,amount::text,frequency,interval,anchor_date as "anchorDate",next_due_date as "nextDueDate",mode,status,version',[params.workspaceId,b.name.trim(),b.type,account.id,destinationId,categoryId,amount,workspace.currency,b.notes?.trim()||b.name.trim(),b.frequency,b.interval,anchor,workspace.timezone,endDate,b.mode??'manual',actor.id]);
   await audit(tx,params.workspaceId,actor.id,'recurring-rule',rule.id,'create',null,rule);
   await scheduleRecurringWorkspace(params.workspaceId,actor.id);
   return Response.json({rule},{status:201});
 }))
 .patch('/api/workspaces/:workspaceId/recurring-rules/:id',async({request,params,body})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
   const b=body as any;if(!uuidRe.test(params.id))reject('Recurring rule ID is invalid.');
   const [before]=await q(tx,'select * from recurring_rules where workspace_id=$1 and id=$2 for update',[params.workspaceId,params.id]);if(!before)return fail(404,'RULE_NOT_FOUND','Recurring rule not found.');
   const version=Number(b.version);if(version!==before.version)return fail(409,'STALE_RULE','This rule changed. Refresh and try again.');
   if(b.status!==undefined&&!['active','paused','archived'].includes(b.status))reject('Choose active, paused, or archived.');
   if(b.name!==undefined&&(typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>100))reject('Enter a valid rule name.');
   if(b.frequency!==undefined&&(!['day','week','month','year'].includes(b.frequency)||!Number.isInteger(b.interval)||b.interval<1||b.interval>365))reject('Choose a valid repeat schedule.');
   if(b.mode!==undefined&&!['manual','auto'].includes(b.mode))reject('Choose manual confirmation or automatic recording.');
   const frequency=b.frequency??before.frequency,interval=b.interval??before.interval,anchor=b.anchorDate?isoDate(b.anchorDate):String(before.anchor_date),type=b.type??before.type;
   if(!['income','expense','transfer'].includes(type))reject('Choose income, expense, or transfer.');
   const accountId=b.accountId??before.account_id;
   const [account]=await q(tx,'select id,currency from accounts where workspace_id=$1 and id=$2 and archived_at is null and deleted_at is null',[params.workspaceId,accountId]);if(!account)reject('Choose an active account in this workspace.');
   let categoryId=null,destinationId=null;
   if(type==='transfer'){
     const wanted=b.destinationAccountId??before.destination_account_id;const [destination]=await q(tx,'select id,currency from accounts where workspace_id=$1 and id=$2 and archived_at is null and deleted_at is null',[params.workspaceId,wanted]);
     if(!destination||destination.id===account.id||destination.currency!==account.currency)reject('Choose a different destination account in the same currency.');destinationId=destination.id;
   }else{
     const wanted=b.categoryId??before.category_id;const [category]=await q(tx,'select id,type from categories where workspace_id=$1 and id=$2 and archived_at is null',[params.workspaceId,wanted]);
     if(!category||category.type!==type)reject('Choose an active category matching the transaction type.');categoryId=category.id;
   }
   const amount=b.amount!==undefined?decimal(b.amount):String(before.amount),endDate=b.endDate===null?null:b.endDate?isoDate(b.endDate):before.end_date;
   const resets=b.frequency!==undefined||b.anchorDate!==undefined;
   const [workspace]=await q(tx,'select timezone from workspaces where id=$1',[params.workspaceId]);
   if(resets&&anchor<workspaceToday(workspace.timezone))reject('Recurring rules must start today or later.');
   if(endDate&&String(endDate)<anchor)reject('The end date must be on or after the start date.');
   const nextDue=resets?nextOccurrenceDate(anchor,frequency as RecurrenceFrequency,interval,0):String(before.next_due_date);
   const [after]=await q(tx,'update recurring_rules set name=coalesce($1,name),type=$2,account_id=$3,destination_account_id=$4,category_id=$5,amount=$6,currency=$7,frequency=$8,interval=$9,anchor_date=$10,end_date=$11,next_due_date=$12,next_occurrence_index=case when $13 then 0 else next_occurrence_index end,mode=coalesce($14,mode),status=coalesce($15,status),version=version+1,updated_at=now() where workspace_id=$16 and id=$17 returning id,name,type,account_id as "accountId",destination_account_id as "destinationAccountId",category_id as "categoryId",amount::text,frequency,interval,anchor_date as "anchorDate",end_date as "endDate",next_due_date as "nextDueDate",mode,status,version',[b.name?.trim()??null,type,accountId,destinationId,categoryId,amount,account.currency,frequency,interval,anchor,endDate,nextDue,resets,b.mode??null,b.status??null,params.workspaceId,params.id]);
   await audit(tx,params.workspaceId,actor.id,'recurring-rule',params.id,'edit',before,after);
   if(after.status==='active')await scheduleRecurringWorkspace(params.workspaceId,actor.id);
   return {rule:after};
 }))
 .post('/api/workspaces/:workspaceId/recurring-occurrences/materialize',async({request,params})=>{
   if(!uuidRe.test(params.workspaceId))return fail(400,'INVALID_WORKSPACE_ID','Workspace ID is invalid.');
   const actor=await actorFor(request);if(actor instanceof Response)return actor;
   const days=Math.min(60,Math.max(1,Number(new URL(request.url).searchParams.get('days')??30)||30));
   return withWorkspace(request,params.workspaceId,async(tx,verifiedActor)=>{await scheduleRecurringWorkspace(params.workspaceId,verifiedActor.id);return {items:await materializeRecurring(tx,params.workspaceId,verifiedActor,days)};});
 })
 .get('/api/workspaces/:workspaceId/recurring-occurrences',async({request,params})=>withWorkspace(request,params.workspaceId,async(tx)=>{
   const days=Math.min(60,Math.max(1,Number(new URL(request.url).searchParams.get('days')??30)||30));
   const [workspace]=await q(tx,'select timezone from workspaces where id=$1',[params.workspaceId]);
   const today=workspaceToday(workspace.timezone),until=new Date(Date.now()+days*86400000).toISOString().slice(0,10);
   return {items:await q(tx,'select o.id,o.rule_id as "ruleId",r.name as "ruleName",o.scheduled_date as date,o.status,o.transaction_id as "transactionId",o.template_snapshot->>\'amount\' as amount,o.template_snapshot->>\'currency\' as currency from recurring_occurrences o join recurring_rules r on r.id=o.rule_id where o.workspace_id=$1 and o.scheduled_date between $2::date and $3::date order by o.scheduled_date,r.name',[params.workspaceId,today,until])};
 }))
 .post('/api/workspaces/:workspaceId/recurring-occurrences/:id/confirm',async({request,params})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
   const [occurrence]=await q(tx,'select * from recurring_occurrences where workspace_id=$1 and id=$2 for update',[params.workspaceId,params.id]);
   if(!occurrence)return fail(404,'OCCURRENCE_NOT_FOUND','Occurrence not found.');
   if(occurrence.status==='posted')return {transactionId:occurrence.transaction_id,status:'posted'};
   if(occurrence.status!=='pending')return fail(409,'OCCURRENCE_CLOSED','This occurrence is no longer pending.');
   const [workspace]=await q(tx,'select timezone from workspaces where id=$1',[params.workspaceId]);
   if(String(occurrence.scheduled_date)>workspaceToday(workspace.timezone))return fail(409,'OCCURRENCE_NOT_DUE','This occurrence can be confirmed on its scheduled day.');
   const snap=occurrence.template_snapshot;
   const transaction=await makeTransaction(tx,params.workspaceId,actor,{type:snap.type,accountId:snap.accountId,destinationAccountId:snap.destinationAccountId??undefined,categoryId:snap.categoryId??undefined,amount:snap.amount,currency:snap.currency,date:occurrence.scheduled_date,notes:snap.notes});
   await q(tx,"update recurring_occurrences set status='posted',transaction_id=$1,updated_at=now() where workspace_id=$2 and id=$3",[transaction.id,params.workspaceId,occurrence.id]);
   return {transactionId:transaction.id,status:'posted'};
 }))
 .post('/api/workspaces/:workspaceId/recurring-occurrences/:id/skip',async({request,params})=>withWorkspace(request,params.workspaceId,async(tx)=>{
   const [row]=await q(tx,"update recurring_occurrences set status='skipped',updated_at=now() where workspace_id=$1 and id=$2 and status='pending' returning id,status",[params.workspaceId,params.id]);
   return row??fail(404,'OCCURRENCE_NOT_FOUND','Pending occurrence not found.');
 }))
 .post('/api/workspaces/:workspaceId/transactions',async({request,params,body})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
   const input=body as Input,key=request.headers.get('idempotency-key');
   if(!key||key.length>200)reject('An Idempotency-Key header is required.');
   const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
   const [reserved]=await q(tx,"insert into idempotency_keys(workspace_id,actor_key,operation,key,request_hash,expires_at) values($1,$2,'create-transaction',$3,$4,now()+interval '7 days') on conflict(workspace_id,actor_key,operation,key) do nothing returning id",[params.workspaceId,actor.id,key,hash]);
   if(!reserved){
     const [old]=await q(tx,"select request_hash,response_body from idempotency_keys where workspace_id=$1 and actor_key=$2 and operation='create-transaction' and key=$3",[params.workspaceId,actor.id,key]);
     if(old.request_hash!==hash)return fail(409,'IDEMPOTENCY_CONFLICT','This key was used with different data.');
     return Response.json(old.response_body,{status:201});
   }
   const row:any=await makeTransaction(tx,params.workspaceId,actor,input);
   await learnCategory(tx,params.workspaceId,actor,row);
   await q(tx,'update idempotency_keys set response_body=$1::jsonb,resource_id=$2 where id=$3',[JSON.stringify(row),row.id,reserved.id]);
   return Response.json(row,{status:201});
 }))
 .delete('/api/workspaces/:workspaceId/transactions/:id',async({request,params})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
   const version=Number(new URL(request.url).searchParams.get('version'));
   if(!uuidRe.test(params.id)||!Number.isInteger(version)||version<1)reject('Transaction ID and version are required.');
   const [before]=await q(tx,'select * from transactions where workspace_id=$1 and id=$2 and deleted_at is null for update',[params.workspaceId,params.id]);
   if(!before)return fail(404,'TRANSACTION_NOT_FOUND','Transaction not found.');
   if(before.version!==version)return fail(409,'STALE_TRANSACTION','This transaction changed. Refresh and try again.');
   await reverseTransaction(tx,params.workspaceId,actor,params.id,before.occurred_at);
   await q(tx,'update transactions set deleted_at=now(),deleted_by=$1,updated_by=$1,updated_at=now(),version=version+1 where id=$2',[actor.id,params.id]);
   await dirtyUnusualBaselines(tx,params.workspaceId,before.category_id,before.currency,before.type,String(before.occurred_at).slice(0,10));
   const [owner]=await q(tx,'select owner_user_id from workspaces where id=$1',[params.workspaceId]);
   await q(tx,"update finance_notifications set resolved_at=coalesce(resolved_at,now()),resolution_reason='transaction_deleted',updated_at=now() where workspace_id=$1 and user_id=$2 and kind='unusual-spending' and source_type='transaction' and source_id=$3 and resolved_at is null",[params.workspaceId,owner.owner_user_id,params.id]);
   await q(tx,'delete from category_feedback where workspace_id=$1 and user_id=$2 and transaction_id=$3',[params.workspaceId,actor.id,params.id]);
   const oldMerchant=normalizedCategoryMerchant(before.merchant);
   if(oldMerchant)await refreshLearnedCategory(tx,params.workspaceId,actor.id,before.type,oldMerchant);
   await audit(tx,params.workspaceId,actor.id,'transaction',params.id,'delete',before,null);
   return new Response(null,{status:204});
 }))
 .patch('/api/workspaces/:workspaceId/transactions/:id',async({request,params,body})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
   const version=Number(new URL(request.url).searchParams.get('version'));
   if(!uuidRe.test(params.id)||!Number.isInteger(version)||version<1)reject('Transaction ID and version are required.');
   const [before]=await q(tx,'select * from transactions where workspace_id=$1 and id=$2 and deleted_at is null for update',[params.workspaceId,params.id]);
   if(!before)return fail(404,'TRANSACTION_NOT_FOUND','Transaction not found.');
   if(before.version!==version)return fail(409,'STALE_TRANSACTION','This transaction changed. Refresh and try again.');
   const input=body as Input;
   await reverseTransaction(tx,params.workspaceId,actor,params.id,before.occurred_at);
   const [owner]=await q(tx,'select owner_user_id from workspaces where id=$1',[params.workspaceId]);
   await q(tx,"update finance_notifications set resolved_at=coalesce(resolved_at,now()),resolution_reason='transaction_changed',updated_at=now() where workspace_id=$1 and user_id=$2 and kind='unusual-spending' and source_type='transaction' and source_id=$3 and resolved_at is null",[params.workspaceId,owner.owner_user_id,params.id]);
   // An edited transaction is one current example. Remove the prior merchant/type
   // evidence before recording its new version so it cannot train two rules.
   await q(tx,'delete from category_feedback where workspace_id=$1 and user_id=$2 and transaction_id=$3',[params.workspaceId,actor.id,params.id]);
   const oldMerchant=normalizedCategoryMerchant(before.merchant);
   if(oldMerchant)await refreshLearnedCategory(tx,params.workspaceId,actor.id,before.type,oldMerchant);
   const updated=await makeTransaction(tx,params.workspaceId,actor,input,params.id,before);
   await learnCategory(tx,params.workspaceId,actor,updated,before.category_id);
   await audit(tx,params.workspaceId,actor.id,'transaction',params.id,'edit',before,updated);
   return {transaction:updated};
 }))
 .post('/api/workspaces/:workspaceId/transactions/:id/restore',async({request,params})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
   if(!uuidRe.test(params.id))reject('Transaction ID is invalid.');
   const [before]=await q(tx,'select * from transactions where workspace_id=$1 and id=$2 and deleted_at is not null for update',[params.workspaceId,params.id]);
   if(!before)return fail(404,'DELETED_TRANSACTION_NOT_FOUND','Deleted transaction not found.');
   const [reversal]=await q(tx,'select j.id from journal_entries j where j.workspace_id=$1 and j.transaction_id=$2 and j.reverses_entry_id is not null order by j.created_at desc limit 1 for update',[params.workspaceId,params.id]);
   if(reversal){
     const lines=await q(tx,'select ledger_account_id,debit::text,credit::text,currency from journal_lines where workspace_id=$1 and entry_id=$2',[params.workspaceId,reversal.id]);
     const restoreId=randomUUID();
     await q(tx,'insert into journal_entries(id,workspace_id,transaction_id,effective_date,reason,reverses_entry_id,created_by) values($1,$2,$3,$4,\'restore\',$5,$6)',[restoreId,params.workspaceId,params.id,before.occurred_at,reversal.id,actor.id]);
     for(const line of lines)await q(tx,'insert into journal_lines(workspace_id,entry_id,ledger_account_id,debit,credit,currency) values($1,$2,$3,$4,$5,$6)',[params.workspaceId,restoreId,line.ledger_account_id,line.credit,line.debit,line.currency]);
   }
   const [restored]=await q(tx,'update transactions set deleted_at=null,deleted_by=null,updated_by=$1,updated_at=now(),version=version+1 where workspace_id=$2 and id=$3 returning id,type,category_id as "categoryId",merchant,version',[actor.id,params.workspaceId,params.id]);
   await dirtyUnusualBaselines(tx,params.workspaceId,before.category_id,before.currency,before.type,String(before.occurred_at).slice(0,10));
   const [owner]=await q(tx,'select owner_user_id from workspaces where id=$1',[params.workspaceId]);
   await q(tx,"update finance_notifications set resolved_at=coalesce(resolved_at,now()),resolution_reason='transaction_restored',updated_at=now() where workspace_id=$1 and user_id=$2 and kind='unusual-spending' and source_type='transaction' and source_id=$3 and resolved_at is null",[params.workspaceId,owner.owner_user_id,params.id]);
   await learnCategory(tx,params.workspaceId,actor,restored,before.category_id);
   await audit(tx,params.workspaceId,actor.id,'transaction',params.id,'restore',before,restored);
   return {transaction:restored};
 }))
 .get('/api/workspaces/:workspaceId/transactions/:id/attachments',async({request,params})=>withWorkspace(request,params.workspaceId,async(tx)=>{
   if(!uuidRe.test(params.id))reject('Transaction ID is invalid.');
   const [transaction]=await q(tx,'select id from transactions where workspace_id=$1 and id=$2 and deleted_at is null',[params.workspaceId,params.id]);
   if(!transaction)return fail(404,'TRANSACTION_NOT_FOUND','Transaction not found.');
   return {items:await q(tx,'select id,original_name as "originalName",mime_type as "mimeType",size_bytes as "sizeBytes",created_at as "createdAt" from attachments where workspace_id=$1 and transaction_id=$2 and status=\'ready\' and deleted_at is null order by created_at',[params.workspaceId,params.id])};
 }))
 .post('/api/workspaces/:workspaceId/transactions/:id/attachments',async({request,params})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
   if(!uuidRe.test(params.id))reject('Transaction ID is invalid.');
   const declared=Number(request.headers.get('content-length')??0);if(declared>10*1024*1024+4096)return fail(413,'ATTACHMENT_TOO_LARGE','Attachments must be 10 MiB or smaller.');
   const [transaction]=await q(tx,'select id from transactions where workspace_id=$1 and id=$2 and deleted_at is null for update',[params.workspaceId,params.id]);
   if(!transaction)return fail(404,'TRANSACTION_NOT_FOUND','Transaction not found.');
   const [count]=await q(tx,'select count(*)::int as count from attachments where workspace_id=$1 and transaction_id=$2 and deleted_at is null and status in (\'pending\',\'ready\')',[params.workspaceId,params.id]);
   if(count.count>=5)return fail(422,'ATTACHMENT_LIMIT','A transaction can have up to five attachments.');
   const rawName=new URL(request.url).searchParams.get('name')??'receipt';
   const originalName=rawName.split(/[\\/]/).pop()!.replace(/[\\r\\n\\0]/g,'').slice(0,180)||'receipt';
   const declaredType=(request.headers.get('content-type')??'').split(';')[0]!.toLowerCase();
   let bytes:Uint8Array;try{bytes=await readLimitedBody(request,10*1024*1024);}catch(error){if(error instanceof RangeError)return fail(413,'ATTACHMENT_TOO_LARGE','Attachments must be 10 MiB or smaller.');throw error;}
   if(!bytes.byteLength)return fail(422,'EMPTY_ATTACHMENT','Choose a file to upload.');
   if(bytes.byteLength>10*1024*1024)return fail(413,'ATTACHMENT_TOO_LARGE','Attachments must be 10 MiB or smaller.');
   let mime='';
   if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)mime='image/jpeg';
   else if(bytes[0]===0x89&&String.fromCharCode(...bytes.slice(1,4))==='PNG')mime='image/png';
   else if(String.fromCharCode(...bytes.slice(0,4))==='%PDF')mime='application/pdf';
   else if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')mime='image/webp';
   if(!mime||mime!==declaredType)return fail(415,'UNSUPPORTED_ATTACHMENT','Only valid JPEG, PNG, WebP, and PDF files are accepted.');
   const checksum=createHash('sha256').update(bytes).digest('hex'),attachmentId=randomUUID(),key=`${params.workspaceId}/${params.id}/${attachmentId}`;
   try{
     await putAttachment(key,bytes,mime);
     const [attachment]=await q(tx,'insert into attachments(id,workspace_id,transaction_id,object_key,original_name,mime_type,size_bytes,checksum,status,uploaded_by) values($1,$2,$3,$4,$5,$6,$7,$8,\'ready\',$9) returning id,original_name as "originalName",mime_type as "mimeType",size_bytes as "sizeBytes"',[attachmentId,params.workspaceId,params.id,key,originalName,mime,bytes.byteLength,checksum,actor.id]);
     await audit(tx,params.workspaceId,actor.id,'attachment',attachmentId,'upload',null,attachment);
     return Response.json({attachment},{status:201});
   }catch(error){await deleteAttachment(key).catch(()=>{});throw error;}
 }))
 .get('/api/workspaces/:workspaceId/attachments/:attachmentId/download',async({request,params})=>withWorkspace(request,params.workspaceId,async(tx)=>{
   if(!uuidRe.test(params.attachmentId))reject('Attachment ID is invalid.');
   const [attachment]=await q(tx,'select a.object_key,a.original_name,a.mime_type from attachments a join transactions t on t.workspace_id=a.workspace_id and t.id=a.transaction_id where a.workspace_id=$1 and a.id=$2 and a.status=\'ready\' and a.deleted_at is null and t.deleted_at is null',[params.workspaceId,params.attachmentId]);
   if(!attachment)return fail(404,'ATTACHMENT_NOT_FOUND','Attachment not found.');
   try{const object=await getAttachment(attachment.object_key);if(!object.Body)return fail(404,'ATTACHMENT_NOT_FOUND','Attachment file is missing.');const bytes=await object.Body.transformToByteArray();const body=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;return new Response(body,{headers:{'Content-Type':attachment.mime_type,'Content-Length':String(bytes.byteLength),'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(attachment.original_name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch{console.error('Private attachment fetch failed');return fail(502,'ATTACHMENT_UNAVAILABLE','Attachment is temporarily unavailable.');}
 }))
 .delete('/api/workspaces/:workspaceId/attachments/:attachmentId',async({request,params})=>withWorkspace(request,params.workspaceId,async(tx,actor)=>{
   const [attachment]=await q(tx,'update attachments set deleted_at=now() where workspace_id=$1 and id=$2 and deleted_at is null returning id,object_key,original_name as "originalName"',[params.workspaceId,params.attachmentId]);
   if(!attachment)return fail(404,'ATTACHMENT_NOT_FOUND','Attachment not found.');
   await audit(tx,params.workspaceId,actor.id,'attachment',attachment.id,'delete',attachment,null);
   return new Response(null,{status:204});
 }))
 .get('/api/workspaces/:workspaceId/summary',async({request,params})=>withWorkspace(request,params.workspaceId,async(tx)=>{
   const u=new URL(request.url),from=u.searchParams.get('from')??'0001-01-01',to=u.searchParams.get('to')??'9999-12-31';isoDate(from);isoDate(to);
   const [row]=await q(tx,"select coalesce((select sum(l.debit-l.credit) from accounts a join journal_lines l on l.workspace_id=a.workspace_id and l.ledger_account_id=a.ledger_account_id where a.workspace_id=$1 and a.archived_at is null and a.deleted_at is null),0)::text as balance,coalesce(sum(case when type='income' then amount else 0 end),0)::text as income,coalesce(sum(case when type='expense' then amount else 0 end),0)::text as expense,(coalesce(sum(case when type='income' then amount else 0 end),0)-coalesce(sum(case when type='expense' then amount else 0 end),0))::text as \"netChange\" from transactions where workspace_id=$1 and deleted_at is null and occurred_at between $2::date and $3::date",[params.workspaceId,from,to]);
   return row;
 }));
