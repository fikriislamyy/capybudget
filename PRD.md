# CapyBudget: Product Requirements Document (PRD)

| | |
|---|---|
| **Product** | CapyBudget |
| **Tagline** | *Stay chill with your money.* |
| **Document status** | Draft v0.1 |
| **Platforms** | Web (SvelteKit PWA), then iOS/Android via Capacitor |
| **Related docs** | `design.md` (visual and brand system) |

> Items marked **[Assumption]** are my working guesses and should be validated. Items marked **[Decision needed]** are open questions listed in section 18.

---

## 1. Overview

### 1.1 Summary
CapyBudget is a personal and business financial tracker with an AI assistant that gives each user **personalized cashflow management suggestions**. It combines everyday tracking (income, expenses, budgets, goals) with business tools (invoicing, receivables, payables, reports) in one app, wrapped in a calm, playful brand built around a capybara mascot.

### 1.2 Problem Statement
- Most finance apps feel stressful, cold, and judgmental, so people stop using them.
- Freelancers and small business owners often mix personal and business money, and they track them with spreadsheets or several disconnected tools.
- Users can see **what happened** to their money but rarely get help with **what to do next**, especially regarding upcoming cash shortfalls.
- Manual data entry is tedious, which causes people to abandon trackers within weeks.

### 1.3 Vision
Make managing money feel as relaxed as soaking in a hot spring, while giving users proactive, explainable guidance that keeps their cash healthy.

### 1.4 Product Principles
1. **Calm over alarm.** Encourage, never shame.
2. **Numbers are sacred.** Amounts must always be accurate, clear, and traceable.
3. **Code computes, AI explains.** Financial figures come from deterministic logic. The AI interprets and advises.
4. **Low-friction entry.** Every feature that reduces manual typing improves the whole product.
5. **User stays in control.** The AI suggests, and the user approves. It never moves money on its own.
6. **One identity, two modes.** Personal and business share a brand but have different depth.

---

## 2. Goals and Non-Goals

### 2.1 Goals
| # | Goal | Success signal |
|---|---|---|
| G1 | Make logging a transaction fast and easy | Median quick-add under 5 seconds |
| G2 | Give users a reliable cashflow forecast | Forecast accuracy within an agreed tolerance (see section 13) |
| G3 | Deliver AI suggestions users find useful and act on | Suggestion acceptance rate |
| G4 | Serve both personal and business users in one app | Share of users who use both modes |
| G5 | Build a habit | 30-day and 90-day retention |
| G6 | Earn trust on security and privacy | Zero critical data incidents |

### 2.2 Non-Goals (for the first releases)
- Moving money or acting as a payment processor or bank
- Full-featured accounting software replacement (complete double-entry compliance, statutory filings)
- Regulated investment advice or brokerage
- Lending, credit scoring, or insurance products
- Enterprise or multi-country payroll compliance
- Native (non-web) mobile codebases in the first phase

---

## 3. Target Users and Personas

**[Assumption]** Initial market: Indonesia (Rupiah, Bahasa Indonesia and English), with a design that allows expansion.

### 3.1 Personas

**Persona A: "Rina," Young Professional (Personal)**
- 26, salaried, wants to save for a trip and stop wondering where her money goes
- Needs: fast logging, budgets, goals, gentle nudges, bill reminders
- Pain: abandons apps that feel like homework

**Persona B: "Budi," Freelancer / Solo Business (Personal + Business)**
- 32, irregular income, sends invoices, mixes personal and business spending
- Needs: invoicing, unpaid invoice tracking, income smoothing, cashflow forecast, tax set-aside
- Pain: uncertain about what he can safely spend when income is irregular

**Persona C: "Sari," Small Shop / SME Owner (Business)**
- 41, runs a small retail business with 3 employees
- Needs: receivables and payables, vendor tracking, simple reports, staff access, accountant access
- Pain: cash gets tight before supplier payments and she finds out too late

