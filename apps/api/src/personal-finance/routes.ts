import { Elysia } from 'elysia';
import type { TransactionSql } from 'postgres';
import { auth } from '../auth';
import { client } from '../db';
import { nextOccurrenceDate, workspaceToday } from '../tracking/recurrence';
import { budgetProgress } from './money';
import webpush from 'web-push';
import { encryptPushAuth } from './push-crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const q = (tx: TransactionSql, query: string, values: unknown[] = []) => tx.unsafe(query, values as never[]);
const fail = (status: number, message: string) => Response.json({ message }, { status });
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function validAmount(value: unknown): value is string {
  return typeof value === 'string' && /^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/.test(value) && /[1-9]/.test(value);
}
function validBudgetAmount(value: unknown): value is string {
  return typeof value === 'string' && /^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/.test(value);
}
function errorResponse(error: unknown): Response {
  const err = error as Error & { code?: string; status?: number };
  if (err.status) return fail(err.status, err.message);
  if (['23503', '23505', '23514'].includes(err.code ?? '')) return fail(409, 'That item conflicts with existing finance data.');
  console.error('Personal finance request failed', { sqlState: err.code });
  return fail(500, 'The request could not be completed.');
}
async function actor(request: Request) {
  const current = await auth.api.getSession({ headers: request.headers });
  if (!current) return fail(401, 'Sign in to continue.');
  if (!current.user.emailVerified) return fail(403, 'Verify your email to continue.');
  return { id: current.user.id, email: current.user.email };
}
async function scoped<T>(request: Request, workspaceId: string, run: (tx: TransactionSql, userId: string) => Promise<T>): Promise<T | Response> {
  if (!uuid.test(workspaceId)) return fail(400, 'Workspace ID is invalid.');
  const current = await actor(request);
  if (current instanceof Response) return current;
  try {
    return await client.begin(async (tx) => {
      await q(tx, "select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)", [current.id, workspaceId]);
      const [membership] = await q(tx, 'select 1 from workspace_memberships where workspace_id=$1 and user_id=$2', [workspaceId, current.id]);
      if (!membership) throw Object.assign(new Error('Workspace not found.'), { status: 404 });
      return run(tx, current.id);
    }) as T | Response;
  } catch (error) { return errorResponse(error); }
}

