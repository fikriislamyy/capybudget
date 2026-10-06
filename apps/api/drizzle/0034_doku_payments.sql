CREATE TABLE payment_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),provider text NOT NULL DEFAULT 'doku' CHECK(provider='doku'),
 sandbox boolean NOT NULL,client_id text NOT NULL,secret_key text NOT NULL,account_id uuid NOT NULL,category_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),disabled_at timestamptz,
 UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,account_id) REFERENCES accounts(workspace_id,id),FOREIGN KEY(workspace_id,category_id) REFERENCES categories(workspace_id,id)
);
CREATE UNIQUE INDEX payment_connections_active ON payment_connections(workspace_id,sandbox) WHERE disabled_at IS NULL;
CREATE TABLE payment_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,connection_id uuid NOT NULL,invoice_id uuid NOT NULL,
 account_id uuid NOT NULL,category_id uuid NOT NULL,amount numeric(19,4) NOT NULL CHECK(amount>0 AND amount=trunc(amount) AND amount<1000000000000),currency varchar(3) NOT NULL DEFAULT 'IDR' CHECK(currency='IDR'),
 provider_reference text NOT NULL UNIQUE,provider_request_id text NOT NULL UNIQUE,idempotency_key text NOT NULL,request_hash text NOT NULL,qris_only boolean NOT NULL,
 state text NOT NULL DEFAULT 'creating' CHECK(state IN ('creating','ready','uncertain','paid','expired','reconciliation')),payment_url text,
 provider_expiry text,provider_status jsonb,payment_id uuid,created_by text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 next_check_at timestamptz NOT NULL DEFAULT now()+interval '60 seconds',lease_until timestamptz,check_attempts integer NOT NULL DEFAULT 0,failure_code text,
 UNIQUE(workspace_id,id),UNIQUE(workspace_id,idempotency_key),FOREIGN KEY(workspace_id,connection_id) REFERENCES payment_connections(workspace_id,id),
 FOREIGN KEY(workspace_id,invoice_id) REFERENCES invoices(workspace_id,id),FOREIGN KEY(workspace_id,payment_id) REFERENCES invoice_payments(workspace_id,id),
 FOREIGN KEY(workspace_id,account_id) REFERENCES accounts(workspace_id,id),FOREIGN KEY(workspace_id,category_id) REFERENCES categories(workspace_id,id)
);
CREATE UNIQUE INDEX payment_requests_open_invoice ON payment_requests(workspace_id,invoice_id) WHERE state IN ('creating','ready','uncertain');
CREATE INDEX payment_requests_due ON payment_requests(next_check_at) WHERE state IN ('creating','ready','uncertain');
CREATE TABLE payment_webhook_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,connection_id uuid NOT NULL,request_id text NOT NULL,body_hash text NOT NULL,
 payment_request_id uuid,status jsonb NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),UNIQUE(connection_id,request_id),
 FOREIGN KEY(workspace_id,connection_id) REFERENCES payment_connections(workspace_id,id),FOREIGN KEY(workspace_id,payment_request_id) REFERENCES payment_requests(workspace_id,id)
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['payment_connections','payment_requests','payment_webhook_events'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY payment_scope ON %I USING(workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND capybudget_workspace_role(workspace_id) IN (''owner'',''accountant'',''viewer'')) WITH CHECK(workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND capybudget_workspace_role(workspace_id) IN (''owner'',''accountant''))',t);
 EXECUTE format('CREATE TRIGGER active_workspace_write BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION capybudget_active_workspace_write()',t);
END LOOP;END $$;
