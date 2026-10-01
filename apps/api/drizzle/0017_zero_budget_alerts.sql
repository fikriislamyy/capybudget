ALTER TABLE budgets DROP CONSTRAINT budgets_amount_check;
ALTER TABLE budgets ADD CONSTRAINT budgets_amount_check CHECK(amount>=0);
