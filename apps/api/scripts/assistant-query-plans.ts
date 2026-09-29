import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL ?? '';
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
if (!databaseName.endsWith('_test')) {
  throw new Error('Set DATABASE_URL to a disposable PostgreSQL database whose name ends in _test.');
}

const sql = postgres(databaseUrl, { max: 1 });
type PlanNode = { 'Node Type': string; 'Actual Total Time'?: number; 'Actual Rows'?: number; 'Shared Hit Blocks'?: number; 'Shared Read Blocks'?: number; 'Index Name'?: string; Plans?: PlanNode[] };

function summarize(node: PlanNode, output: Array<Record<string, unknown>> = []) {
  output.push({
    node: node['Node Type'],
    ...(node['Index Name'] ? { index: node['Index Name'] } : {}),
    actualMs: Number((node['Actual Total Time'] ?? 0).toFixed(3)),
    actualRows: node['Actual Rows'] ?? 0,
    sharedHitBlocks: node['Shared Hit Blocks'] ?? 0,
    sharedReadBlocks: node['Shared Read Blocks'] ?? 0
  });
  for (const child of node.Plans ?? []) summarize(child, output);
  return output;
}

try {
  const [workspace] = await sql`select id, owner_user_id from workspaces where archived_at is null order by id limit 1`;
  if (!workspace) throw new Error('The disposable database must contain a workspace fixture.');
  const marker = `assistant-plan-fixture:${crypto.randomUUID()}:`;
  let accountIds: string[] = [];
  try {
    await sql.begin(async (tx) => {
      await tx`select set_config('app.user_id', ${workspace.owner_user_id}, true), set_config('app.workspace_id', ${workspace.id}, true)`;
      const [account] = await tx`select a.id, a.currency from accounts a where a.workspace_id=${workspace.id} and a.kind in ('cash','bank','e_wallet') and a.archived_at is null and a.deleted_at is null order by a.created_at limit 1`;
      const [category] = await tx`select id from categories where workspace_id=${workspace.id} and type='expense' and archived_at is null order by sort_order limit 1`;
      if (!account || !category) throw new Error('The disposable database needs one cash account and one active expense category.');
      accountIds = [account.id];
      await tx`insert into transactions(workspace_id,account_id,category_id,notes,merchant,amount,currency,type,occurred_at,created_by)
        select ${workspace.id},${account.id},${category.id},${marker}||g::text,'Synthetic plan fixture','1.0000',${account.currency},'expense',current_date-(g%90+1),${workspace.owner_user_id}
        from generate_series(1,10000) as g`;
    });
    await sql`analyze transactions`;

    const plans = await sql.begin(async (tx) => {
      await tx`select set_config('app.user_id', ${workspace.owner_user_id}, true), set_config('app.workspace_id', ${workspace.id}, true)`;
      const history = await tx.unsafe(`explain (analyze, buffers, format json)
      select t.id from transactions t
      where t.workspace_id=$1 and t.account_id=any($2::uuid[]) and t.deleted_at is null
        and t.type in ('income','expense') and t.occurred_at >= current_date-90 and t.occurred_at < current_date
        and not exists(select 1 from invoice_payments ip where ip.workspace_id=t.workspace_id and ip.transaction_id=t.id)
        and not exists(select 1 from bill_occurrences bo where bo.workspace_id=t.workspace_id and bo.transaction_id=t.id)
        and not exists(select 1 from recurring_occurrences ro where ro.workspace_id=t.workspace_id and ro.transaction_id=t.id)
      order by t.occurred_at desc,t.id limit 100`, [workspace.id, accountIds]);
      const balances = await tx.unsafe(`explain (analyze, buffers, format json)
      select a.id, coalesce(sum(jl.debit-jl.credit) filter(where je.effective_date<=current_date),0)
      from accounts a left join journal_lines jl on jl.workspace_id=a.workspace_id and jl.ledger_account_id=a.ledger_account_id
      left join journal_entries je on je.workspace_id=jl.workspace_id and je.id=jl.entry_id
      where a.workspace_id=$1 and a.id=any($2::uuid[]) and a.archived_at is null and a.deleted_at is null
      group by a.id`, [workspace.id, accountIds]);
      const invoices = await tx.unsafe(`explain (analyze, buffers, format json)
      select i.id,greatest(i.total-coalesce(sum(p.amount) filter(where p.reversed_at is null),0),0)
      from invoices i left join invoice_payments p on p.workspace_id=i.workspace_id and p.invoice_id=i.id
      where i.workspace_id=$1 and i.state='issued' and i.archived_at is null and i.due_date<=current_date+90
      group by i.id`, [workspace.id]);
      return { history, balances, invoices };
    });

    const describe = (rows: typeof plans.history) => summarize(rows[0]!['QUERY PLAN'][0].Plan as PlanNode);
    console.log(JSON.stringify({
      database: databaseName,
      fixture: '10,000 temporary synthetic transactions in one cash account; no row values are printed',
      queries: {
        historicalTransactionBaseline: describe(plans.history),
        journalBalanceAsOfDate: describe(plans.balances),
        outstandingInvoices: describe(plans.invoices)
      }
    }, null, 2));
  } finally {
    await sql.begin(async (tx) => {
      await tx`select set_config('app.user_id', ${workspace.owner_user_id}, true), set_config('app.workspace_id', ${workspace.id}, true)`;
      await tx`delete from transactions where workspace_id=${workspace.id} and notes like ${marker + '%'}`;
    });
    await sql`analyze transactions`;
  }
} finally {
  await sql.end();
}
