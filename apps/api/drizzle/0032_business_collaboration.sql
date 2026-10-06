ALTER TABLE workspace_memberships DROP CONSTRAINT workspace_memberships_role_check;
ALTER TABLE workspace_memberships ADD CONSTRAINT workspace_memberships_role_check CHECK(role IN ('owner','accountant','staff','viewer'));
CREATE FUNCTION capybudget_workspace_role(target uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT m.role FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id
 WHERE m.workspace_id=target AND m.user_id=nullif(current_setting('app.user_id',true),'') AND w.archived_at IS NULL
$$;
CREATE POLICY membership_owner_read ON workspace_memberships FOR SELECT USING(capybudget_workspace_role(workspace_id)='owner');
CREATE POLICY membership_owner_manage ON workspace_memberships FOR ALL USING(capybudget_workspace_role(workspace_id)='owner') WITH CHECK(capybudget_workspace_role(workspace_id)='owner');
DROP POLICY workspace_owner_update ON workspaces;
CREATE POLICY workspace_owner_update ON workspaces FOR UPDATE USING(capybudget_workspace_role(id)='owner') WITH CHECK(capybudget_workspace_role(id)='owner');
CREATE TABLE business_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),
 email_hash text NOT NULL,email_snapshot text NOT NULL,role text NOT NULL CHECK(role IN ('accountant','staff','viewer')),
 token_hash text NOT NULL UNIQUE,expires_at timestamptz NOT NULL,created_by text REFERENCES "user"(id),
 accepted_by text REFERENCES "user"(id),accepted_at timestamptz,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX business_invitations_pending_email ON business_invitations(workspace_id,email_hash) WHERE accepted_at IS NULL AND revoked_at IS NULL;
ALTER TABLE business_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitation_owner ON business_invitations USING(workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND capybudget_workspace_role(workspace_id)='owner') WITH CHECK(workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND capybudget_workspace_role(workspace_id)='owner');
CREATE TRIGGER active_workspace_write BEFORE INSERT OR UPDATE ON business_invitations FOR EACH ROW EXECUTE FUNCTION capybudget_active_workspace_write();
CREATE FUNCTION capybudget_accept_business_invite(digest text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE invite business_invitations; subject "user"; result uuid;
BEGIN
 SELECT * INTO subject FROM "user" WHERE id=nullif(current_setting('app.user_id',true),'') AND email_verified AND account_status='active';
 IF subject.id IS NULL THEN RAISE EXCEPTION 'Verified account required' USING ERRCODE='42501'; END IF;
 SELECT workspace_id INTO result FROM business_invitations WHERE token_hash=digest;
 IF result IS NULL THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
 PERFORM id FROM workspaces WHERE id=result AND kind='business' AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO invite FROM business_invitations WHERE token_hash=digest FOR UPDATE;
 IF invite.email_hash<>encode(sha256(convert_to(lower(trim(subject.email)),'UTF8')),'hex') OR invite.revoked_at IS NOT NULL
 OR (invite.accepted_at IS NULL AND invite.expires_at<=now()) OR (invite.accepted_by IS NOT NULL AND invite.accepted_by<>subject.id) THEN
 RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
 IF invite.accepted_at IS NULL THEN
 INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES(invite.workspace_id,subject.id,invite.role) ON CONFLICT DO NOTHING;
 UPDATE business_invitations SET accepted_by=subject.id,accepted_at=now() WHERE id=invite.id;
 END IF;
 RETURN invite.workspace_id;
END $$;
CREATE FUNCTION capybudget_keep_business_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ws uuid; BEGIN
 ws=OLD.workspace_id;
 IF OLD.role='owner' AND (TG_OP='DELETE' OR NEW.role<>'owner') THEN
 PERFORM id FROM workspaces WHERE id=ws FOR UPDATE;
 IF EXISTS(SELECT 1 FROM workspaces w JOIN "user" u ON u.id=w.owner_user_id WHERE w.id=ws AND w.kind='business' AND u.account_status='active')
 AND NOT EXISTS(SELECT 1 FROM workspace_memberships WHERE workspace_id=ws AND user_id<>OLD.user_id AND role='owner') THEN
 RAISE EXCEPTION 'The business must keep an owner' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER keep_business_owner BEFORE UPDATE OR DELETE ON workspace_memberships FOR EACH ROW EXECUTE FUNCTION capybudget_keep_business_owner();
CREATE INDEX audit_logs_business_browse ON audit_logs(workspace_id,created_at DESC,id);
