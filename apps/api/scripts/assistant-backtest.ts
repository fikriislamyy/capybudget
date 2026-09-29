import { client } from '../src/db';

try {
  const rows = await client.unsafe(`
    WITH eligible AS (
      SELECT r.workspace_id,r.horizon_days,r.currency,d.scenario,d.date,
        d.closing_balance::numeric AS predicted,
        actual.balance AS actual
      FROM forecast_runs r
      JOIN assistant_settings s
        ON s.workspace_id=r.workspace_id AND s.user_id=r.user_id
       AND s.consent_version=r.consent_version
      JOIN workspaces w ON w.id=r.workspace_id
      JOIN forecast_daily_balances d
        ON d.workspace_id=r.workspace_id AND d.user_id=r.user_id AND d.run_id=r.id
       AND d.scope_key='workspace'
      CROSS JOIN LATERAL (
        SELECT coalesce(sum(CASE WHEN je.id IS NOT NULL THEN jl.debit-jl.credit ELSE 0 END),0)::numeric AS balance
        FROM jsonb_array_elements(r.input_snapshot->'accounts') selected
        JOIN accounts a
          ON a.workspace_id=r.workspace_id AND a.id=(selected->>'id')::uuid
         AND a.currency=r.currency
        LEFT JOIN journal_lines jl
          ON jl.workspace_id=a.workspace_id AND jl.ledger_account_id=a.ledger_account_id
        LEFT JOIN journal_entries je
          ON je.workspace_id=jl.workspace_id AND je.id=jl.entry_id AND je.effective_date<=d.date
      ) actual
      WHERE r.status='ready' AND r.expires_at>now()
        AND d.date>r.as_of_date
        AND d.date<(now() AT TIME ZONE w.timezone)::date
    )
    SELECT horizon_days AS "horizonDays",scenario,currency,
      count(*)::int AS observations,
      count(DISTINCT workspace_id)::int AS workspaces,
      round(avg(abs(predicted-actual)),4)::text AS "meanAbsoluteError",
      round(avg(abs(predicted-actual)/nullif(abs(actual),0)*100)
        FILTER (WHERE abs(actual)>=1.0000),2)::text AS "meanAbsolutePercentageError",
      count(*) FILTER (WHERE abs(actual)<1.0000)::int AS "nearZeroActuals"
    FROM eligible
    GROUP BY horizon_days,scenario,currency
    ORDER BY horizon_days,scenario,currency
  `);

  console.log(JSON.stringify({
    source: 'completed forecast dates compared with effective-dated ledger balances',
    percentageErrorDenominatorFloor: '1.0000',
    note: 'Near-zero actual balances remain in absolute error and are omitted from percentage error. Metrics are descriptive and are not a predictive-accuracy claim.',
    metrics: rows
  }, null, 2));
} finally {
  await client.end();
}
