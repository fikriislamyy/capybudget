CREATE TABLE debts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),name text NOT NULL,
 linked_account_id uuid NOT NULL,currency varchar(3) NOT NULL,apr numeric(9,4) NOT NULL CHECK(apr>=0 AND apr<=1000),
 minimum_payment numeric(19,4) NOT NULL CHECK(minimum_payment>=0),due_day integer NOT NULL CHECK(due_day BETWEEN 1 AND 31),
 starts_on date NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),archived_at timestamptz,
 UNIQUE(workspace_id,id),UNIQUE(workspace_id,linked_account_id),FOREIGN KEY(workspace_id,linked_account_id) REFERENCES accounts(workspace_id,id)
);
CREATE TABLE debt_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,debt_id uuid NOT NULL,principal numeric(19,4) NOT NULL CHECK(principal>0),
 interest numeric(19,4) NOT NULL CHECK(interest>=0),fees numeric(19,4) NOT NULL CHECK(fees>=0),occurred_on date NOT NULL,
 principal_transaction_id uuid NOT NULL,expense_transaction_id uuid,idempotency_key text NOT NULL,created_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(debt_id,idempotency_key),
 FOREIGN KEY(workspace_id,debt_id) REFERENCES debts(workspace_id,id),
 FOREIGN KEY(workspace_id,principal_transaction_id) REFERENCES transactions(workspace_id,id),
 FOREIGN KEY(workspace_id,expense_transaction_id) REFERENCES transactions(workspace_id,id)
);
CREATE TABLE debt_payoff_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),strategy text NOT NULL,
 starts_on date NOT NULL,extra numeric(19,4) NOT NULL,currency varchar(3) NOT NULL,assumptions jsonb NOT NULL,result jsonb NOT NULL,
 calculation_version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),name text NOT NULL,
 normalized_merchant text NOT NULL,account_id uuid NOT NULL,currency varchar(3) NOT NULL,amount numeric(19,4) NOT NULL CHECK(amount>0),
 cadence text NOT NULL CHECK(cadence IN ('week','month','year')),next_charge date NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled','paused')),bill_id uuid,last_reviewed_on date NOT NULL,
 cancelled_on date,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),
 FOREIGN KEY(workspace_id,account_id) REFERENCES accounts(workspace_id,id),FOREIGN KEY(workspace_id,bill_id) REFERENCES bills(workspace_id,id)
);
CREATE TABLE subscription_candidates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),normalized_merchant text NOT NULL,
 account_id uuid NOT NULL,currency varchar(3) NOT NULL,cadence text NOT NULL,amount numeric(19,4) NOT NULL,
 evidence jsonb NOT NULL,confidence text NOT NULL,state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','dismissed')),
 subscription_id uuid,algorithm_version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,normalized_merchant,account_id,currency,cadence),FOREIGN KEY(workspace_id,account_id) REFERENCES accounts(workspace_id,id),
 FOREIGN KEY(workspace_id,subscription_id) REFERENCES subscriptions(workspace_id,id)
);
CREATE TABLE subscription_transaction_links (
 workspace_id uuid NOT NULL,subscription_id uuid NOT NULL,transaction_id uuid NOT NULL,PRIMARY KEY(subscription_id,transaction_id),
 FOREIGN KEY(workspace_id,subscription_id) REFERENCES subscriptions(workspace_id,id),FOREIGN KEY(workspace_id,transaction_id) REFERENCES transactions(workspace_id,id)
);
CREATE TABLE net_worth_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),name text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('asset','liability')),currency varchar(3) NOT NULL,ownership_percent numeric(7,4) NOT NULL DEFAULT 100 CHECK(ownership_percent>0 AND ownership_percent<=100),
 created_at timestamptz NOT NULL DEFAULT now(),archived_at timestamptz,UNIQUE(workspace_id,id)
);
CREATE TABLE net_worth_valuations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,item_id uuid NOT NULL,as_of date NOT NULL,
 amount numeric(19,4) NOT NULL CHECK(amount>=0),source text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,item_id) REFERENCES net_worth_items(workspace_id,id)
);
CREATE TABLE net_worth_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),as_of date NOT NULL,currency varchar(3) NOT NULL,
 assets numeric(19,4),liabilities numeric(19,4),net_worth numeric(19,4),status text NOT NULL CHECK(status IN ('complete','incomplete')),
 revision integer NOT NULL,calculation_version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,as_of,revision)
);
CREATE TABLE net_worth_snapshot_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,snapshot_id uuid NOT NULL REFERENCES net_worth_snapshots(id),
 source_id uuid NOT NULL,source_type text NOT NULL,name text NOT NULL,kind text NOT NULL,currency varchar(3) NOT NULL,
 source_amount numeric(19,4),source_date date,rate numeric(28,12),rate_date date,base_amount numeric(19,4),status text NOT NULL,
 FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['debts','debt_payments','debt_payoff_plans','subscriptions','subscription_candidates','subscription_transaction_links','net_worth_items','net_worth_valuations','net_worth_snapshots','net_worth_snapshot_lines'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY workspace_scope ON %I USING(workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''')))',t,t);
 EXECUTE format('CREATE TRIGGER active_workspace_write BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION capybudget_active_workspace_write()',t);
 END LOOP;
END $$;
CREATE INDEX subscription_scan_expenses ON transactions(workspace_id,occurred_at,account_id) WHERE type='expense' AND deleted_at IS NULL;
CREATE INDEX net_worth_valuation_latest ON net_worth_valuations(workspace_id,item_id,as_of DESC,recorded_at DESC);
