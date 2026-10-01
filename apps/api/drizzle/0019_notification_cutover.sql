-- Preserve legacy notices and preferences; remember the rollout boundary for existing recipients.
INSERT INTO finance_notification_evaluation_state(workspace_id,user_id,rule_key,scope_key,period_key,state,dirty_version,processed_version)
SELECT id,owner_user_id,'rollout','workspace','notifications-mvp',jsonb_build_object('cutoverAt',now()),1,1
FROM workspaces ON CONFLICT(workspace_id,user_id,rule_key,scope_key,period_key) DO NOTHING;
--> statement-breakpoint
ALTER TABLE finance_notifications DROP CONSTRAINT finance_notifications_workspace_id_fkey;
ALTER TABLE finance_notifications ADD CONSTRAINT finance_notifications_workspace_id_fkey FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE finance_notification_preferences DROP CONSTRAINT finance_notification_preferences_workspace_id_fkey;
ALTER TABLE finance_notification_preferences ADD CONSTRAINT finance_notification_preferences_workspace_id_fkey FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE push_subscriptions DROP CONSTRAINT push_subscriptions_workspace_id_fkey;
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_workspace_id_fkey FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
--> statement-breakpoint
-- Adopt legacy bill stage identities in place, keeping notification IDs and read/send timestamps.
UPDATE finance_notifications n SET dedupe_key='bill:'||o.id::text||':'||o.due_on::text||':due-in:'||split_part(n.dedupe_key,':',4),source_type='bill_occurrence'
FROM bill_occurrences o
WHERE o.workspace_id=n.workspace_id AND o.id=n.source_id AND n.kind='bill-reminder'
 AND n.dedupe_key ~ '^bill:[0-9a-f-]+:due-in:[0-9]+$'
 AND NOT EXISTS(SELECT 1 FROM finance_notifications existing WHERE existing.workspace_id=n.workspace_id AND existing.user_id=n.user_id AND existing.dedupe_key='bill:'||o.id::text||':'||o.due_on::text||':due-in:'||split_part(n.dedupe_key,':',4));