**Persona D: "Dewi and Andi," Household (Personal, shared)**
- Couple sharing household expenses with some private spending
- Needs: shared budgets, private accounts, shared goals
- Pain: money conversations that cause friction

**Secondary:** external accountants (read-only or limited access), and employees submitting expense claims (later phases).

---

## 4. Scope by Release

| Release | Theme | Included |
|---|---|---|
| **MVP (v1.0)** | Track, budget, forecast | Core tracking, budgets, goals, reminders, basic invoicing, dashboard, security basics, AI auto-categorization and cashflow forecast |
| **v1.5** | Automation and AI chat | Statement import, receipt OCR, AI chat assistant, what-if scenarios, subscription detection, notifications expansion |
| **v2.0** | Business depth and collaboration | Bank and e-wallet sync, AR/AP aging, roles and permissions, P&L, tax features, shared household mode, multi-currency |
| **v3.0** | Ecosystem | Inventory, payroll tracking, integrations, investments, public API, native app wrappers polish |

Feature IDs use the format `FR-<area>-<n>` and priority `P0` (must), `P1` (should), `P2` (could).

---

## 5. User Journeys (Key Flows)

1. **Onboarding:** choose Personal, Business, or Both → pick currency and language → create the first account → set a first budget or goal → see a first dashboard with Capy.
2. **Quick add:** tap `+` → enter amount → choose category → done (optionally add note, account, photo).
3. **Weekly check-in:** open the dashboard → see safe-to-spend, upcoming bills, and forecast → read one AI suggestion → accept, snooze, or dismiss.
4. **Invoice to cash:** create invoice → send or share link → track status → mark paid → the forecast updates automatically.
5. **Shortfall warning:** AI detects a projected low balance → notifies the user → offers 2–3 options with reasoning → user picks an action (e.g., send an invoice reminder, delay a payment).

---

## 6. Functional Requirements

### 6.1 Accounts and Onboarding (AUTH)
| ID | Requirement | Priority |
|---|---|---|
| FR-AUTH-1 | Sign up and log in with email and password, and with Google | P0 |
| FR-AUTH-2 | Email verification and password reset | P0 |
| FR-AUTH-3 | Two-factor authentication (TOTP) | P0 |
| FR-AUTH-4 | Biometric or PIN lock on mobile and PWA | P0 |
| FR-AUTH-5 | Onboarding wizard capturing usage type (personal, business, both), currency, language | P0 |
| FR-AUTH-6 | Session and device management (view and revoke) | P1 |
| FR-AUTH-7 | Workspace concept: each user has a Personal workspace and can create one or more Business workspaces | P0 |
| FR-AUTH-8 | Invite members to a workspace with a role (owner, admin, accountant, staff, viewer) | P1 (v2.0) |
| FR-AUTH-9 | Account deletion and full data export | P0 |

### 6.2 Core Tracking (TRK)
| ID | Requirement | Priority |
|---|---|---|
| FR-TRK-1 | Create, edit, delete transactions: amount, type (income, expense, transfer), date, category, account, note, tags | P0 |
| FR-TRK-2 | Multiple accounts: cash, bank, e-wallet, credit card, savings (with starting balance) | P0 |
| FR-TRK-3 | Transfers between accounts that do not count as income or expense | P0 |
| FR-TRK-4 | Default and custom categories, subcategories, and tags | P0 |
| FR-TRK-5 | Recurring transactions (daily, weekly, monthly, yearly, custom) with upcoming instances visible | P0 |
| FR-TRK-6 | Search, filter, and sort by date, amount, category, account, tag, and text | P0 |
| FR-TRK-7 | Attach photos or files to a transaction | P1 |
| FR-TRK-8 | Split a transaction across categories | P1 |
| FR-TRK-9 | Bulk edit and delete | P1 |
| FR-TRK-10 | CSV, Excel, and statement import with column mapping and duplicate detection | P1 (v1.5) |
| FR-TRK-11 | Receipt scan with OCR to auto-fill merchant, date, total, and line items | P1 (v1.5) |
| FR-TRK-12 | Bank and e-wallet sync through an aggregator (read-only) | P1 (v2.0) |
| FR-TRK-13 | Multi-currency with historical exchange rates | P1 (v2.0) |
| FR-TRK-14 | Voice and natural-language quick entry ("lunch 45k") | P1 (v1.5) |
| FR-TRK-15 | Undo for recent edits and deletes (soft delete with recovery window) | P1 |