function period(cadence: 'weekly' | 'monthly', now = new Date(), timezone = 'UTC') {
  const [year, month, day] = workspaceToday(timezone, now).split('-').map(Number);
  const start = new Date(Date.UTC(year!, month! - 1, day!));
  if (cadence === 'weekly') start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  else start.setUTCDate(1);
  const end = new Date(start);
  if (cadence === 'weekly') end.setUTCDate(end.getUTCDate() + 7);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
async function budgetRows(tx: TransactionSql, workspaceId: string, now = new Date()) {
  const [workspace] = await q(tx, 'select timezone from workspaces where id=$1', [workspaceId]);
  const today = workspaceToday(workspace.timezone, now);
  const rows = await q(tx, `select b.id,b.name,b.category_id as "categoryId",c.name as "categoryName",b.cadence,b.amount::text,b.currency,
      b.alert_thresholds as "alertThresholds",p.starts_on as "periodStart",p.ends_on as "periodEnd",
      coalesce((select sum(t.amount) from transactions t where t.workspace_id=b.workspace_id and t.deleted_at is null and t.type='expense' and t.currency=b.currency
        and t.occurred_at>=p.starts_on and t.occurred_at<p.ends_on and t.category_id in
        (with recursive descendants(id) as (select b.category_id union all select c2.id from categories c2 join descendants d on c2.parent_id=d.id where c2.workspace_id=b.workspace_id)
         select id from descendants)),0)::text as spent
      from budgets b join categories c on c.workspace_id=b.workspace_id and c.id=b.category_id
      cross join lateral (select case when b.cadence='weekly' then date_trunc('week',$2::date)::date else date_trunc('month',$2::date)::date end starts_on,
      case when b.cadence='weekly' then (date_trunc('week',$2::date)+interval '7 days')::date else (date_trunc('month',$2::date)+interval '1 month')::date end ends_on) p
      where b.workspace_id=$1 and b.archived_at is null and p.starts_on>=b.starts_on`, [workspaceId, today]);
  return rows.map((row: any) => {
    const spent = row.spent as string, progress=budgetProgress(row.amount as string,spent);
    return { ...row, spent, ...progress, period: { from: row.periodStart, to: row.periodEnd } };
  });
}

export const personalFinanceRoutes = new Elysia()
  .get('/api/workspaces/:workspaceId/budgets', ({ request, params }) => scoped(request, params.workspaceId, async (tx) => ({ items: await budgetRows(tx, params.workspaceId) })))
  .post('/api/workspaces/:workspaceId/budgets', async ({ request, params }) => scoped(request, params.workspaceId, async (tx, userId) => {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100 || !uuid.test(String(body.categoryId)) || !validBudgetAmount(body.amount) || !['weekly', 'monthly'].includes(String(body.cadence))) return fail(422, 'Enter a name, category, nonnegative amount, and weekly or monthly schedule.');
    const [workspace] = await q(tx, 'select currency,timezone from workspaces where id=$1 for update', [params.workspaceId]);
    const [category] = await q(tx, "select id from categories where workspace_id=$1 and id=$2 and type='expense' and archived_at is null", [params.workspaceId, body.categoryId]);
    if (!category) return fail(422, 'Choose an active expense category in this workspace.');
    const start = validDate(body.startsOn) ? body.startsOn : period(body.cadence as 'weekly' | 'monthly', new Date(), workspace.timezone).from;
    const thresholds = Array.isArray(body.alertThresholds) ? body.alertThresholds : [80, 100];
    if (thresholds.length > 5 || thresholds.some((x) => !Number.isInteger(x) || x < 1 || x > 1000)) return fail(422, 'Alert thresholds must be whole percentages from 1 to 1000.');
    const [overlap] = await q(tx, `with recursive covered(id) as (
      select $2::uuid union all select c.id from categories c join covered p on c.parent_id=p.id where c.workspace_id=$1
    ), ancestors(id,parent_id) as (select id,parent_id from categories where workspace_id=$1 and id=$2 union all
      select c.id,c.parent_id from categories c join ancestors a on a.parent_id=c.id where c.workspace_id=$1)
      select b.id from budgets b where b.workspace_id=$1 and b.archived_at is null and b.cadence=$3 and (b.category_id in(select id from covered) or b.category_id in(select id from ancestors)) limit 1`, [params.workspaceId,body.categoryId,body.cadence]);
    if (overlap) return fail(409, 'A budget already covers this category or one of its subcategories for that period.');
    const [created] = await q(tx, 'insert into budgets(workspace_id,category_id,name,cadence,amount,currency,starts_on,alert_thresholds,created_by) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) returning id,name,category_id as "categoryId",cadence,amount::text,currency,starts_on as "startsOn",alert_thresholds as "alertThresholds"', [params.workspaceId, body.categoryId, body.name.trim(), body.cadence, body.amount, workspace.currency, start, JSON.stringify([...new Set(thresholds)].sort((a, b) => Number(a) - Number(b))), userId]);
    await q(tx, 'insert into budget_revisions(workspace_id,budget_id,revision,cadence,amount,currency,category_id,name,valid_from,recorded_by) values($1,$2,1,$3,$4,$5,$6,$7,$8,$9)', [params.workspaceId,created.id,created.cadence,created.amount,created.currency,created.categoryId,created.name,created.startsOn,userId]);
    return Response.json({ budget: created }, { status: 201 });
  }))
  .delete('/api/workspaces/:workspaceId/budgets/:id', ({ request, params }) => scoped(request, params.workspaceId, async (tx, userId) => {
    const [row] = await q(tx, 'update budgets set archived_at=now(),updated_at=now() where workspace_id=$1 and id=$2 and archived_at is null returning id,cadence,amount::text,currency,category_id as "categoryId",name,starts_on as "startsOn"', [params.workspaceId, params.id]);
    if(row){const [current]=await q(tx,'select revision,valid_from as "validFrom" from budget_revisions where workspace_id=$1 and budget_id=$2 and valid_to is null order by revision desc limit 1 for update',[params.workspaceId,params.id]);if(current){const effective=workspaceToday('UTC');if(effective>String(current.validFrom)){await q(tx,'update budget_revisions set valid_to=$3 where workspace_id=$1 and budget_id=$2 and revision=$4',[params.workspaceId,params.id,effective,current.revision]);await q(tx,'insert into budget_revisions(workspace_id,budget_id,revision,cadence,amount,currency,category_id,name,valid_from,archived,recorded_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10)',[params.workspaceId,params.id,Number(current.revision)+1,row.cadence,row.amount,row.currency,row.categoryId,row.name,effective,userId]);}else await q(tx,'update budget_revisions set archived=true where workspace_id=$1 and budget_id=$2 and revision=$3',[params.workspaceId,params.id,current.revision]);}}
    return row ? new Response(null, { status: 204 }) : fail(404, 'Budget not found.');
  }))
  .patch('/api/workspaces/:workspaceId/budgets/:id', async ({ request, params }) => scoped(request, params.workspaceId, async (tx,userId) => {
    const body=await request.json() as Record<string,unknown>;
    if((body.name!==undefined&&(typeof body.name!=='string'||!body.name.trim()||body.name.length>100))||(body.amount!==undefined&&!validBudgetAmount(body.amount))||(body.alertThresholds!==undefined&&(!Array.isArray(body.alertThresholds)||body.alertThresholds.length>5||body.alertThresholds.some(x=>!Number.isInteger(x)||Number(x)<1||Number(x)>1000))))return fail(422,'Enter a valid budget name, amount, or alert threshold.');
    const thresholds=body.alertThresholds as number[]|undefined;
    const normalizedThresholds=thresholds?JSON.stringify([...new Set(thresholds)].sort((a,b)=>a-b)):null;
    const [updated]=await q(tx,'update budgets set name=coalesce($3,name),amount=coalesce($4::numeric,amount),alert_thresholds=coalesce($5::jsonb,alert_thresholds),alert_revision=alert_revision+case when ($4::numeric is not null and $4::numeric is distinct from amount) or ($5::jsonb is not null and $5::jsonb is distinct from alert_thresholds) then 1 else 0 end,updated_at=now() where workspace_id=$1 and id=$2 and archived_at is null returning id,name,amount::text,cadence,alert_thresholds as "alertThresholds",alert_revision as "alertRevision"',[params.workspaceId,params.id,body.name??null,body.amount??null,normalizedThresholds]);
    if(updated&&(body.name!==undefined||body.amount!==undefined)){const [budget]=await q(tx,'select currency,category_id as "categoryId",starts_on as "startsOn" from budgets where workspace_id=$1 and id=$2',[params.workspaceId,params.id]);const [current]=await q(tx,'select revision,valid_from as "validFrom" from budget_revisions where workspace_id=$1 and budget_id=$2 and valid_to is null order by revision desc limit 1 for update',[params.workspaceId,params.id]);const effective=workspaceToday('UTC');if(current&&effective>String(current.validFrom)){await q(tx,'update budget_revisions set valid_to=$3 where workspace_id=$1 and budget_id=$2 and revision=$4',[params.workspaceId,params.id,effective,current.revision]);await q(tx,'insert into budget_revisions(workspace_id,budget_id,revision,cadence,amount,currency,category_id,name,valid_from,recorded_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[params.workspaceId,params.id,Number(current.revision)+1,updated.cadence,updated.amount,budget.currency,budget.categoryId,updated.name,effective,userId]);}else if(current){await q(tx,'update budget_revisions set cadence=$4,amount=$5,currency=$6,category_id=$7,name=$8,recorded_by=$9 where workspace_id=$1 and budget_id=$2 and revision=$3',[params.workspaceId,params.id,current.revision,updated.cadence,updated.amount,budget.currency,budget.categoryId,updated.name,userId]);}else{await q(tx,'insert into budget_revisions(workspace_id,budget_id,revision,cadence,amount,currency,category_id,name,valid_from,recorded_by) values($1,$2,1,$3,$4,$5,$6,$7,$8,$9)',[params.workspaceId,params.id,updated.cadence,updated.amount,budget.currency,budget.categoryId,updated.name,budget.startsOn,userId]);}}
    return updated??fail(404,'Budget not found.');
  }))
  .get('/api/workspaces/:workspaceId/goals', ({ request, params }) => scoped(request, params.workspaceId, async (tx) => ({ items: await q(tx, `select g.id,g.name,g.target_amount::text as "targetAmount",g.currency,g.target_date as "targetDate",g.linked_account_id as "linkedAccountId",
    coalesce(sum(case when c.direction='add' then c.amount else -c.amount end),0)::text as saved,
    greatest(g.target_amount-coalesce(sum(case when c.direction='add' then c.amount else -c.amount end),0),0)::text as remaining,
    least(100,round(coalesce(sum(case when c.direction='add' then c.amount else -c.amount end),0)*100/g.target_amount,1))::text as "progressPercent"
    from savings_goals g left join goal_contributions c on c.workspace_id=g.workspace_id and c.goal_id=g.id where g.workspace_id=$1 and g.archived_at is null group by g.id order by g.created_at desc`, [params.workspaceId]) })))
  .post('/api/workspaces/:workspaceId/goals', async ({ request, params }) => scoped(request, params.workspaceId, async (tx, userId) => {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100 || !validAmount(body.targetAmount) || (body.targetDate != null && !validDate(body.targetDate)) || (body.linkedAccountId != null && !uuid.test(String(body.linkedAccountId)))) return fail(422, 'Enter a name, positive target, optional due date, and valid linked account.');
    const [workspace] = await q(tx, 'select currency from workspaces where id=$1', [params.workspaceId]);
    if (body.linkedAccountId) { const [account] = await q(tx, 'select id from accounts where workspace_id=$1 and id=$2 and currency=$3 and archived_at is null and deleted_at is null', [params.workspaceId, body.linkedAccountId,workspace.currency]); if (!account) return fail(422, 'Choose an active account in this workspace currency.'); }
    const [goal] = await q(tx, 'insert into savings_goals(workspace_id,name,target_amount,currency,target_date,linked_account_id,created_by) values($1,$2,$3,$4,$5,$6,$7) returning id,name,target_amount::text as "targetAmount",currency,target_date as "targetDate",linked_account_id as "linkedAccountId"', [params.workspaceId, body.name.trim(), body.targetAmount, workspace.currency, body.targetDate ?? null, body.linkedAccountId ?? null, userId]);
    return Response.json({ goal: { ...goal, saved: '0' } }, { status: 201 });
  }))
  .post('/api/workspaces/:workspaceId/goals/:id/contributions', async ({ request, params }) => scoped(request, params.workspaceId, async (tx, userId) => {
    const body = await request.json() as Record<string, unknown>;
    if (!validAmount(body.amount) || !['add', 'withdraw'].includes(String(body.direction)) || (body.occurredOn != null && !validDate(body.occurredOn)) || (body.note != null && (typeof body.note !== 'string' || body.note.length > 500))) return fail(422, 'Enter a positive amount, direction, and valid date.');
    const [goal] = await q(tx, 'select id from savings_goals where workspace_id=$1 and id=$2 and archived_at is null for update', [params.workspaceId, params.id]);
    if (!goal) return fail(404, 'Goal not found.');
    const [balance] = await q(tx, "select coalesce(sum(case when direction='add' then amount else -amount end),0)::numeric(19,4) as amount,coalesce(sum(case when direction='add' then amount else -amount end),0)>=$3::numeric as can_withdraw from goal_contributions where workspace_id=$1 and goal_id=$2", [params.workspaceId, params.id, body.amount]);
    if (body.direction === 'withdraw' && !balance.can_withdraw) return fail(422, 'A withdrawal cannot exceed the amount saved.');
    const [contribution] = await q(tx, 'insert into goal_contributions(workspace_id,goal_id,direction,amount,occurred_on,note,created_by) values($1,$2,$3,$4,$5,$6,$7) returning id,goal_id as "goalId",direction,amount::text,occurred_on as "occurredOn",note', [params.workspaceId, params.id, body.direction, body.amount, body.occurredOn ?? workspaceToday('UTC'), body.note?.trim() ?? null, userId]);
    return Response.json({ contribution }, { status: 201 });
  }))
  .get('/api/workspaces/:workspaceId/goals/:id/contributions', ({ request, params }) => scoped(request, params.workspaceId, async (tx) => {
    const [goal]=await q(tx,'select id from savings_goals where workspace_id=$1 and id=$2 and archived_at is null',[params.workspaceId,params.id]);
    if(!goal)return fail(404,'Goal not found.');
    return {items:await q(tx,'select id,direction,amount::text,occurred_on as "occurredOn",note,created_at as "createdAt" from goal_contributions where workspace_id=$1 and goal_id=$2 order by occurred_on desc,created_at desc limit 100',[params.workspaceId,params.id])};
  }))
  .delete('/api/workspaces/:workspaceId/goals/:id', ({ request, params }) => scoped(request, params.workspaceId, async (tx) => {
    const [row] = await q(tx, 'update savings_goals set archived_at=now(),updated_at=now() where workspace_id=$1 and id=$2 and archived_at is null returning id', [params.workspaceId, params.id]);
    return row ? new Response(null, { status: 204 }) : fail(404, 'Goal not found.');
  }))
  .get('/api/workspaces/:workspaceId/bills', async ({ request, params }) => scoped(request, params.workspaceId, async (tx) => {
    const [workspace] = await q(tx, 'select timezone from workspaces where id=$1', [params.workspaceId]);
    const today = workspaceToday(workspace.timezone);
    const horizon = new Date(`${today}T00:00:00Z`); horizon.setUTCDate(horizon.getUTCDate() + 90);
    const through = horizon.toISOString().slice(0, 10);
    const active = await q(tx, 'select * from bills where workspace_id=$1 and enabled and archived_at is null and next_due_date<=$2 order by next_due_date limit 200', [params.workspaceId, through]);
    for (const bill of active) {
      let due = bill.next_due_date as string, count = 0;
      while (due <= through && count++ < 100) {
        await q(tx, 'insert into bill_occurrences(workspace_id,bill_id,due_on,name,amount,currency) values($1,$2,$3,$4,$5,$6) on conflict do nothing', [params.workspaceId, bill.id, due, bill.name, bill.amount, bill.currency]);
        if (bill.frequency === 'once') break;
        const cadence = bill.frequency as 'week' | 'month' | 'year';
        const next = nextOccurrenceDate(bill.anchor_date, cadence, Number(bill.interval), Number((await q(tx, 'select count(*)::int as n from bill_occurrences where workspace_id=$1 and bill_id=$2 and due_on>=$3', [params.workspaceId, bill.id, bill.anchor_date]))[0].n));
        if (next <= due || (bill.end_date && next > bill.end_date)) break;
        due = next;
      }
      await q(tx, "update bills set next_due_date=$3,enabled=case when frequency='once' and exists(select 1 from bill_occurrences where workspace_id=$1 and bill_id=$2) then false else enabled end,updated_at=now() where workspace_id=$1 and id=$2", [params.workspaceId, bill.id, due]);
    }
    const items = await q(tx, "select o.id,o.bill_id as \"billId\",o.name,o.amount::text,o.currency,o.due_on as \"dueOn\",o.status,(o.due_on< $2::date and o.status='unpaid') as overdue,b.reminder_days as \"reminderDays\",coalesce(o.payment_account_id,b.payment_account_id) as \"paymentAccountId\",o.expected_payment_on as \"expectedPaymentOn\",o.deferrable_until as \"deferrableUntil\",o.transaction_id as \"transactionId\",b.recurring_rule_id as \"recurringRuleId\" from bill_occurrences o join bills b on b.workspace_id=o.workspace_id and b.id=o.bill_id where o.workspace_id=$1 and o.due_on >= ($2::date - interval '30 days') order by o.due_on limit 300", [params.workspaceId, today]);
    return { items };
  }))
  .post('/api/workspaces/:workspaceId/bills', async ({ request, params }) => scoped(request, params.workspaceId, async (tx, userId) => {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 120 || !validAmount(body.amount) || !validDate(body.dueOn) || !['once', 'week', 'month', 'year'].includes(String(body.frequency))) return fail(422, 'Enter a name, positive amount, due date, and valid recurrence.');
    const [workspace] = await q(tx, 'select currency from workspaces where id=$1', [params.workspaceId]);
    const reminderDays = Array.isArray(body.reminderDays) ? [...new Set(body.reminderDays)] : [3, 0];
    if (reminderDays.length > 8 || reminderDays.some((day) => !Number.isInteger(day) || Number(day) < 0 || Number(day) > 90)) return fail(422, 'Reminder lead time must be between 0 and 90 days.');
    if(body.categoryId!=null){if(!uuid.test(String(body.categoryId)))return fail(422,'Choose an expense category.');const [category]=await q(tx,"select id from categories where workspace_id=$1 and id=$2 and type='expense' and archived_at is null",[params.workspaceId,body.categoryId]);if(!category)return fail(422,'Choose an active expense category in this workspace.');}
    const interval = Number.isInteger(body.interval) && Number(body.interval) > 0 && Number(body.interval) <= 365 ? Number(body.interval) : 1;
    const [bill] = await q(tx, 'insert into bills(workspace_id,name,amount,currency,category_id,frequency,interval,anchor_date,next_due_date,end_date,reminder_days,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11) returning id,name,amount::text,currency,frequency,interval,anchor_date as "anchorDate",next_due_date as "nextDueDate",end_date as "endDate",reminder_days as "reminderDays"', [params.workspaceId, body.name.trim(), body.amount, workspace.currency, body.categoryId ?? null, body.frequency, interval, body.dueOn, body.endDate ?? null, reminderDays, userId]);
    return Response.json({ bill }, { status: 201 });
  }))
  .patch('/api/workspaces/:workspaceId/bills/:id/forecast-settings', async ({ request, params }) => scoped(request, params.workspaceId, async (tx, userId) => {
    if (!uuid.test(params.id)) return fail(400, 'Invalid bill ID.');
    const body = await request.json() as { paymentAccountId?: unknown; recurringRuleId?: unknown };
    if (body.paymentAccountId !== undefined && body.paymentAccountId !== null && !uuid.test(String(body.paymentAccountId))) return fail(422, 'Choose a valid payment account.');
    if (body.recurringRuleId !== undefined && body.recurringRuleId !== null && !uuid.test(String(body.recurringRuleId))) return fail(422, 'Choose a valid recurring expense.');
    const [bill] = await q(tx, 'select id,amount::text,currency,frequency,interval,anchor_date as "anchorDate",payment_account_id as "paymentAccountId" from bills where workspace_id=$1 and id=$2 and archived_at is null for update', [params.workspaceId, params.id]);
    if (!bill) return fail(404, 'Bill not found.');
    if (body.paymentAccountId) {
      const [account] = await q(tx, "select id from accounts where workspace_id=$1 and id=$2 and currency=$3 and kind in ('cash','bank','e_wallet','savings') and archived_at is null and deleted_at is null", [params.workspaceId, body.paymentAccountId, bill.currency]);
      if (!account) return fail(422, 'Choose an active cash account in the bill currency.');
    }
    if (body.recurringRuleId) {
      if (bill.frequency === 'once') return fail(422, 'A one-time bill cannot be linked to a recurring rule.');
      const [rule] = body.recurringRuleId===null?[{id:null}]:await q(tx, "select id from recurring_rules where workspace_id=$1 and id=$2 and status='active' and type='expense' and currency=$3 and amount=$4::numeric and frequency=$5 and interval=$6 and anchor_date=$7::date and ($8::uuid is null or account_id=$8::uuid)", [params.workspaceId, body.recurringRuleId, bill.currency, bill.amount, bill.frequency, bill.interval, bill.anchorDate, bill.paymentAccountId]);
      if (!rule) return fail(422, 'Choose a recurring expense with the same amount, currency, schedule, and payment account.');
    }
    const [updated] = await q(tx, 'update bills set payment_account_id=case when $3::boolean then $4::uuid else payment_account_id end,recurring_rule_id=case when $5::boolean then $6::uuid else recurring_rule_id end,updated_at=now() where workspace_id=$1 and id=$2 returning id,payment_account_id as "paymentAccountId",recurring_rule_id as "recurringRuleId"', [params.workspaceId, params.id, body.paymentAccountId !== undefined, body.paymentAccountId ?? null, body.recurringRuleId !== undefined, body.recurringRuleId ?? null]);
    await q(tx, "insert into audit_logs(workspace_id,actor_user_id,entity_type,entity_id,action,after) values($1,$2,'bill',$3,'forecast_settings',$4::jsonb)", [params.workspaceId, userId, params.id, JSON.stringify(updated)]);
    return updated;
  }))
  .patch('/api/workspaces/:workspaceId/bill-occurrences/:id/forecast-settings', async ({ request, params }) => scoped(request, params.workspaceId, async (tx, userId) => {
    if (!uuid.test(params.id)) return fail(400, 'Invalid bill occurrence ID.');
    const body = await request.json() as { paymentAccountId?: unknown; expectedPaymentOn?: unknown; deferrableUntil?: unknown; transactionId?: unknown; recurringRuleId?: unknown };
    if (body.paymentAccountId !== undefined && body.paymentAccountId !== null && !uuid.test(String(body.paymentAccountId))) return fail(422, 'Choose a valid payment account.');
    if (body.transactionId !== undefined && body.transactionId !== null && !uuid.test(String(body.transactionId))) return fail(422, 'Choose a valid transaction.');
    if (body.recurringRuleId !== undefined && body.recurringRuleId !== null && !uuid.test(String(body.recurringRuleId))) return fail(422, 'Choose a valid recurring expense.');
    if (body.expectedPaymentOn !== undefined && body.expectedPaymentOn !== null && !validDate(body.expectedPaymentOn)) return fail(422, 'Choose a valid expected payment date.');
    if (body.deferrableUntil !== undefined && body.deferrableUntil !== null && !validDate(body.deferrableUntil)) return fail(422, 'Choose a valid flexibility end date.');
    const [occurrence] = await q(tx, 'select o.id,o.bill_id as "billId",o.due_on as "dueOn",o.amount::text,o.currency,o.payment_account_id as "occurrencePaymentAccountId",b.frequency,b.interval,b.anchor_date as "anchorDate",b.payment_account_id as "billPaymentAccountId",r.account_id as "recurringAccountId" from bill_occurrences o join bills b on b.workspace_id=o.workspace_id and b.id=o.bill_id left join recurring_rules r on r.workspace_id=b.workspace_id and r.id=b.recurring_rule_id where o.workspace_id=$1 and o.id=$2 for update of o,b', [params.workspaceId, params.id]);
    if (!occurrence) return fail(404, 'Bill occurrence not found.');
    if (body.deferrableUntil && String(body.deferrableUntil) < String(occurrence.dueOn)) return fail(422, 'The flexibility date cannot be before the bill due date.');
    if (body.recurringRuleId !== undefined) {
      if (body.recurringRuleId !== null && occurrence.frequency === 'once') return fail(422, 'A one-time bill cannot be linked to a recurring rule.');
      const [rule] = body.recurringRuleId===null?[{id:null}]:await q(tx, "select id from recurring_rules where workspace_id=$1 and id=$2 and status='active' and type='expense' and currency=$3 and amount=$4::numeric and frequency=$5 and interval=$6 and anchor_date=$7::date and ($8::uuid is null or account_id=$8::uuid)", [params.workspaceId, body.recurringRuleId, occurrence.currency, occurrence.amount, occurrence.frequency, occurrence.interval, occurrence.anchorDate, body.paymentAccountId ?? occurrence.billPaymentAccountId]);
      if (!rule) return fail(422, 'Choose a recurring expense with the same amount, currency, schedule, and payment account.');
      await q(tx, 'update bills set recurring_rule_id=$3,updated_at=now() where workspace_id=$1 and id=$2', [params.workspaceId, occurrence.billId, body.recurringRuleId]);
    }
    const accountId = body.paymentAccountId === undefined ? undefined : body.paymentAccountId;
    if (accountId) {
      const [account] = await q(tx, "select id from accounts where workspace_id=$1 and id=$2 and currency=$3 and kind in ('cash','bank','e_wallet','savings') and archived_at is null and deleted_at is null", [params.workspaceId, accountId, occurrence.currency]);
      if (!account) return fail(422, 'Choose an active cash account in the bill currency.');
    }
    let linkedAccountId: string | null = null;
    if (body.transactionId) {
      const [transaction] = await q(tx, "select id,(amount=$3::numeric) as \"sameAmount\",currency,type,account_id as \"accountId\",occurred_at::date::text as date from transactions where workspace_id=$1 and id=$2 and deleted_at is null for update", [params.workspaceId, body.transactionId, occurrence.amount]);
      const requiredAccountId=accountId??occurrence.occurrencePaymentAccountId??occurrence.billPaymentAccountId??occurrence.recurringAccountId;
      if (!transaction || !transaction.sameAmount || transaction.type !== 'expense' || transaction.currency !== occurrence.currency || (requiredAccountId && String(requiredAccountId) !== transaction.accountId)) return fail(422, 'Link only an existing expense with the same amount, currency, and selected account.');
      const [workspace] = await q(tx, 'select timezone from workspaces where id=$1', [params.workspaceId]);
      if (String(transaction.date) > workspaceToday(workspace.timezone)) return fail(422, 'A future transaction cannot settle a bill.');
      linkedAccountId = transaction.accountId;
    }
    const [updated] = await q(tx, "update bill_occurrences set payment_account_id=case when $3::boolean then $4::uuid when $9::boolean and $10::uuid is not null then $11::uuid else payment_account_id end,expected_payment_on=case when $5::boolean then $6::date else expected_payment_on end,deferrable_until=case when $7::boolean then $8::date else deferrable_until end,transaction_id=case when $9::boolean then $10::uuid else transaction_id end,status=case when $9::boolean then case when $10::uuid is null then 'unpaid' else 'paid' end else status end,paid_at=case when $9::boolean and $10::uuid is not null then coalesce(paid_at,now()) when $9::boolean then null else paid_at end where workspace_id=$1 and id=$2 returning id,status,transaction_id as \"transactionId\",payment_account_id as \"paymentAccountId\",expected_payment_on as \"expectedPaymentOn\",deferrable_until as \"deferrableUntil\"", [params.workspaceId, params.id, body.paymentAccountId !== undefined, body.paymentAccountId ?? null, body.expectedPaymentOn !== undefined, body.expectedPaymentOn ?? null, body.deferrableUntil !== undefined, body.deferrableUntil ?? null, body.transactionId !== undefined, body.transactionId ?? null, linkedAccountId]);
    await q(tx, "insert into audit_logs(workspace_id,actor_user_id,entity_type,entity_id,action,after) values($1,$2,'bill_occurrence',$3,'forecast_settings',$4::jsonb)", [params.workspaceId, userId, params.id, JSON.stringify(updated)]);
    return updated;
  }))
  .delete('/api/workspaces/:workspaceId/bills/:id', ({ request, params }) => scoped(request, params.workspaceId, async (tx) => {
    const [bill]=await q(tx,'update bills set archived_at=now(),enabled=false,updated_at=now() where workspace_id=$1 and id=$2 and archived_at is null returning id',[params.workspaceId,params.id]);
    return bill?new Response(null,{status:204}):fail(404,'Bill not found.');
  }))
  .post('/api/workspaces/:workspaceId/bill-occurrences/:id/:action', ({ request, params }) => scoped(request, params.workspaceId, async (tx, userId) => {
    if (!['paid', 'skip', 'reopen'].includes(params.action)) return fail(404, 'Action not found.');
    const status = params.action === 'paid' ? 'paid' : params.action === 'skip' ? 'skipped' : 'unpaid';
    const [row] = await q(tx, 'update bill_occurrences set status=$3,paid_at=case when $3=\'paid\' then now() else null end where workspace_id=$1 and id=$2 returning id,status,due_on as "dueOn"', [params.workspaceId, params.id, status]);
    if (!row) return fail(404, 'Bill occurrence not found.');
    await q(tx, 'insert into audit_logs(workspace_id,actor_user_id,entity_type,entity_id,action,after) values($1,$2,\'bill_occurrence\',$3,$4,$5::jsonb)', [params.workspaceId, userId, params.id, params.action, JSON.stringify(row)]);
    return { occurrence: row };
  }))
  .get('/api/push/vapid-public-key',()=>{
    const key=process.env.VAPID_PUBLIC_KEY;
    if(!key)return fail(503,'Browser push is not configured on this server.');
    return Response.json({publicKey:key},{headers:{'Cache-Control':'public, max-age=3600'}});
  })
  .post('/api/workspaces/:workspaceId/push-subscriptions',async({request,params})=>scoped(request,params.workspaceId,async(tx,userId)=>{
    const body=await request.json() as {endpoint?:unknown;keys?:{p256dh?:unknown;auth?:unknown}};
    if(typeof body.endpoint!=='string'||body.endpoint.length>2048||typeof body.keys?.p256dh!=='string'||body.keys.p256dh.length>256||typeof body.keys.auth!=='string'||body.keys.auth.length>256)return fail(422,'Invalid browser push subscription.');
    let endpoint:URL;try{endpoint=new URL(body.endpoint);}catch{return fail(422,'Invalid browser push endpoint.');}
    const host=endpoint.hostname.toLowerCase();
    const trustedPushHost=['fcm.googleapis.com','updates.push.services.mozilla.com','push.services.mozilla.com','web.push.apple.com'];
    if(endpoint.protocol!=='https:'||!trustedPushHost.some((domain)=>host===domain||host.endsWith(`.${domain}`)))return fail(422,'This browser push provider is not supported.');
    await q(tx,'insert into push_subscriptions(workspace_id,user_id,endpoint,p256dh,auth,updated_at) values($1,$2,$3,$4,$5,now()) on conflict(workspace_id,user_id,endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,updated_at=now()',[params.workspaceId,userId,endpoint.toString(),body.keys.p256dh,encryptPushAuth(body.keys.auth)]);
    return new Response(null,{status:204});
  }))
  .delete('/api/workspaces/:workspaceId/push-subscriptions',async({request,params})=>scoped(request,params.workspaceId,async(tx,userId)=>{
    const body=await request.json() as {endpoint?:unknown};
    if(typeof body.endpoint!=='string')return fail(422,'Invalid push subscription.');
    await q(tx,'delete from push_subscriptions where workspace_id=$1 and user_id=$2 and endpoint=$3',[params.workspaceId,userId,body.endpoint]);
    await q(tx,"update finance_notification_preferences set enabled=false,updated_at=now() where workspace_id=$1 and user_id=$2 and event_type='bill-reminder' and channel='push'",[params.workspaceId,userId]);
    return new Response(null,{status:204});
  }))
  ;
