ALTER TABLE forecast_runs ADD COLUMN request_key text;
--> statement-breakpoint
CREATE UNIQUE INDEX forecast_runs_request_key_unique ON forecast_runs(workspace_id,user_id,request_key);