### 6.3 Budgets and Goals (BUD)
| ID | Requirement | Priority |
|---|---|---|
| FR-BUD-1 | Monthly (and weekly) budgets by category with progress display | P0 |
| FR-BUD-2 | Budget alerts at configurable thresholds (default 80% and 100%) | P0 |
| FR-BUD-3 | Rollover option for unused budget | P1 |
| FR-BUD-4 | Budget templates (50/30/20, zero-based, envelope) | P1 |
| FR-BUD-5 | Savings goals with target amount, date, linked account, and progress | P0 |
| FR-BUD-6 | Goal contribution suggestions ("save X per week to reach your goal") | P1 |
| FR-BUD-7 | Debt and loan tracker with payoff schedule, snowball and avalanche views | P1 (v2.0) |
| FR-BUD-8 | Net worth tracker (assets minus liabilities over time) | P1 (v2.0) |
| FR-BUD-9 | Subscription tracker and detection of recurring charges | P1 (v1.5) |
| FR-BUD-10 | Shared household budgets with private accounts | P1 (v2.0) |

### 6.4 Bills and Reminders (REM)
| ID | Requirement | Priority |
|---|---|---|
| FR-REM-1 | Bill entries with due dates and recurrence | P0 |
| FR-REM-2 | Reminders before due dates (push, email) with configurable lead time | P0 |
| FR-REM-3 | Mark bills paid and auto-create the matching transaction | P1 |
| FR-REM-4 | Notification preferences per type and channel | P0 |
| FR-REM-5 | WhatsApp or SMS reminders | P2 (v3.0) |

### 6.5 Business Finance (BIZ)
| ID | Requirement | Priority |
|---|---|---|
| FR-BIZ-1 | Create and switch between multiple business workspaces | P0 |
| FR-BIZ-2 | Business profile: name, logo, address, tax ID, currency, fiscal year | P0 |
| FR-BIZ-3 | Customers and vendors directory | P0 |
| FR-BIZ-4 | Create invoices with line items, tax, discount, due date, notes, and numbering | P0 |
| FR-BIZ-5 | Invoice statuses: draft, sent, viewed (if trackable), partially paid, paid, overdue, void | P0 |
| FR-BIZ-6 | Export invoice as PDF and share by link or email | P0 |
| FR-BIZ-7 | Record full and partial payments against invoices | P0 |
| FR-BIZ-8 | Overdue reminders (manual and automated) | P1 |
| FR-BIZ-9 | Recurring invoices | P1 (v2.0) |
| FR-BIZ-10 | Bills and payables tracking for vendors | P1 (v2.0) |
| FR-BIZ-11 | Receivables and payables aging reports | P1 (v2.0) |
| FR-BIZ-12 | Product and service catalog | P1 (v2.0) |
| FR-BIZ-13 | Tax handling (VAT/sales tax rates, tax summary reports) | P1 (v2.0) |
| FR-BIZ-14 | Profit and loss, and basic balance sheet | P1 (v2.0) |
| FR-BIZ-15 | Project or client profitability | P2 (v2.0) |
| FR-BIZ-16 | Quotes and purchase orders | P2 (v3.0) |
| FR-BIZ-17 | Basic inventory and COGS | P2 (v3.0) |
| FR-BIZ-18 | Payroll tracking and employee expense claims | P2 (v3.0) |
| FR-BIZ-19 | Fixed assets and depreciation | P2 (v3.0) |
| FR-BIZ-20 | Payment links or QR on invoices | P2 (v2.0) |
| FR-BIZ-21 | Audit trail of changes to financial records | P1 (v2.0) |
| FR-BIZ-22 | Accountant access with limited permissions | P1 (v2.0) |

