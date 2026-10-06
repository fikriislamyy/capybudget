ALTER TABLE business_invitations
 ADD COLUMN token_snapshot text,
 ADD COLUMN email_locale text NOT NULL DEFAULT 'en' CHECK(email_locale IN ('en','id')),
 ADD COLUMN email_state text NOT NULL DEFAULT 'not_requested' CHECK(email_state IN ('not_requested','pending','queued','sending','accepted','failed','uncertain')),
 ADD COLUMN email_attempts integer NOT NULL DEFAULT 0,
 ADD COLUMN email_lease_until timestamptz,
 ADD COLUMN email_next_attempt_at timestamptz NOT NULL DEFAULT now();

-- Only a high-entropy invitation digest can resolve the invite before membership exists.
CREATE FUNCTION capybudget_resolve_business_invite(invite_digest text)
RETURNS TABLE(id uuid,workspace_id uuid,email_snapshot text,role text,expires_at timestamptz,accepted_by text,business_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT i.id,i.workspace_id,i.email_snapshot,i.role,i.expires_at,i.accepted_by,w.name
 FROM business_invitations i JOIN workspaces w ON w.id=i.workspace_id
 JOIN "user" owner ON owner.id=w.owner_user_id AND owner.account_status='active'
 WHERE i.token_hash=invite_digest AND i.revoked_at IS NULL AND i.expires_at>now()
 AND w.kind='business' AND w.archived_at IS NULL AND length(invite_digest)=64
$$;
