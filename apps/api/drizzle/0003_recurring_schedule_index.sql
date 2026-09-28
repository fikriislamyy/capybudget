ALTER TABLE recurring_rules ADD COLUMN next_occurrence_index integer NOT NULL DEFAULT 0 CHECK(next_occurrence_index >= 0);