### 6.6 Dashboard, Reports, and Export (RPT)
| ID | Requirement | Priority |
|---|---|---|
| FR-RPT-1 | Dashboard: total balance, income vs expense, safe-to-spend, upcoming bills, budgets, goals, and one AI insight | P0 |
| FR-RPT-2 | Charts: category breakdown, trends over time, cashflow | P0 |
| FR-RPT-3 | Budget vs actual report | P0 |
| FR-RPT-4 | Cashflow statement | P0 |
| FR-RPT-5 | Export to CSV, Excel, and PDF | P0 |
| FR-RPT-6 | Custom date ranges and comparisons (month over month, year over year) | P1 |
| FR-RPT-7 | Scheduled email reports | P1 (v2.0) |
| FR-RPT-8 | Custom report builder | P2 (v3.0) |
| FR-RPT-9 | Privacy mode that hides balances on screen | P0 |

### 6.7 AI Assistant (AI)

The AI assistant is the primary differentiator. See also section 8.

| ID | Requirement | Priority |
|---|---|---|
| FR-AI-1 | **Auto-categorization** of transactions from merchant and note, learning from user corrections | P0 |
| FR-AI-2 | **Cashflow forecast** for 30, 60, and 90 days using history, recurring items, bills, and unpaid invoices | P0 |
| FR-AI-3 | **Safe-to-spend** amount for today or this week | P0 |
| FR-AI-4 | **Low-balance and shortfall alerts** with projected date and amount | P0 |
| FR-AI-5 | **Personalized suggestions** (e.g., send reminder for invoice X, delay payment Y, move Z to savings), each with an explanation of why | P0 |
| FR-AI-6 | Weekly and monthly plain-language summaries | P1 |
| FR-AI-7 | **Chat interface** answering questions about the user's own data ("How much did I spend on food last month?", "Who owes me money?") | P1 (v1.5) |
| FR-AI-8 | **What-if scenarios** ("What if I buy a laptop?", "What if this client pays 2 weeks late?") | P1 (v1.5) |
| FR-AI-9 | Anomaly and duplicate detection | P1 (v1.5) |
| FR-AI-10 | Late-payer risk indicators for customers | P1 (v2.0) |
| FR-AI-11 | Runway and burn rate for businesses | P1 (v2.0) |
| FR-AI-12 | Payment prioritization when cash is tight | P1 (v2.0) |
| FR-AI-13 | Seasonality detection | P2 (v2.0) |
| FR-AI-14 | Financial health score | P2 (v2.0) |
| FR-AI-15 | Natural-language and voice transaction entry (see FR-TRK-14) | P1 (v1.5) |
| FR-AI-16 | Suggestion feedback (helpful / not helpful, dismiss, snooze) to improve relevance | P0 |
| FR-AI-17 | User controls: enable or disable AI features, choose which data the AI can use, adjust nudge frequency and tone (Playful / Balanced / Professional) | P0 |
| FR-AI-18 | The AI **never executes financial actions on its own**. Any action requires explicit user confirmation. | P0 |
| FR-AI-19 | In-app disclosure that suggestions are informational, not professional financial, tax, or legal advice | P0 |

### 6.8 Gamification and Delight (FUN)
| ID | Requirement | Priority |
|---|---|---|
| FR-FUN-1 | Capy mascot states tied to financial situation (see `design.md`) | P1 |
| FR-FUN-2 | Budgets shown as ponds, goals as onsen pools | P1 |
| FR-FUN-3 | Streaks with freeze option and gentle badges (yuzu rewards) | P2 |
| FR-FUN-4 | Ability to hide or minimize the mascot and gamification | P0 |
| FR-FUN-5 | Celebration animation when a goal is reached | P1 |

