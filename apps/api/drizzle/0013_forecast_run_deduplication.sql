-- Collapse duplicate snapshots from older concurrent refreshes before enforcing
-- the invariant for new synchronous and queued runs.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY workspace_id,user_id,as_of_date,horizon_days,consent_version,scope_hash,input_hash
    ORDER BY CASE status WHEN 'ready' THEN 0 WHEN 'running' THEN 1 ELSE 2 END,requested_at,id
  ) AS position
  FROM forecast_runs
  WHERE status IN ('ready','queued','running')
)
UPDATE forecast_runs f SET status='superseded',lease_until=NULL,error_code='DUPLICATE_SNAPSHOT'
FROM ranked r WHERE f.id=r.id AND r.position>1;
--> statement-breakpoint
CREATE UNIQUE INDEX forecast_runs_active_snapshot_unique
  ON forecast_runs(workspace_id,user_id,as_of_date,horizon_days,consent_version,scope_hash,input_hash)
  WHERE status IN ('queued','running');
--> statement-breakpoint
CREATE UNIQUE INDEX forecast_runs_ready_snapshot_unique
  ON forecast_runs(workspace_id,user_id,as_of_date,horizon_days,consent_version,scope_hash,input_hash)
  WHERE status='ready';
