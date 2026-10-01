CREATE TABLE privacy_exports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_key text NOT NULL,status text NOT NULL DEFAULT 'queued',security_version integer NOT NULL,
 object_key text,checksum text,byte_count bigint,attempts integer NOT NULL DEFAULT 0,lease_until timestamptz,
 failure_code text,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',UNIQUE(user_id,request_key));
CREATE TABLE account_deletion_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text REFERENCES "user"(id) ON DELETE SET NULL,subject_id text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'quarantined',receipt_digest text NOT NULL,manifest jsonb NOT NULL,workspace_ids jsonb NOT NULL,
 attempts integer NOT NULL DEFAULT 0,lease_until timestamptz,failure_code text,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz);
CREATE TABLE privacy_cleanup_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL REFERENCES account_deletion_requests(id) ON DELETE CASCADE,
 object_key text NOT NULL,status text NOT NULL DEFAULT 'pending',attempts integer NOT NULL DEFAULT 0,UNIQUE(request_id,object_key));
CREATE TABLE deletion_tombstones(subject_id text PRIMARY KEY,workspace_ids jsonb NOT NULL,generation integer NOT NULL,deleted_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '35 days');
CREATE INDEX privacy_exports_work_idx ON privacy_exports(status,lease_until,expires_at);
CREATE INDEX account_deletion_work_idx ON account_deletion_requests(status,lease_until);
-- Every workspace write, including a worker which started before erasure, honors quarantine.
CREATE FUNCTION capybudget_active_workspace_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_status text;
BEGIN
 SELECT u.account_status INTO owner_status FROM workspaces w JOIN "user" u ON u.id=w.owner_user_id WHERE w.id=NEW.workspace_id;
 IF owner_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Workspace is unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='workspace_id' LOOP
  EXECUTE format('CREATE TRIGGER active_workspace_write BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION capybudget_active_workspace_write()',t.table_name);
 END LOOP;
END $$;
-- Journal deletion is allowed only for an already quarantined owner under its erasure lease.
CREATE OR REPLACE FUNCTION reject_journal_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND EXISTS (
  SELECT 1 FROM account_deletion_requests d JOIN workspaces w ON w.owner_user_id=d.subject_id
  JOIN "user" u ON u.id=d.subject_id WHERE w.id=OLD.workspace_id AND u.account_status='deletion_pending'
  AND d.status='deleting' AND d.lease_until>now()
 ) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'journal history is immutable';
END $$;