### 6.9 Settings and Platform (SET)
| ID | Requirement | Priority |
|---|---|---|
| FR-SET-1 | Language: English and Bahasa Indonesia | P0 |
| FR-SET-2 | Light and dark themes | P0 |
| FR-SET-3 | Personal and Business mode styling (see `design.md`) | P1 |
| FR-SET-4 | PWA installability and basic offline read and queued writes | P1 |
| FR-SET-5 | Currency and number/date formatting per locale | P0 |
| FR-SET-6 | Help center, feedback form, and in-app support link | P1 |
| FR-SET-7 | Webhooks and public API | P2 (v3.0) |
| FR-SET-8 | Integrations (accounting software, e-commerce, Sheets, calendar) | P2 (v3.0) |

---

## 7. Money Handling Rules (Critical)

1. Store all amounts as **integers in minor units** or Postgres `NUMERIC`. Never use floating-point types.
2. Every transaction stores its **currency**. Conversion rates are stored with the date used.
3. Transfers must net to zero across accounts.
4. Financial records are **soft-deleted** and auditable. Hard deletion is only for account deletion requests.
5. Business workspaces should be built on a **double-entry ledger model** (accounts, journal entries, lines) so P&L, balance sheet, and audit trails are reliable. Personal mode can present a simplified view on top of the same ledger. **[Decision needed]** on whether to use one unified ledger or separate models for personal and business.
6. Rounding rules are defined per currency and applied consistently.
7. Reports must be reproducible: the same data and date range always produce the same numbers.

---

## 8. AI Requirements (Detail)

### 8.1 Architecture Principle
**Deterministic engine computes. The LLM explains and advises.**

| Task | Approach |
|---|---|
| Cashflow forecast | Deterministic engine: current balances + recurring items + due bills + expected invoice payments + historical averages. Optional statistical model (e.g., a Python forecasting service) for improved accuracy later. |
| Safe-to-spend | Deterministic calculation from balances minus upcoming obligations and goal contributions |
| Categorization | Rules and merchant matching first, then LLM for unknowns, learning from corrections |
| Suggestions | Rule-based candidate actions generated from the forecast, then LLM ranks and phrases them with an explanation |
| Chat | LLM with **tool calling** into read-only data functions (e.g., `get_cashflow`, `list_unpaid_invoices`, `spending_by_category`) |
| Anomaly detection | Statistical thresholds and duplicate rules, with LLM only used to phrase the alert |

### 8.2 Requirements
- Every number shown by the AI must originate from a tool or calculation result, not model memory.
- Every suggestion shows **why** it was made and which data it used.
- Every suggestion can be dismissed, snoozed, or marked not helpful.
- Provide graceful fallback when the AI service is unavailable (the forecast and deterministic alerts still work).
- Log prompts, tool calls, and outputs for quality review, with sensitive data minimized and access-controlled.
- Only send the minimum data needed to the LLM provider, and mask account numbers, names, and other identifiers where possible.
- Users can opt out of AI features entirely. No user data is used to train third-party models. **[Decision needed]** confirm provider terms and data retention settings.
- Rate limits and usage quotas per plan.

### 8.3 Suggestion Types (Initial Catalog)
| Type | Example |
|---|---|
| Shortfall prevention | "Balance may dip below zero on the 28th. You could delay the internet bill to the 30th or send a reminder for Invoice #21." |
| Invoice follow-up | "Invoice #21 is 5 days late. Want me to draft a friendly reminder?" |
| Overspending | "Food is at 85% with 10 days left. Cutting Rp 20k a day would keep you on budget." |
| Savings | "You have Rp 2M idle this month. Move Rp 500k toward your vacation goal?" |
| Subscription cleanup | "You haven't used X in 60 days. It costs Rp 99k per month." |
| Tax set-aside | "Set aside Rp X from this payment for taxes." |

