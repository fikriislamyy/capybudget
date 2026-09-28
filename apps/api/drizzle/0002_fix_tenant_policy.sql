DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['accounts','ledger_accounts','categories','tags','transactions','transaction_tags','journal_entries','journal_lines','audit_logs','idempotency_keys','recurring_rules','recurring_occurrences','attachments'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS tenant_scope ON %I',tab);
  EXECUTE format('CREATE POLICY tenant_scope ON %I USING (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),''''))) WITH CHECK (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''')))',tab,tab,tab);
 END LOOP;
END $$;
