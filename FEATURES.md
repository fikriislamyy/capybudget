# CapyBudget: Recommended Features

> Personal and business financial tracker with an AI assistant for cashflow management.

**Priority legend**
- **MVP**: needed for launch
- **V2**: after launch
- **Advanced**: differentiators and later-stage features

Related docs: `prd.md` (requirements), `design.md` (brand and visual system)

---

## Table of Contents

1. [Core Tracking](#1-core-tracking-shared-by-personal-and-business)
2. [Personal Finance](#2-personal-finance)
3. [Business Finance](#3-business-finance)
4. [AI Assistant](#4-ai-assistant-key-differentiator)
5. [Reports and Analytics](#5-reports-and-analytics)
6. [Notifications and Reminders](#6-notifications-and-reminders)
7. [Security and Privacy](#7-security-and-privacy)
8. [User Experience](#8-user-experience)
9. [Integrations and Platform](#9-integrations-and-platform)
10. [Monetization](#10-monetization)
11. [Suggested Build Order](#11-suggested-build-order)

---

## 1. Core Tracking (shared by personal and business)

| Feature | Priority |
|---|---|
| **Income and expense logging** with amount, category, date, notes, and attachments | MVP |
| **Multiple accounts and wallets**: cash, bank, e-wallet, credit card, investments | MVP |
| **Transfers between accounts** without counting them as income or expense | MVP |
| **Custom categories, subcategories, and tags** | MVP |
| **Recurring transactions** such as salary, rent, subscriptions, and loan payments | MVP |
| **Search, filter, and sort** by date, category, amount, or tag | MVP |
| **Multi-currency support** with automatic exchange rates | V2 |
| **Split transactions** across categories | V2 |
| **Bulk edit and delete** | V2 |
| **Receipt capture**: photo, OCR scan, and auto-fill of merchant, date, and total | V2 |
| **Bank, e-wallet, and card sync** via aggregator APIs, plus CSV/Excel/PDF statement import | V2 |
| **SMS and email parsing** for automatic transaction capture | Advanced |

---

## 2. Personal Finance

| Feature | Priority |
|---|---|
| **Budgets** per category, weekly or monthly, with progress bars | MVP |
| **Savings goals** such as emergency fund, vacation, or gadget, with target date and progress | MVP |
| **Bill reminders** and due-date alerts | MVP |
| **Budget methods**: 50/30/20, zero-based, envelope | V2 |
| **Debt and loan tracker** with payoff schedules, plus snowball and avalanche strategies | V2 |
| **Subscription tracker** that detects recurring charges and flags forgotten ones | V2 |
| **Net worth tracker** covering assets minus liabilities over time | V2 |
| **Shared or household mode** for couples and families, with shared budgets and private accounts | V2 |
| **Investment tracking** for stocks, mutual funds, crypto, and gold, with P&L | Advanced |
| **Zakat, tax, and insurance reminders** | Advanced |

---

## 3. Business Finance

| Feature | Priority |
|---|---|
| **Business profile and multiple businesses** under one account | MVP |
| **Separation of personal and business finances** with easy switching | MVP |
| **Invoicing**: create, send, and track (draft, sent, paid, overdue) with PDF export | MVP |
| **Recurring invoices**, payment links, and QR payments | V2 |
| **Accounts receivable and payable** with aging reports | V2 |
| **Customer and vendor management** | V2 |
| **Product and service catalog** with pricing | V2 |
| **Tax management**: VAT/sales tax calculation, tax reports, and reminders | V2 |
| **Project or client profitability tracking** | V2 |
| **Multi-user roles and permissions**: owner, accountant, staff, viewer | V2 |
| **Accountant access** and audit trail | V2 |
| **Basic inventory and COGS tracking** | Advanced |
| **Expense claims and reimbursements** for employees | Advanced |
| **Payroll tracking** and employee cost management | Advanced |
| **Fixed asset and depreciation tracker** | Advanced |
| **Quotes and purchase orders** | Advanced |

---

## 4. AI Assistant (key differentiator)

### 4.1 Cashflow Management

| Feature | Priority |
|---|---|
| **Cashflow forecasting** for 30, 60, and 90 days from history, recurring items, and unpaid invoices | MVP |
| **Low-balance and shortfall warnings** before they happen | MVP |
| **Safe-to-spend calculator** showing what you can spend today without missing bills | MVP |
| **Personalized action suggestions**, e.g. "Delay this payment by 5 days," "Send a reminder for Invoice #21," "Move Rp X to savings" | MVP |
| **What-if scenarios**: "What if I buy a laptop?" or "What if a client pays 2 weeks late?" | V2 |
| **Runway and burn rate** calculation for businesses | V2 |
| **Payment prioritization** when cash is tight | V2 |

### 4.2 Insights and Detection

| Feature | Priority |
|---|---|
| **Auto-categorization** that learns from your corrections | MVP |
| **Spending pattern analysis** and month-over-month comparisons | V2 |
| **Anomaly and duplicate detection** for unusual charges, double payments, and possible fraud | V2 |
| **Late-paying customer detection** with risk scoring | V2 |
| **Cost-cutting suggestions** based on subscriptions and overspending | V2 |
| **Savings opportunities** (e.g., idle cash, cheaper alternatives) | V2 |
| **Seasonality detection**, especially for businesses | Advanced |

### 4.3 Conversational Features

| Feature | Priority |
|---|---|
| **Chat interface**: "How much did I spend on food last month?" "Who owes me money?" | V2 |
| **Natural-language transaction entry** | V2 |
| **Voice input**: "Add lunch 45k" | V2 |
| **Automated weekly or monthly summaries** in plain language | V2 |
| **Goal coaching**: "To reach your goal by December, save X per week" | V2 |
| **Proactive nudges** (daily/weekly), with adjustable frequency | V2 |
| **Financial health score** for individuals and businesses | Advanced |

### 4.4 AI Trust and Safety

- Explain **why** each suggestion is made
- Clear disclaimer that suggestions are not professional financial advice
- User control over which data the AI can access
- Human-confirmed actions: the AI should never move money without approval

---

## 5. Reports and Analytics

| Feature | Priority |
|---|---|
| **Dashboard** with balance, income vs expense, upcoming bills, and goals | MVP |
| **Charts**: pie, bar, line, and trend charts | MVP |
| **Cashflow statement** | MVP |
| **Budget vs actual** reports | MVP |
| **Export to PDF, Excel, and CSV** | MVP |
| **Profit and loss** and **balance sheet** for business | V2 |
| **Custom report builder** and date ranges | V2 |
| **Scheduled reports** by email | V2 |
| **Tax-ready reports** | V2 |

---

## 6. Notifications and Reminders

| Feature | Priority |
|---|---|
| Bill, invoice, and payment due dates | MVP |
| Budget threshold alerts (e.g., 80% used) | MVP |
| Low-balance and unusual-spending alerts | MVP |
| Goal milestone celebrations | V2 |
| Customizable channels: push, email | V2 |
| WhatsApp / SMS channels | Advanced |

---

## 7. Security and Privacy

| Feature | Priority |
|---|---|
| **PIN, biometric, and 2FA** | MVP |
| **End-to-end or field-level encryption** for sensitive data | MVP |
| **Secure session and device management** | MVP |
| **Data export and account deletion** for privacy compliance | MVP |
| **Regular backups** and cloud sync | MVP |
| **Privacy mode** that hides balances on screen | MVP |
| **Read-only bank connections** | V2 |
| **Audit logs** for business accounts | V2 |
| **Compliance**: GDPR and local data protection laws, plus PCI standards if handling cards | V2 |

---

## 8. User Experience

| Feature | Priority |
|---|---|
| **Fast quick-add**: log a transaction in under 5 seconds | MVP |
| **Dark mode** and multiple languages | MVP |
| **Onboarding** that asks whether the user is personal, business, or both | MVP |
| **Widgets** for home screen and lock screen | V2 |
| **Offline mode** with sync when back online | V2 |
| **Templates** for common setups (freelancer, shop owner, student, family) | V2 |
| **Accessibility**: screen reader support and adjustable text size | V2 |
| **Web and mobile** versions kept in sync | V2 |
| **Gamification**: streaks, badges, and challenges | Advanced |

---

## 9. Integrations and Platform

| Feature | Priority |
|---|---|
| Banks, e-wallets, and payment gateways | V2 |
| **Localization**: local tax rules, payment methods, and invoice formats | V2 |
| Google Sheets, calendar, and email | Advanced |
| E-commerce and marketplace platforms (Shopify, Tokopedia, etc.) | Advanced |
| Accounting software (Xero, QuickBooks, Jurnal, Accurate) | Advanced |
| **Open API and webhooks** for developers | Advanced |

---

## 10. Monetization

If relevant to your business model:

| Tier | Contents |
|---|---|
| **Free** | Basic tracking and limited AI queries |
| **Premium Personal** | Unlimited AI, bank sync, advanced reports |
| **Business Plan** | Multi-user, invoicing, payroll, accountant access |
| **Add-ons** | Extra businesses, storage, priority support |

---

## 11. Suggested Build Order

### Phase 1: MVP
Core tracking, budgets, goals, basic dashboard, reminders, security, and simple AI (auto-categorization plus a cashflow forecast).

### Phase 2
Bank sync, receipt OCR, invoicing, recurring items, shared accounts, and the AI chat assistant.

### Phase 3
Full business suite (payroll, inventory, taxes), what-if scenarios, integrations, and investment tracking.

> **Tip:** the AI cashflow forecast is only as good as your data. Prioritize easy data entry (bank sync, receipt scan, recurring detection) early, since it directly improves AI quality.

---

## Quick Checklist: MVP Scope

- [ ] Income and expense logging
- [ ] Multiple accounts and transfers
- [ ] Categories, subcategories, tags
- [ ] Recurring transactions
- [ ] Search, filter, sort
- [ ] Budgets (weekly and monthly)
- [ ] Savings goals
- [ ] Bill reminders
- [ ] Business profile and personal/business separation
- [ ] Basic invoicing with PDF export
- [ ] Dashboard, charts, cashflow statement, budget vs actual
- [ ] Export to PDF, Excel, CSV
- [ ] Budget, bill, and low-balance alerts
- [ ] PIN, biometric, 2FA, encryption, backups, privacy mode
- [ ] Quick-add, dark mode, multi-language, onboarding
- [ ] AI auto-categorization
- [ ] AI cashflow forecast, safe-to-spend, shortfall warnings, action suggestions