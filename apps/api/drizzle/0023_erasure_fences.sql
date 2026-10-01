-- A removed entry has no balance to validate. Its deletion is still protected
-- by the immutable-history trigger and requires a quarantined erasure lease.
CREATE OR REPLACE FUNCTION assert_journal_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; dc numeric(30,4); cc numeric(30,4); n integer;
BEGIN
 target=COALESCE(NEW.entry_id,OLD.entry_id);
 IF NOT EXISTS(SELECT 1 FROM journal_entries WHERE id=target) THEN RETURN NULL; END IF;
 SELECT count(*),COALESCE(sum(debit),0),COALESCE(sum(credit),0) INTO n,dc,cc FROM journal_lines WHERE entry_id=target;
 IF n<2 OR dc<>cc THEN RAISE EXCEPTION 'journal entry must have two or more balanced lines'; END IF;
 RETURN NULL;
END $$;
-- Serialize creation and financial writes with the account quarantine transaction.
CREATE OR REPLACE FUNCTION capybudget_active_workspace_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_status text;
BEGIN
 SELECT u.account_status INTO owner_status FROM workspaces w JOIN "user" u ON u.id=w.owner_user_id WHERE w.id=NEW.workspace_id FOR SHARE OF u;
 IF owner_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Workspace is unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION capybudget_active_owner_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_status text;
BEGIN
 SELECT account_status INTO owner_status FROM "user" WHERE id=NEW.owner_user_id FOR SHARE;
 IF owner_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Owner is unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER active_owner_write BEFORE INSERT OR UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION capybudget_active_owner_write();
CREATE POLICY workspace_owner_delete ON workspaces FOR DELETE USING(owner_user_id=nullif(current_setting('app.user_id',true),''));
CREATE POLICY membership_owner_delete ON workspace_memberships FOR DELETE USING(user_id=nullif(current_setting('app.user_id',true),''));
-- Reveal only a count to the owner; membership RLS otherwise hides other users.
CREATE FUNCTION capybudget_other_members(target uuid) RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT count(*) FROM public.workspace_memberships m WHERE m.workspace_id=target
 AND m.user_id<>nullif(current_setting('app.user_id',true),'')
 AND EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=target AND w.owner_user_id=nullif(current_setting('app.user_id',true),''));
$$;