### 8.4 AI Safety and Tone
- Warm and calm, never shaming.
- Reduce playfulness for serious topics (fraud, tax deadlines, overdue debt).
- Avoid definitive tax, legal, or investment advice. Encourage consulting a professional where appropriate.
- Fraud and anomaly alerts must be clear and direct.

---

## 9. Non-Functional Requirements

### 9.1 Performance
- Quick-add sheet opens in under 300ms on a mid-range phone
- Dashboard loads in under 2 seconds on a typical mobile connection (after first load)
- Forecast computation for a typical user completes in under 2 seconds
- AI chat first token in under 3 seconds under normal conditions

**[Assumption]** These targets need validation with real devices and data volumes.

### 9.2 Reliability
- Target 99.5% monthly uptime for MVP (raise later)
- Automated daily database backups with periodic **tested restores**
- Idempotent writes for transactions and imports to avoid duplicates on retries

### 9.3 Security
- TLS everywhere; encryption at rest for the database and object storage
- Field-level encryption for especially sensitive fields (account numbers, tokens)
- Passwords hashed with a modern algorithm; 2FA available
- Row-level security or equivalent tenant isolation on every workspace-scoped table
- Role-based access control enforced server-side
- Rate limiting and abuse protection on auth and AI endpoints
- Secrets managed outside the repository
- Audit logs for business workspaces
- Read-only credentials for bank aggregation, never storing raw bank passwords
- Regular dependency updates and vulnerability scanning; pre-launch penetration test recommended

