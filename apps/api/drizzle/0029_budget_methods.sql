CREATE TABLE budget_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100), method text NOT NULL CHECK(method IN ('50-30-20','zero-based','envelope')),
 starts_on date NOT NULL, ends_on date NOT NULL CHECK(ends_on>starts_on), currency varchar(3) NOT NULL,
 funding_basis text NOT NULL CHECK(funding_basis IN ('planned','received')), planned_funding numeric(19,4) NOT NULL CHECK(planned_funding>=0),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','finalized')), revision integer NOT NULL DEFAULT 1,
 created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,id)
);
CREATE TABLE budget_buckets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, plan_id uuid NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100), allocation numeric(19,4) NOT NULL CHECK(allocation>=0),
 target_percent integer CHECK(target_percent BETWEEN 0 AND 100), sort_order integer NOT NULL,
 UNIQUE(workspace_id,id), UNIQUE(plan_id,sort_order), FOREIGN KEY(workspace_id,plan_id) REFERENCES budget_plans(workspace_id,id) ON DELETE CASCADE
);
CREATE TABLE budget_bucket_categories (
 workspace_id uuid NOT NULL, plan_id uuid NOT NULL, bucket_id uuid NOT NULL, category_id uuid NOT NULL,
 PRIMARY KEY(plan_id,category_id), FOREIGN KEY(workspace_id,plan_id) REFERENCES budget_plans(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,bucket_id) REFERENCES budget_buckets(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,category_id) REFERENCES categories(workspace_id,id)
);
CREATE TABLE envelope_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, plan_id uuid NOT NULL,
 from_bucket_id uuid NOT NULL, to_bucket_id uuid NOT NULL CHECK(to_bucket_id<>from_bucket_id),
 amount numeric(19,4) NOT NULL CHECK(amount>0), reason text NOT NULL, idempotency_key text NOT NULL,
 created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(plan_id,idempotency_key),
 FOREIGN KEY(workspace_id,plan_id) REFERENCES budget_plans(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,from_bucket_id) REFERENCES budget_buckets(workspace_id,id),
 FOREIGN KEY(workspace_id,to_bucket_id) REFERENCES budget_buckets(workspace_id,id)
);
CREATE INDEX budget_plans_workspace_period ON budget_plans(workspace_id,starts_on);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['budget_plans','budget_buckets','budget_bucket_categories','envelope_movements'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY workspace_scope ON %I USING(workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''')))',t,t);
 EXECUTE format('CREATE TRIGGER active_workspace_write BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION capybudget_active_workspace_write()',t);
 END LOOP;
END $$;
