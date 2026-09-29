ALTER TABLE finance_notifications ADD COLUMN resolved_at timestamptz;
--> statement-breakpoint
ALTER TABLE finance_notifications ADD COLUMN assistant_suggestion_id uuid;
--> statement-breakpoint
CREATE INDEX finance_notifications_active_idx ON finance_notifications(workspace_id,user_id,resolved_at,created_at DESC);
--> statement-breakpoint
ALTER TABLE invoice_deliveries ALTER COLUMN document_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE invoice_deliveries ADD COLUMN purpose text NOT NULL DEFAULT 'invoice' CHECK(purpose IN ('invoice','reminder'));
--> statement-breakpoint
ALTER TABLE invoice_deliveries ADD COLUMN reminder_message_snapshot text CHECK(reminder_message_snapshot IS NULL OR length(reminder_message_snapshot)<=1000);
--> statement-breakpoint
ALTER TABLE invoice_deliveries ADD CONSTRAINT invoice_reminder_document_check CHECK((purpose='invoice' AND document_id IS NOT NULL AND reminder_message_snapshot IS NULL) OR (purpose='reminder' AND document_id IS NULL AND reminder_message_snapshot IS NOT NULL));
--> statement-breakpoint
CREATE INDEX invoice_deliveries_purpose_idx ON invoice_deliveries(workspace_id,purpose,state,next_attempt_at);
