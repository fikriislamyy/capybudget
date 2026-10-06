import { Elysia } from 'elysia';
import type { TransactionSql } from 'postgres';
import { randomUUID } from 'node:crypto';
import { scope } from './routes';
import { calculateTax } from './tax-money';
import { isoDate } from '../tracking/routes';

const q = (tx: TransactionSql, sql: string, values: unknown[] = []) => tx.unsafe(sql, values as never[]);
function reject(message: string, status = 422): never {
  throw Object.assign(new Error(message), { status, code: status === 403 ? 'PERMISSION_DENIED' : 'INVALID_TAX_SETTINGS' });
}
async function permission(tx: TransactionSql, ws: string, actor: string, write = false) {
  const [member] = await q(tx, 'select role from workspace_memberships where workspace_id=$1 and user_id=$2 for share', [ws, actor]);
  if (!member || !(write ? ['owner'] : ['owner', 'accountant', 'viewer', 'staff']).includes(member.role)) reject('Your workspace role cannot perform this tax action.', 403);
}
async function audit(tx: TransactionSql, ws: string, actor: string, id: string, action: string, after: unknown) {
  await q(tx, "insert into audit_logs(workspace_id,actor_user_id,entity_type,entity_id,action,after) values($1,$2,'business_tax',$3,$4,$5::jsonb)", [ws, actor, id, action, JSON.stringify(after)]);
}
const rateColumns = 'id,name,statutory_rate::text as rate,base_numerator as "baseNumerator",base_denominator as "baseDenominator",inclusive,effective_from as "effectiveFrom",effective_to as "effectiveTo",applicability,archived_at as "archivedAt"';
export const businessTaxRoutes = new Elysia({ name: 'business-tax' })
  .get('/api/workspaces/:workspaceId/business-tax', ({ request, params }) => scope(request, params.workspaceId, async (tx, actor) => {
    const ws = params.workspaceId; await permission(tx, ws, actor.id);
    const [settings] = await q(tx, 'select enabled,jurisdiction,version from business_tax_settings where workspace_id=$1', [ws]);
    return { settings: settings ?? { enabled: false, jurisdiction: 'ID', version: 0 },
      canConfigure: (await q(tx, 'select role from workspace_memberships where workspace_id=$1 and user_id=$2', [ws, actor.id]))[0]!.role === 'owner',
      rates: await q(tx, `select ${rateColumns} from business_tax_rates where workspace_id=$1 order by effective_from desc,created_at desc limit 500`, [ws]) };
  }))
  .patch('/api/workspaces/:workspaceId/business-tax', ({ request, params }) => scope(request, params.workspaceId, async (tx, actor) => {
    const ws = params.workspaceId; await permission(tx, ws, actor.id, true);
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.enabled !== 'boolean' || !Number.isInteger(body.version) || Number(body.version) < 0) reject('Choose whether tax is enabled and reload the latest settings.');
    // Lock the workspace as well as the membership to serialize first-time configuration.
    await q(tx, 'select id from workspaces where id=$1 for update', [ws]);
    const [current] = await q(tx, 'select version from business_tax_settings where workspace_id=$1 for update', [ws]);
    if (Number(current?.version ?? 0) !== body.version) reject('Tax settings changed. Reload before saving.', 409);
    const [settings] = await q(tx, `insert into business_tax_settings(workspace_id,enabled,updated_by) values($1,$2,$3)
      on conflict(workspace_id) do update set enabled=excluded.enabled,version=business_tax_settings.version+1,updated_by=excluded.updated_by,updated_at=now()
      returning enabled,jurisdiction,version`, [ws, body.enabled, actor.id]);
    await audit(tx, ws, actor.id, ws, 'tax_settings_changed', { enabled: body.enabled, jurisdiction: 'ID' });
    return { settings };
  }))
  .post('/api/workspaces/:workspaceId/business-tax/rates', ({ request, params }) => scope(request, params.workspaceId, async (tx, actor) => {
    const ws = params.workspaceId; await permission(tx, ws, actor.id, true);
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120
      || typeof body.applicability !== 'string' || !body.applicability.trim() || body.applicability.length > 1000) reject('Add a rate name and explain when it applies.');
    const from = isoDate(body.effectiveFrom), to = body.effectiveTo ? isoDate(body.effectiveTo) : null;
    if (to && to < from) reject('The end date must be on or after the start date.');
    calculateTax('100', 'IDR', { rate: body.rate as string, baseNumerator: body.baseNumerator as number,
      baseDenominator: body.baseDenominator as number, inclusive: body.inclusive as boolean });
    const id = randomUUID();
    const [rate] = await q(tx, `insert into business_tax_rates(id,workspace_id,name,statutory_rate,base_numerator,base_denominator,inclusive,effective_from,effective_to,applicability,created_by)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning ${rateColumns}`,
      [id, ws, body.name.trim(), body.rate, body.baseNumerator, body.baseDenominator, body.inclusive, from, to, body.applicability.trim(), actor.id]);
    await audit(tx, ws, actor.id, id, 'tax_rate_created', rate);
    return { rate };
  }))
  .get('/api/workspaces/:workspaceId/business-tax/register', ({ request, params }) => scope(request, params.workspaceId, async (tx, actor) => {
    const ws = params.workspaceId; await permission(tx, ws, actor.id);
    const [member]=await q(tx,'select role from workspace_memberships where workspace_id=$1 and user_id=$2',[ws,actor.id]);
    if(member.role==='staff')reject('Staff cannot access financial reports.',403);
    const query = new URL(request.url).searchParams;
    const from = isoDate(query.get('from')), through = isoDate(query.get('through'));
    if (through < from || Date.parse(through) - Date.parse(from) > 366 * 86400000) reject('Choose a date range of up to one year.');
    // A document register, not a cash-basis tax return. Historical void dates matter.
    const predicate = `i.workspace_id=$1 and i.archived_at is null and i.state in ('issued','void')
      and i.issue_date between $2::date and $3::date
      and (i.state<>'void' or i.void_effective_on>$3::date)`;
    const [count] = await q(tx, `select count(*)::int as count from invoices i join invoice_lines l on l.workspace_id=i.workspace_id and l.invoice_id=i.id where ${predicate} and l.tax_amount>0`, [ws, from, through]);
    if (count.count > 5000) reject('This register has too many lines. Choose a shorter date range.', 413);
    const rows = await q(tx, `select i.id as "invoiceId",i.number,i.issue_date as "issueDate",i.currency,
      l.position,l.net_amount::text as "netAmount",l.tax_amount::text as "taxAmount",l.total_amount::text as "totalAmount",
      l.tax_rate::text as "effectiveRate",l.tax_snapshot as "taxPolicy"
      from invoices i join invoice_lines l on l.workspace_id=i.workspace_id and l.invoice_id=i.id
      where ${predicate} and l.tax_amount>0 order by i.issue_date,i.number,l.position limit 5000`, [ws, from, through]);
    const totals = await q(tx, `select i.currency,sum(l.net_amount)::text as "netAmount",sum(l.tax_amount)::text as "taxAmount",sum(l.total_amount)::text as "totalAmount"
      from invoices i join invoice_lines l on l.workspace_id=i.workspace_id and l.invoice_id=i.id
      where ${predicate} and l.tax_amount>0 group by i.currency order by i.currency`, [ws, from, through]);
    return { jurisdiction: 'ID', basis: 'issued_invoice_document_register', from, through, rows, totals,
      limitations: ['Sales invoice lines only; excludes purchases and input tax credits.', 'Not a tax return, tax payable calculation, or Coretax submission.', 'Currencies are shown separately without conversion.'] };
  },true))
  .delete('/api/workspaces/:workspaceId/business-tax/rates/:rateId', ({ request, params }) => scope(request, params.workspaceId, async (tx, actor) => {
    const ws = params.workspaceId; await permission(tx, ws, actor.id, true);
    if (!/^[0-9a-f-]{36}$/i.test(params.rateId)) reject('Invalid tax rate.');
    const [rate] = await q(tx, 'update business_tax_rates set archived_at=now() where workspace_id=$1 and id=$2 and archived_at is null returning id', [ws, params.rateId]);
    if (!rate) reject('Tax rate not found.', 404);
    await audit(tx, ws, actor.id, rate.id, 'tax_rate_archived', { archived: true });
    return { archived: true };
  }));
