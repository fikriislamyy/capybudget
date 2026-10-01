ALTER TABLE security_devices ADD COLUMN token_digest text UNIQUE;
ALTER TABLE push_subscriptions ADD COLUMN security_device_id uuid REFERENCES security_devices(id) ON DELETE CASCADE;
CREATE TABLE user_security_settings(user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,privacy_default boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE backup_runs(id uuid PRIMARY KEY,object_key text NOT NULL,checksum text NOT NULL,key_id text NOT NULL,status text NOT NULL,byte_count bigint NOT NULL,duration_ms integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE backup_restore_checks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),backup_id uuid NOT NULL,outcome text NOT NULL,duration_ms integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION mark_assistant_forecasts_dirty() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE target_workspace uuid; target_user text;
BEGIN
 target_workspace := CASE WHEN TG_OP='DELETE' THEN OLD.workspace_id ELSE NEW.workspace_id END;
 target_user := nullif(current_setting('app.user_id',true),'');
 IF target_user IS NOT NULL AND EXISTS(SELECT 1 FROM public."user" WHERE id=target_user AND account_status='active') THEN
  UPDATE public.assistant_refresh_state SET checked_at='epoch'::timestamptz WHERE workspace_id=target_workspace AND user_id=target_user;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
