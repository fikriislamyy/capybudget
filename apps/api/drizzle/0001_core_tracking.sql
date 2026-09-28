-- Custom SQL migration file, put your code below! --
CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('personal','business')),
  currency varchar(3) NOT NULL DEFAULT 'IDR' CHECK(currency ~ '^[A-Z]{3}$'),
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX workspaces_owner_personal_unique ON workspaces(owner_user_id) WHERE kind='personal';
--> statement-breakpoint
CREATE TABLE workspace_memberships (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK(role='owner'),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,user_id)
);
--> statement-breakpoint
CREATE INDEX workspace_memberships_user_idx ON workspace_memberships(user_id);
--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM accounts GROUP BY user_id HAVING count(DISTINCT currency)>1) THEN
  RAISE EXCEPTION 'Migration requires manual workspace mapping for a user with multiple account currencies';
 END IF;
 IF EXISTS(SELECT 1 FROM transactions WHERE type='transfer') THEN
  RAISE EXCEPTION 'Migration requires manual reconciliation of legacy transfers with no destination account';
 END IF;
 IF EXISTS(SELECT 1 FROM accounts a LEFT JOIN "user" u ON u.id=a.user_id WHERE u.id IS NULL)
 OR EXISTS(SELECT 1 FROM transactions t LEFT JOIN "user" u ON u.id=t.user_id WHERE u.id IS NULL) THEN
  RAISE EXCEPTION 'Migration found financial records with missing owners';
 END IF;
