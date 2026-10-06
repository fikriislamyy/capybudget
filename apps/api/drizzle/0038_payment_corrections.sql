ALTER TABLE payment_refunds ADD COLUMN reversed_at timestamptz, ADD COLUMN reversal_effective_on date, ADD COLUMN reversal_reason text;
ALTER TABLE payment_request_fees ADD COLUMN reversed_at timestamptz, ADD COLUMN reversal_effective_on date, ADD COLUMN reversal_reason text;
DROP POLICY payment_scope ON payment_connections;
CREATE POLICY payment_connection_owner_scope ON payment_connections
 USING(workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND capybudget_workspace_role(workspace_id) IN ('owner','accountant','viewer'))
 WITH CHECK(workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND capybudget_workspace_role(workspace_id)='owner');
