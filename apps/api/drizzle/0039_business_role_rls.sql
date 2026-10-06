-- Defense in depth for SQL roles that do not bypass row security.
-- Existing tenant policies still enforce workspace membership and context.
DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['accounts','ledger_accounts','tags','transactions','transaction_tags','journal_entries','journal_lines','recurring_rules','recurring_occurrences','attachments','budgets','savings_goals','goal_contributions','bills','bill_occurrences','invoice_number_sequences','invoice_payments','invoice_deliveries'] LOOP
 EXECUTE format('CREATE POLICY business_role_read ON %I AS RESTRICTIVE FOR SELECT USING(capybudget_workspace_role(workspace_id) IN (''owner'',''accountant'',''viewer''))',t);
 EXECUTE format('CREATE POLICY business_role_insert ON %I AS RESTRICTIVE FOR INSERT WITH CHECK(capybudget_workspace_role(workspace_id) IN (''owner'',''accountant''))',t);
 EXECUTE format('CREATE POLICY business_role_update ON %I AS RESTRICTIVE FOR UPDATE USING(capybudget_workspace_role(workspace_id) IN (''owner'',''accountant'')) WITH CHECK(capybudget_workspace_role(workspace_id) IN (''owner'',''accountant''))',t);
 EXECUTE format('CREATE POLICY business_role_delete ON %I AS RESTRICTIVE FOR DELETE USING(capybudget_workspace_role(workspace_id) IN (''owner'',''accountant''))',t);
END LOOP;
FOREACH t IN ARRAY ARRAY['categories','business_profiles'] LOOP
 EXECUTE format('CREATE POLICY business_role_insert ON %I AS RESTRICTIVE FOR INSERT WITH CHECK(capybudget_workspace_role(workspace_id) IN (''owner'',''accountant''))',t);
 EXECUTE format('CREATE POLICY business_role_update ON %I AS RESTRICTIVE FOR UPDATE USING(capybudget_workspace_role(workspace_id) IN (''owner'',''accountant'')) WITH CHECK(capybudget_workspace_role(workspace_id) IN (''owner'',''accountant''))',t);
 EXECUTE format('CREATE POLICY business_role_delete ON %I AS RESTRICTIVE FOR DELETE USING(capybudget_workspace_role(workspace_id) IN (''owner'',''accountant''))',t);
END LOOP;
FOREACH t IN ARRAY ARRAY['payment_requests','payment_webhook_events','payment_refunds','payment_request_fees','recurring_invoice_templates','recurring_invoice_occurrences','vendor_bills','vendor_bill_lines','vendor_bill_payments','business_projects','project_allocations','business_tax_reminders'] LOOP
 EXECUTE format('CREATE POLICY business_role_delete ON %I AS RESTRICTIVE FOR DELETE USING(capybudget_workspace_role(workspace_id) IN (''owner'',''accountant''))',t);
END LOOP;
END $$;
CREATE POLICY business_invoice_role ON invoices AS RESTRICTIVE USING(
 capybudget_workspace_role(workspace_id) IN ('owner','accountant','viewer') OR
 (capybudget_workspace_role(workspace_id)='staff' AND created_by=nullif(current_setting('app.user_id',true),'') AND state='draft')
) WITH CHECK(
 capybudget_workspace_role(workspace_id) IN ('owner','accountant') OR
 (capybudget_workspace_role(workspace_id)='staff' AND created_by=nullif(current_setting('app.user_id',true),'') AND state='draft')
);
CREATE POLICY business_invoice_delete ON invoices AS RESTRICTIVE FOR DELETE USING(
 capybudget_workspace_role(workspace_id) IN ('owner','accountant') OR
 (capybudget_workspace_role(workspace_id)='staff' AND created_by=nullif(current_setting('app.user_id',true),'') AND state='draft')
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['invoice_lines','business_documents'] LOOP
 EXECUTE format('CREATE POLICY business_invoice_child_role ON %I AS RESTRICTIVE USING(capybudget_workspace_role(workspace_id) IN (''owner'',''accountant'',''viewer'') OR EXISTS(SELECT 1 FROM invoices i WHERE i.workspace_id=%I.workspace_id AND i.id=%I.invoice_id AND i.created_by=nullif(current_setting(''app.user_id'',true),'''') AND i.state=''draft'')) WITH CHECK(capybudget_workspace_role(workspace_id) IN (''owner'',''accountant'') OR (capybudget_workspace_role(workspace_id)=''staff'' AND EXISTS(SELECT 1 FROM invoices i WHERE i.workspace_id=%I.workspace_id AND i.id=%I.invoice_id AND i.created_by=nullif(current_setting(''app.user_id'',true),'''') AND i.state=''draft'')))',t,t,t,t,t);
 EXECUTE format('CREATE POLICY business_invoice_child_delete ON %I AS RESTRICTIVE FOR DELETE USING(capybudget_workspace_role(workspace_id) IN (''owner'',''accountant'') OR (capybudget_workspace_role(workspace_id)=''staff'' AND EXISTS(SELECT 1 FROM invoices i WHERE i.workspace_id=%I.workspace_id AND i.id=%I.invoice_id AND i.created_by=nullif(current_setting(''app.user_id'',true),'''') AND i.state=''draft'')))',t,t,t);
END LOOP;END $$;
CREATE POLICY business_audit_read ON audit_logs AS RESTRICTIVE FOR SELECT USING(capybudget_workspace_role(workspace_id) IN ('owner','accountant'));
CREATE POLICY business_audit_insert ON audit_logs AS RESTRICTIVE FOR INSERT WITH CHECK(capybudget_workspace_role(workspace_id) IN ('owner','accountant') OR (capybudget_workspace_role(workspace_id)='staff' AND actor_user_id=nullif(current_setting('app.user_id',true),'')));
