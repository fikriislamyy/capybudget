ALTER TABLE assistant_settings ADD COLUMN external_ai_provider text CHECK (external_ai_provider IN ('groq', 'muse'));
--> statement-breakpoint
-- Existing consent named the previous provider; obtain fresh consent before sending data.
UPDATE assistant_settings SET external_ai_enabled=false, voice_ai_enabled=false, consent_version=consent_version+1, version=version+1, updated_at=now() WHERE external_ai_enabled OR voice_ai_enabled;
