/** Normalized, database-independent inputs and outputs for the assistant MVP. */
export type AssistantSourcePermission =
  | 'history'
  | 'recurring'
  | 'bills'
  | 'invoices'
  | 'budgets'
  | 'goals'
  | 'merchant'
  | 'notes';

export type ForecastScenario = 'base' | 'conservative';
export type ForecastEventKind =
  | 'transaction'
  | 'bill'
  | 'recurring'
  | 'invoice'
  | 'estimate'
  | 'transfer';

export type AssistantForecastQualityFlag =
  | 'history_source_excluded'
  | 'recurring_source_excluded'
  | 'bills_source_excluded'
  | 'invoices_source_excluded'
  | 'other_currency_accounts_excluded'
  | 'bill_currency_mismatch'
  | 'invoice_currency_mismatch'
  | 'unassigned_bill_account'
  | 'unassigned_invoice_account'
  | 'unassigned_forecast_account'
  | 'legacy_paid_bill_without_transaction'
  | 'unresolved_source_overlap'
  | 'transfer_scope_boundary'
  | `insufficient_history:${string}`;

export type AssistantEvidence = {
  sourceId: string;
  date?: string;
  kind: ForecastEventKind | 'savings_goal';
  amount?: string;
  currency?: string;
  [fact: string]: string | undefined;
};

export type ForecastAccount = {
  id: string;
  name: string;
  balance: string;
  currency: string;
  protectedAmount?: string;
  lowBalanceThreshold?: string;
  dailyExpenseAverage?: string;
  dailyIncomeAverage?: string;
};

export type ForecastEvent = {
  id: string;
  date: string;
  accountId?: string | null;
  amount: string;
  kind: ForecastEventKind;
  description: string;
  sourceId?: string;
};

export type ForecastDay = {
  date: string;
  accountId: string | null;
  openingBalance: string;
  inflows: string;
  outflows: string;
  closingBalance: string;
  minimumBalance: string;
  protectedAmount: string;
  headroom: string;
  scenario: ForecastScenario;
};

export type ForecastSourceSnapshot = {
  workspaceId: string;
  actorId: string;
  asOfDate: string;
  currency: string;
  accounts: ForecastAccount[];
  events: ForecastEvent[];
  sourcePermissions: Partial<Record<AssistantSourcePermission, boolean>>;
  inputHash: string;
};

export type AssistantActionProposalPayload =
  | {
      action: 'send_invoice_reminder';
      invoiceId: string;
      invoiceNumber: string;
      recipient: string;
      outstanding: string;
      currency: string;
      message: string;
      locale: 'en' | 'id';
    }
  | {
      action: 'contribute_to_goal';
      goalId: string;
      amount: string;
      currency: string;
    }
  | {
      action: 'review_payment_date';
      occurrenceId: string;
      dueOn: string;
      proposedDate: string;
      amount: string;
      currency: string;
    };