END $$;
--> statement-breakpoint
INSERT INTO workspaces(owner_user_id,name,kind,currency)
SELECT u.id,'Personal','personal',COALESCE((SELECT min(currency) FROM accounts WHERE user_id=u.id),'IDR') FROM "user" u
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO workspace_memberships(workspace_id,user_id,role)
SELECT id,owner_user_id,'owner' FROM workspaces WHERE kind='personal' ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE TABLE ledger_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 code text NOT NULL, name text NOT NULL, class text NOT NULL CHECK(class IN ('asset','liability','equity','income','expense')),
 currency varchar(3) NOT NULL, archived_at timestamptz, UNIQUE(workspace_id,id), UNIQUE(workspace_id,code)
);
--> statement-breakpoint
CREATE TABLE categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 name text NOT NULL, normalized_name text NOT NULL, type text NOT NULL CHECK(type IN ('income','expense')),
 parent_id uuid, ledger_account_id uuid NOT NULL, icon text, color text, sort_order integer NOT NULL DEFAULT 0,
 archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),
 FOREIGN KEY(workspace_id,parent_id) REFERENCES categories(workspace_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(workspace_id,ledger_account_id) REFERENCES ledger_accounts(workspace_id,id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX categories_workspace_type_idx ON categories(workspace_id,type);
--> statement-breakpoint
CREATE UNIQUE INDEX categories_sibling_name_unique ON categories(workspace_id,COALESCE(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),type,normalized_name);
--> statement-breakpoint
CREATE TABLE tags (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 name text NOT NULL, normalized_name text NOT NULL, color text, archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,id), UNIQUE(workspace_id,normalized_name)
);
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN workspace_id uuid;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN kind text NOT NULL DEFAULT 'cash' CHECK(kind IN ('cash','bank','e_wallet','credit_card','savings','investment'));
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN opening_date date NOT NULL DEFAULT CURRENT_DATE;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN ledger_account_id uuid;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN version integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN archived_at timestamptz;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN deleted_at timestamptz;
--> statement-breakpoint
UPDATE accounts a SET workspace_id=w.id FROM workspaces w WHERE w.owner_user_id=a.user_id;
--> statement-breakpoint
CREATE TABLE journal_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 transaction_id uuid, effective_date date NOT NULL, reason text NOT NULL, reverses_entry_id uuid,
 operation_id uuid NOT NULL DEFAULT gen_random_uuid(), created_by text REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,id), UNIQUE(workspace_id,reverses_entry_id)
);
--> statement-breakpoint
CREATE TABLE journal_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, entry_id uuid NOT NULL,
 ledger_account_id uuid NOT NULL, debit numeric(19,4) NOT NULL DEFAULT 0 CHECK(debit>=0),
 credit numeric(19,4) NOT NULL DEFAULT 0 CHECK(credit>=0), currency varchar(3) NOT NULL,
 CHECK((debit>0 AND credit=0) OR (credit>0 AND debit=0)),
 FOREIGN KEY(workspace_id,entry_id) REFERENCES journal_entries(workspace_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(workspace_id,ledger_account_id) REFERENCES ledger_accounts(workspace_id,id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX journal_lines_balance_idx ON journal_lines(workspace_id,ledger_account_id,entry_id);
--> statement-breakpoint
INSERT INTO ledger_accounts(workspace_id,code,name,class,currency)
SELECT id,'equity:opening','Opening balance','equity',currency FROM workspaces;
--> statement-breakpoint
INSERT INTO ledger_accounts(workspace_id,code,name,class,currency)
SELECT a.workspace_id,'wallet:'||a.id::text,a.name,CASE WHEN a.kind='credit_card' THEN 'liability' ELSE 'asset' END,a.currency FROM accounts a;
--> statement-breakpoint
UPDATE accounts a SET ledger_account_id=l.id FROM ledger_accounts l
WHERE l.workspace_id=a.workspace_id AND l.code='wallet:'||a.id::text;
--> statement-breakpoint
INSERT INTO ledger_accounts(workspace_id,code,name,class,currency)
SELECT id,'category:income:uncategorized','Uncategorized income','income',currency FROM workspaces;
--> statement-breakpoint
INSERT INTO ledger_accounts(workspace_id,code,name,class,currency)
SELECT id,'category:expense:uncategorized','Uncategorized expense','expense',currency FROM workspaces;
--> statement-breakpoint
INSERT INTO categories(workspace_id,name,normalized_name,type,ledger_account_id,icon,sort_order)
SELECT w.id,'Uncategorized income','uncategorized income','income',l.id,'circle-help',999 FROM workspaces w JOIN ledger_accounts l ON l.workspace_id=w.id AND l.code='category:income:uncategorized';
--> statement-breakpoint
INSERT INTO categories(workspace_id,name,normalized_name,type,ledger_account_id,icon,sort_order)
SELECT w.id,'Uncategorized expense','uncategorized expense','expense',l.id,'circle-help',999 FROM workspaces w JOIN ledger_accounts l ON l.workspace_id=w.id AND l.code='category:expense:uncategorized';
--> statement-breakpoint
ALTER TABLE accounts ALTER COLUMN workspace_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE accounts ADD CONSTRAINT accounts_workspace_fk FOREIGN KEY(workspace_id) REFERENCES workspaces(id);
--> statement-breakpoint
ALTER TABLE accounts ADD CONSTRAINT accounts_ledger_fk FOREIGN KEY(workspace_id,ledger_account_id) REFERENCES ledger_accounts(workspace_id,id);
--> statement-breakpoint
ALTER TABLE accounts ADD CONSTRAINT accounts_workspace_id_unique UNIQUE(workspace_id,id);
--> statement-breakpoint
CREATE INDEX accounts_workspace_idx ON accounts(workspace_id);
--> statement-breakpoint
ALTER TABLE transactions ADD COLUMN workspace_id uuid;
--> statement-breakpoint
ALTER TABLE transactions ADD COLUMN destination_account_id uuid;
--> statement-breakpoint
ALTER TABLE transactions ADD COLUMN category_id uuid;
--> statement-breakpoint
ALTER TABLE transactions ADD COLUMN notes text;
--> statement-breakpoint
ALTER TABLE transactions ADD COLUMN merchant text;
--> statement-breakpoint
ALTER TABLE transactions ADD COLUMN created_by text REFERENCES "user"(id);
--> statement-breakpoint
ALTER TABLE transactions ADD COLUMN updated_by text REFERENCES "user"(id);
--> statement-breakpoint
ALTER TABLE transactions ADD COLUMN version integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE transactions ADD COLUMN deleted_at timestamptz;
--> statement-breakpoint
ALTER TABLE transactions ADD COLUMN deleted_by text REFERENCES "user"(id);
--> statement-breakpoint
ALTER TABLE transactions ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
UPDATE transactions t SET workspace_id=a.workspace_id,occurred_at=(t.occurred_at AT TIME ZONE w.timezone)::date,notes=t.description
FROM accounts a JOIN workspaces w ON w.id=a.workspace_id WHERE t.account_id=a.id;
--> statement-breakpoint
UPDATE transactions t SET category_id=c.id FROM categories c
WHERE c.workspace_id=t.workspace_id AND c.type=t.type AND c.normalized_name='uncategorized '||t.type;
--> statement-breakpoint
ALTER TABLE transactions ALTER COLUMN workspace_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE transactions ALTER COLUMN occurred_at TYPE date USING occurred_at::date;
--> statement-breakpoint
ALTER TABLE transactions ADD CONSTRAINT transactions_workspace_fk FOREIGN KEY(workspace_id) REFERENCES workspaces(id);
--> statement-breakpoint
ALTER TABLE transactions ADD CONSTRAINT transactions_account_fk FOREIGN KEY(workspace_id,account_id) REFERENCES accounts(workspace_id,id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE transactions ADD CONSTRAINT transactions_destination_fk FOREIGN KEY(workspace_id,destination_account_id) REFERENCES accounts(workspace_id,id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE transactions ADD CONSTRAINT transactions_category_fk FOREIGN KEY(workspace_id,category_id) REFERENCES categories(workspace_id,id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE transactions ADD CONSTRAINT transactions_workspace_id_unique UNIQUE(workspace_id,id);
--> statement-breakpoint
ALTER TABLE transactions ADD CONSTRAINT transactions_type_shape_check CHECK(
 (type IN ('income','expense') AND category_id IS NOT NULL AND destination_account_id IS NULL) OR
 (type='transfer' AND category_id IS NULL AND destination_account_id IS NOT NULL AND destination_account_id<>account_id));
--> statement-breakpoint
ALTER TABLE transactions ADD CONSTRAINT transactions_amount_check CHECK(amount>0 AND amount::text !~ '\.[0-9]{5,}$');
--> statement-breakpoint
CREATE INDEX transactions_workspace_date_idx ON transactions(workspace_id,occurred_at DESC,id DESC) WHERE deleted_at IS NULL;
--> statement-breakpoint
CREATE TABLE transaction_tags (
 workspace_id uuid NOT NULL, transaction_id uuid NOT NULL, tag_id uuid NOT NULL,
 PRIMARY KEY(workspace_id,transaction_id,tag_id),
 FOREIGN KEY(workspace_id,transaction_id) REFERENCES transactions(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,tag_id) REFERENCES tags(workspace_id,id) ON DELETE RESTRICT);
--> statement-breakpoint
CREATE TABLE audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 actor_user_id text REFERENCES "user"(id), entity_type text NOT NULL, entity_id uuid NOT NULL,
 action text NOT NULL, before jsonb, after jsonb, operation_id uuid NOT NULL DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE INDEX audit_logs_entity_idx ON audit_logs(workspace_id,entity_type,entity_id,created_at);
--> statement-breakpoint
CREATE TABLE idempotency_keys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 actor_key text NOT NULL, operation text NOT NULL, key text NOT NULL, request_hash text NOT NULL,
 response_body jsonb, resource_id uuid, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 UNIQUE(workspace_id,actor_key,operation,key));
--> statement-breakpoint
CREATE TABLE recurring_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 name text NOT NULL, type text NOT NULL CHECK(type IN ('income','expense','transfer')),
 account_id uuid NOT NULL, destination_account_id uuid, category_id uuid,
 amount numeric(19,4) NOT NULL CHECK(amount>0), currency varchar(3) NOT NULL,
 notes text, frequency text NOT NULL CHECK(frequency IN ('day','week','month','year')),
 interval integer NOT NULL CHECK(interval>0), anchor_date date NOT NULL, timezone text NOT NULL,
 end_date date, next_due_date date NOT NULL, mode text NOT NULL DEFAULT 'manual' CHECK(mode IN ('manual','auto')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','archived')), version integer NOT NULL DEFAULT 1,
 created_by text REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,account_id) REFERENCES accounts(workspace_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(workspace_id,destination_account_id) REFERENCES accounts(workspace_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(workspace_id,category_id) REFERENCES categories(workspace_id,id) ON DELETE RESTRICT,
 CHECK((type IN ('income','expense') AND category_id IS NOT NULL AND destination_account_id IS NULL) OR
       (type='transfer' AND category_id IS NULL AND destination_account_id IS NOT NULL AND destination_account_id<>account_id)));
--> statement-breakpoint
CREATE INDEX recurring_rules_due_idx ON recurring_rules(status,next_due_date);
--> statement-breakpoint
CREATE TABLE recurring_occurrences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 rule_id uuid NOT NULL REFERENCES recurring_rules(id) ON DELETE RESTRICT, scheduled_date date NOT NULL,
 rule_version integer NOT NULL, template_snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','posted','skipped','failed')),
 transaction_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id), UNIQUE(workspace_id,rule_id,scheduled_date),
 FOREIGN KEY(workspace_id,transaction_id) REFERENCES transactions(workspace_id,id) ON DELETE RESTRICT);
--> statement-breakpoint
CREATE INDEX recurring_occurrences_due_idx ON recurring_occurrences(workspace_id,status,scheduled_date);
--> statement-breakpoint
CREATE TABLE attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 transaction_id uuid NOT NULL, object_key text NOT NULL UNIQUE, original_name text NOT NULL,
 mime_type text NOT NULL, size_bytes bigint NOT NULL CHECK(size_bytes>0 AND size_bytes<=10485760),
 checksum text NOT NULL, status text NOT NULL CHECK(status IN ('pending','ready','rejected')),
 uploaded_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
 FOREIGN KEY(workspace_id,transaction_id) REFERENCES transactions(workspace_id,id) ON DELETE RESTRICT);
--> statement-breakpoint
CREATE INDEX attachments_transaction_idx ON attachments(workspace_id,transaction_id,status) WHERE deleted_at IS NULL;
--> statement-breakpoint
INSERT INTO journal_entries(workspace_id,transaction_id,effective_date,reason,created_by)
SELECT workspace_id,id,occurred_at,'legacy',created_by FROM transactions;
--> statement-breakpoint
INSERT INTO journal_lines(workspace_id,entry_id,ledger_account_id,debit,credit,currency)
SELECT t.workspace_id,j.id,a.ledger_account_id,
 CASE WHEN t.type='income' THEN t.amount ELSE 0 END,CASE WHEN t.type='expense' THEN t.amount ELSE 0 END,t.currency
FROM transactions t JOIN journal_entries j ON j.transaction_id=t.id JOIN accounts a ON a.id=t.account_id;
--> statement-breakpoint
INSERT INTO journal_lines(workspace_id,entry_id,ledger_account_id,debit,credit,currency)
SELECT t.workspace_id,j.id,c.ledger_account_id,
 CASE WHEN t.type='expense' THEN t.amount ELSE 0 END,CASE WHEN t.type='income' THEN t.amount ELSE 0 END,t.currency
FROM transactions t JOIN journal_entries j ON j.transaction_id=t.id JOIN categories c ON c.id=t.category_id;
--> statement-breakpoint
INSERT INTO journal_entries(workspace_id,effective_date,reason)
SELECT workspace_id,opening_date,'opening' FROM accounts WHERE opening_balance<>0;
--> statement-breakpoint
INSERT INTO journal_lines(workspace_id,entry_id,ledger_account_id,debit,credit,currency)
SELECT a.workspace_id,j.id,a.ledger_account_id,GREATEST(a.opening_balance,0),GREATEST(-a.opening_balance,0),a.currency
FROM accounts a JOIN journal_entries j ON j.workspace_id=a.workspace_id AND j.reason='opening';
--> statement-breakpoint
INSERT INTO journal_lines(workspace_id,entry_id,ledger_account_id,debit,credit,currency)
SELECT a.workspace_id,j.id,e.id,GREATEST(-a.opening_balance,0),GREATEST(a.opening_balance,0),a.currency
FROM accounts a JOIN journal_entries j ON j.workspace_id=a.workspace_id AND j.reason='opening'
JOIN ledger_accounts e ON e.workspace_id=a.workspace_id AND e.code='equity:opening';
--> statement-breakpoint
DROP INDEX accounts_user_id_idx;
--> statement-breakpoint
DROP INDEX transactions_user_date_idx;
--> statement-breakpoint
ALTER TABLE transactions DROP CONSTRAINT transactions_account_id_accounts_id_fk;
--> statement-breakpoint
ALTER TABLE transactions DROP COLUMN user_id;
--> statement-breakpoint
ALTER TABLE transactions DROP COLUMN description;
--> statement-breakpoint
ALTER TABLE accounts DROP COLUMN user_id;
--> statement-breakpoint
ALTER TABLE accounts ALTER COLUMN currency SET DEFAULT 'IDR';
--> statement-breakpoint
ALTER TABLE transactions ALTER COLUMN currency SET DEFAULT 'IDR';
--> statement-breakpoint
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['workspace_memberships','accounts','ledger_accounts','categories','tags','transactions','transaction_tags','journal_entries','journal_lines','audit_logs','idempotency_keys','recurring_rules','recurring_occurrences','attachments'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
 END LOOP;
 ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
 ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
END $$;
--> statement-breakpoint
CREATE POLICY workspace_select ON workspaces FOR SELECT USING(owner_user_id=nullif(current_setting('app.user_id',true),'') OR EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=id AND m.user_id=nullif(current_setting('app.user_id',true),'')));
--> statement-breakpoint
CREATE POLICY workspace_insert ON workspaces FOR INSERT WITH CHECK(owner_user_id=nullif(current_setting('app.user_id',true),''));
--> statement-breakpoint
CREATE POLICY membership_select ON workspace_memberships FOR SELECT USING(user_id=nullif(current_setting('app.user_id',true),''));
--> statement-breakpoint
CREATE POLICY membership_insert ON workspace_memberships FOR INSERT WITH CHECK(user_id=nullif(current_setting('app.user_id',true),'') AND EXISTS(SELECT 1 FROM workspaces w WHERE w.id=workspace_id AND w.owner_user_id=user_id));
--> statement-breakpoint
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['accounts','ledger_accounts','categories','tags','transactions','transaction_tags','journal_entries','journal_lines','audit_logs','idempotency_keys','recurring_rules','recurring_occurrences','attachments'] LOOP
  EXECUTE format('CREATE POLICY tenant_scope ON %I USING (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),''''))) WITH CHECK (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''')))',tab);
 END LOOP;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_journal_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; dc numeric(30,4); cc numeric(30,4); n integer;
BEGIN
 target=COALESCE(NEW.entry_id,OLD.entry_id);
 SELECT count(*),COALESCE(sum(debit),0),COALESCE(sum(credit),0) INTO n,dc,cc FROM journal_lines WHERE entry_id=target;
 IF n<2 OR dc<>cc THEN RAISE EXCEPTION 'journal entry must have two or more balanced lines'; END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journal_balanced AFTER INSERT OR UPDATE OR DELETE ON journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_journal_balanced();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_journal_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'journal history is immutable'; END $$;
--> statement-breakpoint
CREATE TRIGGER journal_entries_immutable BEFORE UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION reject_journal_mutation();
--> statement-breakpoint
CREATE TRIGGER journal_lines_immutable BEFORE UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION reject_journal_mutation();
