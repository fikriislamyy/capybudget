ALTER TABLE invoice_payments ADD COLUMN refunded_amount numeric(19,4) NOT NULL DEFAULT 0 CHECK(refunded_amount>=0 AND refunded_amount<=amount);
ALTER TABLE payment_requests ADD COLUMN unapplied_transaction_id uuid;
ALTER TABLE payment_requests ADD FOREIGN KEY(workspace_id,unapplied_transaction_id) REFERENCES transactions(workspace_id,id);
ALTER TABLE payment_requests DROP CONSTRAINT payment_requests_state_check;
ALTER TABLE payment_requests ADD CONSTRAINT payment_requests_state_check CHECK(state IN ('creating','ready','uncertain','paid','expired','reconciliation','partially_refunded','refunded'));
CREATE TABLE payment_refunds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,request_id uuid NOT NULL,invoice_payment_id uuid,transaction_id uuid NOT NULL,
 amount numeric(19,4) NOT NULL CHECK(amount>0),currency varchar(3) NOT NULL,paid_on date NOT NULL,kind text NOT NULL CHECK(kind IN ('refund','chargeback')),reason text NOT NULL,
 idempotency_key text NOT NULL,request_hash text NOT NULL,created_by text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),UNIQUE(workspace_id,idempotency_key),UNIQUE(workspace_id,transaction_id),FOREIGN KEY(workspace_id,request_id) REFERENCES payment_requests(workspace_id,id),
 FOREIGN KEY(workspace_id,invoice_payment_id) REFERENCES invoice_payments(workspace_id,id),FOREIGN KEY(workspace_id,transaction_id) REFERENCES transactions(workspace_id,id)
);
CREATE TABLE payment_request_fees (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,request_id uuid NOT NULL,transaction_id uuid NOT NULL,amount numeric(19,4) NOT NULL CHECK(amount>0),currency varchar(3) NOT NULL,paid_on date NOT NULL,
 idempotency_key text NOT NULL,request_hash text NOT NULL,created_by text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),UNIQUE(workspace_id,idempotency_key),UNIQUE(workspace_id,transaction_id),FOREIGN KEY(workspace_id,request_id) REFERENCES payment_requests(workspace_id,id),FOREIGN KEY(workspace_id,transaction_id) REFERENCES transactions(workspace_id,id)
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['payment_refunds','payment_request_fees'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY payment_adjustment_scope ON %I USING(workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND capybudget_workspace_role(workspace_id) IN (''owner'',''accountant'',''viewer'')) WITH CHECK(workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND capybudget_workspace_role(workspace_id) IN (''owner'',''accountant''))',t);
 EXECUTE format('CREATE TRIGGER active_workspace_write BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION capybudget_active_workspace_write()',t);
END LOOP;END $$;
