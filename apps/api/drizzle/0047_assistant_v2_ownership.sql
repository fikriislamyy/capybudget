CREATE UNIQUE INDEX forecast_runs_actor_id_unique ON forecast_runs(workspace_id,user_id,id);
CREATE UNIQUE INDEX ai_invocations_actor_id_unique ON ai_invocations(workspace_id,user_id,id);
ALTER TABLE forecast_scenarios DROP CONSTRAINT forecast_scenarios_workspace_id_base_run_id_fkey;
ALTER TABLE forecast_scenarios ADD CONSTRAINT forecast_scenarios_actor_run_fk FOREIGN KEY(workspace_id,user_id,base_run_id) REFERENCES forecast_runs(workspace_id,user_id,id) ON DELETE CASCADE;
ALTER TABLE ai_tool_calls ADD CONSTRAINT ai_tool_calls_actor_invocation_fk FOREIGN KEY(workspace_id,user_id,invocation_id) REFERENCES ai_invocations(workspace_id,user_id,id) ON DELETE CASCADE;
ALTER TABLE ai_invocations ADD COLUMN attempts integer NOT NULL DEFAULT 1 CHECK(attempts BETWEEN 1 AND 3);
ALTER TABLE ai_invocations ADD COLUMN last_attempt_at timestamptz NOT NULL DEFAULT now();
