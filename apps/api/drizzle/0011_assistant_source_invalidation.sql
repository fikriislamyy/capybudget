CREATE FUNCTION mark_assistant_forecasts_dirty() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE target_workspace uuid; target_user text;
BEGIN
 target_workspace := CASE WHEN TG_OP='DELETE' THEN OLD.workspace_id ELSE NEW.workspace_id END;
 target_user := nullif(current_setting('app.user_id',true),'');
 IF target_user IS NOT NULL THEN
  UPDATE public.assistant_refresh_state SET checked_at='epoch'::timestamptz
   WHERE workspace_id=target_workspace AND user_id=target_user;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER assistant_dirty_accounts AFTER INSERT OR UPDATE OR DELETE ON accounts FOR EACH ROW EXECUTE FUNCTION mark_assistant_forecasts_dirty();
--> statement-breakpoint
CREATE TRIGGER assistant_dirty_transactions AFTER INSERT OR UPDATE OR DELETE ON transactions FOR EACH ROW EXECUTE FUNCTION mark_assistant_forecasts_dirty();
--> statement-breakpoint
CREATE TRIGGER assistant_dirty_journal_entries AFTER INSERT OR UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION mark_assistant_forecasts_dirty();
--> statement-breakpoint
CREATE TRIGGER assistant_dirty_journal_lines AFTER INSERT OR UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION mark_assistant_forecasts_dirty();
--> statement-breakpoint
CREATE TRIGGER assistant_dirty_recurring_rules AFTER INSERT OR UPDATE OR DELETE ON recurring_rules FOR EACH ROW EXECUTE FUNCTION mark_assistant_forecasts_dirty();
--> statement-breakpoint
CREATE TRIGGER assistant_dirty_recurring_occurrences AFTER INSERT OR UPDATE OR DELETE ON recurring_occurrences FOR EACH ROW EXECUTE FUNCTION mark_assistant_forecasts_dirty();
--> statement-breakpoint
CREATE TRIGGER assistant_dirty_bills AFTER INSERT OR UPDATE OR DELETE ON bills FOR EACH ROW EXECUTE FUNCTION mark_assistant_forecasts_dirty();
--> statement-breakpoint
CREATE TRIGGER assistant_dirty_bill_occurrences AFTER INSERT OR UPDATE OR DELETE ON bill_occurrences FOR EACH ROW EXECUTE FUNCTION mark_assistant_forecasts_dirty();
--> statement-breakpoint
CREATE TRIGGER assistant_dirty_invoices AFTER INSERT OR UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION mark_assistant_forecasts_dirty();
--> statement-breakpoint
CREATE TRIGGER assistant_dirty_invoice_payments AFTER INSERT OR UPDATE OR DELETE ON invoice_payments FOR EACH ROW EXECUTE FUNCTION mark_assistant_forecasts_dirty();
--> statement-breakpoint
CREATE TRIGGER assistant_dirty_savings_goals AFTER INSERT OR UPDATE OR DELETE ON savings_goals FOR EACH ROW EXECUTE FUNCTION mark_assistant_forecasts_dirty();
--> statement-breakpoint
CREATE TRIGGER assistant_dirty_goal_contributions AFTER INSERT OR UPDATE OR DELETE ON goal_contributions FOR EACH ROW EXECUTE FUNCTION mark_assistant_forecasts_dirty();
--> statement-breakpoint
CREATE TRIGGER assistant_dirty_account_settings AFTER INSERT OR UPDATE OR DELETE ON assistant_account_settings FOR EACH ROW EXECUTE FUNCTION mark_assistant_forecasts_dirty();
--> statement-breakpoint
CREATE TRIGGER assistant_dirty_settings AFTER INSERT OR UPDATE OR DELETE ON assistant_settings FOR EACH ROW EXECUTE FUNCTION mark_assistant_forecasts_dirty();
--> statement-breakpoint
CREATE TRIGGER assistant_dirty_history_overrides AFTER INSERT OR UPDATE OR DELETE ON forecast_transaction_overrides FOR EACH ROW EXECUTE FUNCTION mark_assistant_forecasts_dirty();