### 9.4 Privacy and Compliance
- Publish a clear privacy policy and terms of service
- Comply with applicable data protection law (e.g., Indonesia's PDP Law and GDPR if serving EU users). **[Decision needed]** legal review and data residency requirements.
- Data export and account deletion available in-app
- Consent-based AI data access with granular controls
- Data retention and deletion schedules defined and documented
- If storing or processing card data, follow PCI requirements (avoid this by using payment providers)

### 9.5 Accessibility
- Target WCAG 2.1 AA
- Color never the sole carrier of meaning
- Respect reduced-motion and text-size settings
- Screen-reader labels for charts and mascot elements

### 9.6 Localization
- English and Bahasa Indonesia at launch; string externalization from day one
- Currency, date, and number formatting per locale
- Local invoice and tax formats for the target market

### 9.7 Compatibility
- Latest two versions of Chrome, Safari, Firefox, Edge
- iOS Safari and Android Chrome as PWA; responsive from 360px width

---

## 10. Technical Approach (Summary)

| Layer | Choice |
|---|---|
| Frontend | SvelteKit + TypeScript, Tailwind CSS, shadcn-svelte / Bits UI, ECharts |
| Backend | ElysiaJS on Bun, Eden Treaty for typed client |
| Database | PostgreSQL with Drizzle ORM, Row-Level Security |
| Auth | Better Auth (sessions, 2FA, organizations/roles) |
| Jobs and cache | `pg-boss` or BullMQ + Redis when needed |
| Storage | S3-compatible (receipts, invoice PDFs, attachments) |
| AI | LLM API with tool calling; deterministic forecast engine; optional Python forecasting service |
| PDF | HTML-to-PDF worker (Playwright) |
| Infra | Docker Compose (web, api, worker, db, optional redis and forecast service), Caddy reverse proxy |
| Observability | Sentry, OpenTelemetry, uptime monitoring |
| Mobile | PWA first, Capacitor wrappers later |

Keep the architecture a **modular monolith** for MVP. Split services only when scale or team structure demands it.

---

## 11. Data Model (High-Level)

Key entities (not exhaustive):

- **User**, **Workspace** (personal or business), **Membership** (user, workspace, role)
- **Account** (cash, bank, e-wallet, card), **Category**, **Tag**
- **Transaction**, **TransactionSplit**, **Attachment**
- **RecurringRule**, **Bill**, **Reminder**
- **Budget**, **Goal**, **GoalContribution**
- **Customer**, **Vendor**, **Invoice**, **InvoiceLine**, **Payment**
- **LedgerAccount**, **JournalEntry**, **JournalLine** (business ledger)
- **ForecastRun**, **Suggestion** (with status, reason, feedback)
- **AIConversation**, **AIMessage**, **AIToolCall** (audit)
- **Notification**, **NotificationPreference**
- **ImportJob**, **BankConnection** (later)
- **AuditLog**

Every workspace-scoped table carries `workspace_id` and is protected by tenant isolation.

---

## 12. Monetization (Proposed)

**[Assumption]** Freemium subscription. Pricing to be determined after market research.

| Plan | Audience | Highlights |
|---|---|---|
| **Free** | Everyone | Core tracking, budgets, goals, limited AI queries, basic forecast, basic reports |
| **Plus (Personal)** | Individuals | Unlimited AI, bank sync, receipt OCR, advanced reports, shared household |
| **Business** | SMEs | Multiple businesses, invoicing extras, roles, accountant access, P&L, taxes, higher AI limits |
| **Add-ons** | Any | Extra businesses, storage, priority support |

**[Decision needed]** local payment methods for Indonesia (bank transfer, e-wallets, QRIS) alongside cards, and app-store billing rules if using Capacitor builds.

---

## 13. Success Metrics

### 13.1 North Star
**Weekly active users who take at least one meaningful finance action** (log a transaction, act on a suggestion, send or reconcile an invoice).

### 13.2 Metrics
| Area | Metric | Initial target (to be calibrated) |
|---|---|---|
| Activation | % of new users who log 5+ transactions or set up a budget within 7 days | 40% |
| Ease | Median time to add a transaction | < 5 sec |
| Retention | Day-30 and Day-90 retention | 30% / 20% |
| Engagement | Weekly sessions per active user | 3+ |
| AI value | Suggestion acceptance rate | 20% |
| AI trust | "Helpful" feedback rate | 60% |
| Forecast quality | Mean absolute percentage error of 30-day balance forecast | Define after baseline |
| Business | Invoices created per active business user per month | 5+ |
| Revenue | Free-to-paid conversion | 3–5% |
| Quality | Crash-free sessions | 99%+ |
| Support | Tickets per 1,000 users | Track and reduce |

All targets are **[Assumption]** placeholders. Set baselines during beta.

---

## 14. Release Plan

### Phase 0: Discovery (2–4 weeks)
- User interviews (freelancers, SME owners, young professionals)
- Competitor review (local and global)
- Finalize market, pricing hypothesis, and legal requirements
- Commission mascot and core illustrations

### Phase 1: MVP build
- Auth, workspaces, accounts, transactions, categories, recurring items
- Budgets, goals, bills and reminders
- Dashboard, core reports, export
- Basic invoicing (create, PDF, status, payments)
- AI: auto-categorization, cashflow forecast, safe-to-spend, shortfall alerts, first suggestions
- Security baseline, backups, monitoring
- Closed beta with 20–50 users

### Phase 2: v1.5
- Import (CSV and statements), receipt OCR
- AI chat and what-if scenarios
- Subscription detection, anomaly detection
- Voice and natural-language entry
- Public beta

### Phase 3: v2.0
- Bank and e-wallet sync
- Roles, accountant access, audit trail
- AR/AP aging, P&L, taxes, recurring invoices
- Shared household mode, multi-currency
- Capacitor apps in stores

### Phase 4: v3.0
- Inventory, payroll tracking, fixed assets
- Integrations and public API
- Investment tracking
- Advanced AI (runway, risk scoring, seasonality)

Timelines depend on team size and are **[Decision needed]**.

---

## 15. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Manual entry fatigue lowers retention | High | Prioritize quick-add, import, OCR, sync, recurring detection early |
| AI gives wrong or harmful suggestions | High | Deterministic numbers, explanations, user confirmation, feedback loop, disclaimers, testing on realistic scenarios |
| Bank and e-wallet aggregator coverage or cost in target market | High | Start with import; evaluate aggregators before committing; keep sync as an add-on |
| Data breach or privacy incident | Critical | Encryption, RLS, least-privilege access, audits, pen test, incident response plan |
| Regulatory issues (data protection, financial advice, tax) | High | Legal review; avoid regulated activities; clear disclaimers |
| Scope creep from personal plus business plus AI | High | Strict phase gating; ship MVP with a narrow core |
| Playful brand alienates business users | Medium | Business mode with toned-down styling, tone setting, professional documents |
| LLM cost and latency | Medium | Cache, use deterministic logic wherever possible, plan quotas, choose model tiers by task |
| Newer stack ecosystem (Elysia, Bun, Svelte) has fewer ready-made libraries | Medium | Keep dependencies deliberate; verify library compatibility early with spikes |
| Accounting correctness (business ledger) | High | Double-entry model, automated tests on ledger invariants, accountant review |
| Mascot IP conflicts | Medium | Original illustrations; trademark check |

---

## 16. Dependencies and Assumptions

- Availability of an LLM provider with acceptable pricing, latency, and data-handling terms
- Availability of an email provider, push notification service, and object storage
- Legal guidance on data protection and financial disclaimers
- A designer or illustrator for the mascot and asset set (see `design.md`)
- Access to test data or synthetic datasets for forecast validation
- **[Assumption]** initial team is small; the modular monolith approach matches that

---

## 17. Testing and Quality Plan

- **Unit tests:** money math, forecast engine, recurring rules, ledger invariants, categorization rules
- **Integration tests:** API and database with tenant isolation checks
- **E2E tests:** onboarding, quick add, invoice lifecycle, budget alerts
- **AI evaluation:** a fixed test set of scenarios with expected forecast values and acceptable suggestion types; regression checks whenever prompts or models change
- **Security:** dependency scanning, auth and permission tests, pre-launch penetration test
- **Accessibility:** automated checks plus manual screen reader testing
- **Beta:** closed beta with feedback loop before public launch
- **Restore drills:** periodically test database backup restores

---

## 18. Open Questions / Decisions Needed

1. **Target market and launch region:** Indonesia only, or wider? This affects tax, invoice formats, payment methods, and aggregator choice.
2. **Ledger design:** one unified double-entry ledger for personal and business, or separate models?
3. **Bank sync provider:** which aggregator, and what are coverage and cost for target banks and e-wallets?
4. **LLM provider and data terms:** retention, training opt-out, regional processing.
5. **Pricing:** price points, free-tier limits, and local payment methods.
6. **Mascot art direction and budget:** flat vector, soft 3D, or hand-drawn?
7. **Assistant identity:** is the AI simply "Capy," or a separate named character?
8. **Team and timeline:** who builds what, and what is the launch target date?
9. **Tax features scope:** which taxes to support at launch (e.g., VAT/PPN, income tax set-aside)?
10. **Native apps:** when to invest in Capacitor and app store distribution, and how to handle store billing?
11. **Legal:** terms, privacy policy, and disclaimer wording reviewed by a professional.
12. **Trademark:** clearance for the "CapyBudget" name and logo.

---

## 19. Appendix

### 19.1 Glossary
- **Safe-to-spend:** money available to spend now after accounting for upcoming bills, obligations, and goal contributions.
- **Runway:** how many months a business can operate with current cash at the current burn rate.
- **Burn rate:** net monthly cash outflow.
- **AR / AP:** accounts receivable (money owed to you) / accounts payable (money you owe).
- **Aging report:** receivables or payables grouped by how overdue they are.
- **Double-entry ledger:** accounting method where every transaction is recorded as balanced debits and credits.
- **RLS:** Row-Level Security, database-enforced tenant isolation.

### 19.2 Related Documents
- `design.md`: brand, visual metaphor, tokens, mascot, and motion guidelines

---

*This PRD is a living document. Revisit it after discovery research, beta feedback, and any decisions on the open questions above.*