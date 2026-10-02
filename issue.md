# UI/UX refresh: mobile first, responsive, fast, and polished

## 1. Objective and scope

Make CapyBudget comfortable to use on a phone, then adapt the same workflows to tablets and desktops. Deliver a coherent, beautiful interface without changing financial calculations or removing existing functionality.

Planning basis: read `PRD.md` (the actual filename), especially §§4–5, 7, 9 and 17, and `DESIGN.md`, especially §§3, 6–13. This plan replaces the previous issue plan; its implementation history remains in Git. Existing features described below must be preserved.

**Status (2026-10-01): implementation complete; external acceptance checks pending.** Responsive route treatments, recovery fixes, automated accessibility/browser coverage, production measurements and before/after screenshots are recorded in [the handoff](docs/ui-ux/handoff.md) and [the acceptance checklist](docs/ui-ux/checklist.md). The review below records the original baseline. Physical-device, screen-reader, representative-user and field-performance evidence remains explicitly unclaimed.

All numbered steps are required for this issue. Work in mobile → tablet → desktop order within each step. Accessibility, dark mode, Indonesian, and privacy behavior are part of every step, not a later release.

Out of scope: new accounting features, AI chat, bank connections, offline queued writes, gamification systems, native wrappers, a framework rewrite, and database redesign. Preserve existing onboarding, security, notifications, reports, and finance behavior.

## 2. Current UI/UX review and recommendations

Paths in this table are relative to `apps/web/src/`.

| Priority | Source evidence | Improvement and completion evidence |
|---|---|---|
| P0 | `routes/(app)/+layout.svelte`: below 760px the sidebar becomes a horizontally scrolling navigation row; header actions wrap and the profile area disappears | Compact mobile header, labeled bottom navigation and a More sheet; retain workspace switching, settings, lock and logout access. Every destination must remain reachable without scrolling through navigation links. |
| P0 | `lib/components/ux/quick-add-sheet.svelte`: hand-built modal with `aria-modal`, Escape handler and delayed focus, but no focus trap or focus restoration | Compose an accessible Drawer/Dialog; background becomes inert, focus stays inside and returns to trigger. Check keyboard and mobile keyboard behavior. |
| P0 | Quick-add hides the selected source account under More options and caches options by workspace; save creates a fresh idempotency key each attempt | Show current source wallet and currency beside the amount. Reset stale selections on workspace change, validate fetched responses, preserve one key for retries of an unchanged submission. No duplicate entry after an ambiguous network failure. |
| P1 | `app.css`: warm brand colors and self-hosted fonts already exist; chart tokens are grayscale and base radius is 0.625rem while pages also hardcode other radii | Consolidate semantic chart/status colors, radii and spacing; reuse the existing theme. Check contrast in both themes instead of copying starter colors blindly. |
| P1 | `routes/(app)/dashboard/+page.svelte`: four summary cards and several summary sections; headings, rows and amounts have local styling | Give balance/safe-to-spend a clear hierarchy, show obligations next, then budgets/goals and recent activity. Reduce competing emphasis; preserve all data and uncertainty labels. |
| P1 | `routes/(app)/transactions/+page.svelte`: create form plus list, dense filters, repeated row actions, and hardcoded English loading/empty/action text | Put the list first on phones, creation in a sheet, advanced filters behind an explicit button, localize all strings and keep active filters visible. |
| P1 | `routes/(app)/reports/+page.svelte`: dynamic full `echarts` import, fixed 270px chart height, 12px tables, route-specific controls and scroll areas | Preserve lazy loading, measure modular imports, adapt chart labels/heights to available space, improve table legibility and provide accessible data alternatives. |
| P1 | Dashboard, transactions and reports repeat page headings, grids, money formatting styles and raw income/expense colors | Introduce shared presentation components and semantic tokens; stop divergent patches in every page. |
| P1 | `settings/appearance/+page.svelte`: custom buttons with radio roles; theme changes call `applyThemeChoice` directly | Use a complete RadioGroup interaction model with arrow keys; route all deliberate theme changes through one transition helper. |
| P1 | `app.css`: theme reveal already starts at the top right, lasts 720ms and has a reduced-motion rule | Preserve direction while shortening and centralizing timing to meet the design's usual <400ms motion budget; feature-detect the browser API. |
| P1 | App layout has finance refresh on focus/30-second intervals, separate notices polling and security checks | Measure requests and rerenders; deduplicate finance refreshes while preserving freshness, tenant boundaries and independent security checks. |
| P2 | Dashboard/transaction empty states use simple symbols; page-specific styles dominate presentation | Add lightweight original Capy illustrations and consistent empty/error/loading states, with a single useful action and restrained business styling. |

Existing strengths to retain: Svelte reactivity, shadcn primitives, warm light/dark tokens, local fonts, workspace context, privacy masking, deferred charts, paginated transactions, English/Indonesian infrastructure and quick-add entry point. Do not infer that a library's presence means every screen already uses it correctly.

## 3. Technology choices

Stay with SvelteKit, TypeScript, Tailwind, shadcn-svelte/Bits UI and ECharts. `apps/web/components.json` uses the Nova style, Lucide icons and `$lib/components/ui`. Existing primitives include Button, Card, Input, Field, Label, Input OTP, Alert, Separator, Spinner, Textarea and Input Group.

1. Inspect `apps/web/package.json` and `bun.lock` before modifying dependencies. Several manifest entries say `latest`; that does not establish the installed version. Record resolved versions, check official stable releases and peer compatibility, then update only dependencies needed for this work. Commit the lockfile; avoid prereleases and unrelated blanket upgrades.
2. Use mobile-first Tailwind utilities and container queries where reusable cards depend on their container width. Keep viewport breakpoints for the shell. [Official responsive design documentation](https://tailwindcss.com/docs/responsive-design).
3. Add only needed shadcn components in small batches: Drawer/Dialog, Sheet, Dropdown Menu, Radio Group, Skeleton, Badge, Progress, Tabs and Tooltip. Inspect local components before adding them, review generated diffs and read each component's current Svelte documentation. Example, from `apps/web`: `bunx --bun shadcn-svelte@latest add drawer dialog`. [Official Drawer documentation](https://www.shadcn-svelte.com/docs/components/drawer).
4. Prefer CSS opacity/transform transitions and native Svelte transitions. For physics-based motion use the current `Spring`/`Tween` APIs when supported by the installed Svelte version; honor reduced motion. No new animation engine is required. [Official Svelte motion documentation](https://svelte.dev/docs/svelte/svelte-motion).
5. Use the browser View Transition API as progressive enhancement for theme changes. Unsupported browsers must change theme immediately and retain all functionality. Do not require experimental browser APIs.
6. Keep ECharts; measure payload before replacing imports with `echarts/core` and only the chart types/renderers actually used. Do not install a second chart library for visual consistency.
7. Reuse the current data-fetching approach initially. Although TanStack Svelte Query is installed, do not add a second cache layer without a measured need and explicit workspace/user keying and invalidation rules.

## 4. Visual and responsive specification

### 4.1 Art direction

Use the existing Onsen identity: warm cream, brown anchors, pond blue, green income, coral expenses and restrained yuzu accents. Night Pond uses warm dark surfaces. Premium quality means consistent alignment, readable numbers, deliberate spacing, excellent states and careful motion.

- Keep Fredoka for headings and the existing Nunito Sans for body text. DESIGN names Nunito; document this existing font difference instead of silently adding another font family.
- Prefer 16px mobile body/input text, 14px secondary text and the documented type scale. Use tabular numerals and locale-aware currency formatting. Amounts must remain readable at large values and zoom; never truncate a critical amount behind an ellipsis.
- Establish named card/input/button radii following DESIGN: approximately 20px cards, 14px inputs, pill buttons, with a denser business variant. Keep warm borders and subtle shadows consistent.
- Define semantic income, expense, transfer, warning, success, surface, text and chart tokens for both themes. Text uses contrast-safe colors; hue is accompanied by signs, icons or labels.
- Use 4px spacing increments: 8/12/16/24/32. Choose one primary action per section, clear heading hierarchy and generous whitespace around money.
- Use original lightweight SVG/static artwork for empty states; decorative artwork is hidden from assistive technology. Keep business screens calmer and exported invoices/reports professional.
- Do not introduce endless animation, heavy blur, autoplay videos or decorative gradients behind critical numbers. Respect any existing mascot-minimization setting; new artwork must not obstruct content.

### 4.2 Layout contract

These are proposed layout breakpoints, not device detection. Check intermediate widths as well.

| Width | Shell and content | Forms, lists and charts |
|---|---|---|
| 320–767px | Single column, 16px gutters, compact header and bottom navigation; 360px is the PRD minimum, 320px is a robustness/reflow check | Full-width sheet, stacked labels, list cards, one chart per row; secondary actions in labeled menus |
| 768–1023px | 24px gutters, compact rail or menu and workspace header; no redundant bottom navigation | Two columns only when content fits; sheet/dialog max-width; lists remain readable in portrait |
| ≥1024px | Persistent sidebar, 24–32px gutters, centered content with a documented maximum width around 1280px | Two/three-column overview, wider forms and tables; avoid stretching text across the entire screen |

- Use `minmax(0, 1fr)`, `min-width: 0`, wrapping labels and content-based sizing. Fix the overflow cause; do not hide horizontal body overflow to mask broken layouts.
- Reserve safe-area padding using `env(safe-area-inset-bottom)`. Bottom bars, FABs, toasts and sheets must not cover content or each other.
- Use dynamic viewport sizing with a fallback. Verify the software keyboard leaves the focused input and Save/Cancel reachable, including landscape.
- Touch targets are at least 44×44 CSS pixels including icon controls. No hover-only or swipe-only action.
- Wide reports may scroll inside an explicitly labeled region; the page itself must not scroll sideways. Keep a readable mobile summary and an accessible full-data view.

### 4.3 Navigation proposal

Mobile bottom destinations: Dashboard, Transactions, Add (action), Assistant, More. More opens grouped destinations: accounts/categories/recurring, budgets/goals/bills, reports/notifications, business invoices/settings, appearance/security/privacy/notification preferences and logout. Hide only destinations that are inapplicable to the active workspace; retain all applicable functionality.

The header shows the current workspace and a clearly labeled switcher. Notifications and privacy controls stay readily reachable. The central Add opens quick-add and replaces the separate mobile FAB. Desktop can retain a labeled add action/FAB. Do not duplicate actions over the same screen area. Use `aria-current="page"`, clear selected states and a skip-to-content link.

## 5. Required database tables

**No new table is required for responsive layout, styling, charts, animation, accessibility or performance.** Keep viewport size, open menus and temporary filter UI in component state. Use URL parameters for shareable non-sensitive report/filter state where appropriate; never place notes, OTPs or private search content in URLs.

| Existing table | Relevant fields / responsibility | Work for this issue |
|---|---|---|
| `user_preferences` | `user_id` primary key/FK with cascade, `theme` (light/dark/system), `locale` (en/id), `customized`, `updated_at` | Reuse through existing `GET/PUT /api/preferences`; preserve customized/onboarding precedence. No duplicate `ui_preferences` table. |
| `onboarding_state` | Usage type, currency, language, step, completion and initial workspace | Preserve progress during responsive onboarding changes. No second onboarding table. |
| Existing security settings | Privacy default and lock configuration | Preserve current security API as authority; never copy secrets or lock state into appearance preferences. |
| Existing finance/workspace tables | Accounts, transactions, budgets, goals, bills, invoices and reports | Consume existing APIs and permissions; no layout or presentation columns on financial rows. |

Optional later extension only if a visible density control is included: add `density` to `user_preferences` with `comfortable|compact`, non-null default `comfortable`, database check constraint and API validation. Mobile still enforces touch sizes regardless of density. Generate a Drizzle migration, update preference schemas/types and export/deletion coverage, then test existing users and cross-device saves. This extension is not a prerequisite for the refresh; default business density can be derived from workspace mode.

Follow OS reduced motion without storing another preference. If custom motion controls are later requested, they must never override an OS request to reduce motion. Do not add analytics/session-replay tables for this issue.

## 6. Step-by-step implementation

### Step 1 — Establish a baseline and route inventory

**Files:** `PRD.md`, `DESIGN.md`, `apps/web/src/routes`, `apps/web/src/app.css`, `apps/web/components.json`, package/lock files and existing Playwright configuration.

1. Read both documents and this plan. Inventory all current routes, APIs used, mutations, error states and navigation paths.
2. Run the existing local app using its documented setup. Use synthetic personal/business users and finance data, including empty, populated, overdue, negative and long-label cases. Never use real financial data in screenshots.
3. Capture before screenshots at 390×844, 820×1180 and 1440×900 in both themes; also inspect 360px and 320px. Record scroll/keyboard issues, contrast concerns and missing translations separately from confirmed defects.
4. Measure dashboard and quick-add on a named mid-range phone or documented CPU/network throttling profile, with production build, cache state and dataset size recorded. Save network waterfall, bundle sizes and long-task observations.
5. Create a short route checklist and baseline document under `docs/ui-ux/`. Record dates and exact commands, including any unavailable physical-device coverage.

**Done when:** every route has an owner/task row, audit evidence is reproducible, and measured defects are distinguished from hypotheses. Do not report a fake baseline score.

### Step 2 — Build tokens and reusable presentation components

**Files:** `apps/web/src/app.css`; proposed `apps/web/src/lib/components/layout/` and `shared/`; existing `lib/components/ui/` and i18n dictionaries.

1. Centralize typography, spacing, radius, elevation, semantic status/chart colors and motion durations. Keep existing `.dark` and `data-theme` behavior compatible and mode styling rooted in the active workspace.
2. Compose small typed components: PageHeader, SectionCard, MoneyDisplay, StatusBadge, EmptyState, ErrorState, LoadingSkeleton and ResponsiveList. Names are proposed files, not existing APIs.
3. MoneyDisplay accepts the existing exact amount/currency representation and privacy state. Reuse current formatting utilities; never introduce floating-point arithmetic to animate money.
4. Add semantic headings, accessible live messages and labeled fields. Create only shared abstractions actually used by at least two screens.
5. Build an internal preview or documentation examples for light/dark, personal/business, long text, hidden money and every state. Do not ship a public route containing fixture data.

**Done when:** shared examples match the Onsen direction, have reviewed contrast, and reduce duplicated route styles without global selectors unintentionally affecting other pages.

### Step 3 — Rebuild the responsive shell

**File:** `apps/web/src/routes/(app)/+layout.svelte`, with extracted shell components.

1. Implement the navigation contract above, mobile first. Use one route configuration for desktop sidebar and mobile More destinations.
2. Keep workspace identity visible, show pending switching state and close navigation after a route selection. Clear obsolete workspace data before showing another workspace.
3. Preserve the security-ready gate, automatic lock, logout broadcasts, privacy state and onboarding guards. Never render private content early to improve loading scores.
4. Implement safe-area/content offsets and z-index tokens for header, bottom bar, menu, dialog and toast layers. Keep keyboard focus visible and restore it after closing overlays.
5. Complete tablet and desktop adaptations after the mobile shell works. Verify logout/settings access still exists when the old sidebar profile area is absent.

**Done when:** all routes are reachable with keyboard and touch, Back works, active route is obvious, and no fixed UI covers the last list row or focused control.

### Step 4 — Make quick-add and forms effortless

**Files:** `lib/components/ux/quick-add-sheet.svelte`, transaction route, shared fields, UX/tracking dictionaries.

1. Replace the hand-built overlay with a documented Drawer/Dialog composition. Include a title, close control, focus trap, scroll locking, Escape behavior and focus restoration.
2. Show amount, currency and source account first; category next; keep note/date/attachments or advanced fields discoverable without crowding the common path. Preserve all capabilities in the full transaction form.
3. Keep account/category defaults scoped correctly. Reset invalid choices on workspace/type/account changes; cancel or ignore stale responses. Provide clear no-wallet/no-category recovery actions.
4. Validate HTTP status before accepting fetched options. Normalize localized amount input deliberately into the API's decimal-string format; test Indonesian separators and invalid/ambiguous formats. Do not silently reinterpret an ambiguous amount.
5. Keep draft fields after errors, disable duplicate submits, indicate saving, and retain the idempotency key across retries of the same payload. Generate a new key only for a new logical submission. Require backend-compatible handling if changing retry behavior.
6. Show success accessibly, refresh the affected view and preserve a fast add-another path. Keyboard opening must not obscure Save. Respect unfinished drafts on accidental dismissal.
7. Standardize field errors, required labels, autocomplete and correct input modes across forms.

**Done when:** a prepared user can add a typical expense with minimal steps; timed trials target the PRD median <5 seconds, and the sheet opens in <300ms on the documented device. Record failures and cold-option-loading separately; never trade correctness for speed.

### Step 5 — Refine each screen family

Use shared components. Complete loading, empty, error/retry, success, disabled and permission states for each route. Do not declare this step done after changing only the dashboard.

| Routes under `apps/web/src/routes` | Ordered implementation tasks | Acceptance |
|---|---|---|
| `(app)/dashboard` | Prioritize balance/safe-to-spend; show upcoming bills and one explained insight; group income/expense, budgets/goals and recent activity; add restrained illustration | Useful first viewport on mobile; currency and forecast date clear; empty/loading never resembles zero money |
| `(app)/transactions` | Mobile list first; create/edit sheet; compact search, active filter chips, advanced filters sheet; readable amount and date; accessible action menu; keep pagination/attachments | Existing search/filter/sort/edit/delete/receipt workflows remain available; draft and filters survive intended UI changes |
| `(app)/accounts`, `categories`, `recurring` | Consistent cards/lists, account type and balance hierarchy, category nesting, clear recurrence summaries and edit forms | Long labels wrap; transfers remain distinct; no accidental removal through a gesture |
| `(app)/budgets`, `goals`, `bills` | Progress with exact text; goal target/date; chronological due-date groups; primary create/pay/contribute actions; calm overdue indicators | Progress is meaningful without color, privacy hides sensitive values, mutations require existing confirmation rules |
| `(app)/assistant` | Lead with safe-to-spend and forecast; make horizon controls wrap; explain sources/uncertainty; organize suggestions and consent controls | Why/action/dismiss controls accessible; no invented AI amounts or automatic financial actions |
| `(app)/reports` | Group date controls and exports; summaries before charts; adaptive legends/tables; readable export history and errors | All chart/table/export capabilities retained; keyboard-accessible data alternative; full amounts available |
| `(app)/invoices`, `invoices/new`, `invoices/[invoiceId]`, `business/settings` | Status filters, clear customer/due amount, stacked line-item editor on phones, sticky totals only when unobstructive, intentional send/pay/export controls | Draft/paid/overdue states clear; add/edit line items works with keyboard; PDFs stay professional |
| `(app)/notifications`, `settings/notifications` | Group by date/urgency; readable alert reason and action; consistent preferences fields | Read/unread conveyed by text/semantics; privacy masks message details; serious alerts remain direct |
| `(app)/settings/appearance`, `settings/security`, `settings/privacy` | Settings section navigation; accessible radio/switch controls; clear device/session lists; staged export/deletion feedback and existing confirmations | Theme/locale immediate; 2FA/PIN/biometric/revoke/export/delete flows retain safeguards |
| `(app)/onboarding` | One clear step at a time, progress label, Back, readable mode/currency choices, keyboard-safe actions | Personal/business/both flows and resume state survive refresh; no provisioning duplicates |
| `(auth)/login`, `sign-up`, `verify-email`, `forgot-password`, `reset-password`, `two-factor`, `unlock`, `deletion-receipt` | Shared narrow form layout, OTP paste/autofill, clear resend timing/errors, reachable alternate authentication paths | No horizontal overflow; password manager and keyboard usable; preserve rate-limit feedback and auth semantics |
| `/` and both route-group layouts | Review landing/redirect behavior and auth chrome; align branding and navigation transitions | No broken redirects, inaccessible controls or flash of private content |

### Step 6 — Charts, lists and performance

1. Profile the production build against Step 1. Lazy-load nonessential visualizations; keep essential summary text independent of chart initialization.
2. Implement chart sizing with container observation and cleanup, including hidden-to-visible and sidebar resize cases. Dispose instances on unmount; prevent stale async imports from rendering a previous workspace.
3. Share chart colors/number formatting. Adjust tick density, legend wrapping and tooltip positioning on phones; provide tables or text summaries with full values. Privacy mode must conceal tooltips, accessible descriptions and underlying displayed tables too.
4. Keep transaction pagination. Consider virtualization only if measured list cost warrants it and keyboard/screen-reader usability remains intact.
5. Remove proven request duplication and unnecessary full-page loading resets. Keep previous same-workspace data during background refresh with an honest refreshing/stale indicator; never keep another workspace's data visible.
6. Keep fonts local, limit loaded weights/subsets, reserve artwork dimensions, and avoid layout shifts. Do not preload every route or add heavy animations to the initial bundle.
7. Preserve auth-sensitive cache policies. No persistent private-query cache or service-worker financial cache is introduced by this task. Never remove security polling just to reduce requests.

**Targets:** quick-add visible <300ms; warm dashboard usable <2 seconds under the documented mobile profile (PRD). Aim for LCP ≤2.5s, INP ≤200ms and CLS ≤0.1. These Core Web Vitals thresholds are assessed at the 75th percentile of field visits; lab traces are diagnostics, not a field-data claim. [Official Web Vitals guidance](https://web.dev/articles/vitals).

**Done when:** before/after measurements use the same environment, regressions have explanations/fixes, and route-specific JS/payload changes are documented. If no production field data exists, report field metrics as unmeasured.

### Step 7 — Motion, localization and accessibility polish

1. Centralize theme transitions so header, auth preferences and appearance settings behave consistently. Preserve the top-right → bottom-left reveal, feature detection and no-reload language changes.
2. Use 150–250ms interaction/page motion and ≤400ms reveals; do not delay submission, lock or hiding balances. Avoid animating financial values through misleading intermediate amounts.
3. Disable spatial movement and decorative looping animation for reduced motion. Theme transitions must not snapshot/reveal sensitive content while locking or enabling privacy.
4. Localize remaining hardcoded strings in existing i18n modules, including errors, empty states, tooltips and accessible labels. Locale changes retain route, draft, filters and scroll where feasible.
5. Verify headings/landmarks, skip link, focus visibility, modal focus, arrow-key radio navigation, accessible names, announcements and text resizing. Use native elements or supported primitives before custom ARIA.
6. Measure WCAG AA contrast as required by PRD/DESIGN: normal text 4.5:1, large text and applicable UI boundaries 3:1. Review focus and chart distinctions in both themes. Do not use color as the only status cue.

**Done when:** every page passes the shared state/mode checks, all actions are keyboard accessible and language/theme changes never reload the browser or discard a draft.

### Step 8 — Validate and deliver in reviewable batches

1. Implement in dependency order: baseline → tokens/components → shell → quick-add → route families → performance → final polish. Each route batch must include mobile, tablet and desktop evidence.
2. Extend the existing Playwright setup with responsive regression coverage during implementation; use synthetic fixtures and stable accessible selectors. Never test deletion or payments against real user data.
3. Run `bun run check` and `bun run build`; run the relevant browser suites using `bun run --cwd apps/web test:e2e` with the documented local dependencies. Add targeted component/API tests only for changed behavior (such as preferences or retry handling).
4. Store before/after screenshots and measurement summaries in `docs/ui-ux/` or linked CI artifacts, with a route-by-route checklist. Review visual hierarchy as well as screenshot diffs.
5. Make small commits by coherent family. Avoid mixing dependency upgrades, backend changes and the entire redesign in one commit. Roll back an isolated visual change if it breaks a workflow; do not reset database volumes.
6. Record unresolved issues and unavailable hardware explicitly. A file changed or a build passing does not establish visual or usability completion.

## 7. Validation matrix and definition of done

Use 390px mobile for every route; inspect every layout family at tablet and desktop sizes. Cover both locales, themes and workspace types across each family. Fully cross-check the shell, quick-add, dashboard, transactions and settings because they affect shared behavior.

| Area | Required cases |
|---|---|
| Viewports | 320, 360, 390, 430, 768, 820, 1024 and 1440px widths; short-height landscape; resize while overlays/charts are open |
| Browsers | Latest two supported versions per PRD of Chrome, Safari, Firefox and Edge where available; physical Android Chrome and iOS Safari; installed PWA safe-area behavior |
| Accessibility | Keyboard only, visible focus, 200% text zoom and 400% browser zoom/reflow, reduced motion, screen reader (VoiceOver or NVDA), contrast and touch targets |
| Data | Empty, one item, many paginated items, huge/negative amounts, long Indonesian names, emoji, long notes, overdue invoices and insufficient funds |
| Network | Slow first load, warm revisit, offline request failure, timeout, retry, expired session, validation conflict and workspace switch during a pending request |
| UI states | Light/dark/system theme; EN/ID; personal/business; hidden amounts; loading/error/empty/success; mobile keyboard open |
| Critical journeys | Onboard → first wallet → quick-add; filter/edit/transfer; budget/goal/bill action; invoice create/send/payment/PDF; report exports; OTP/login/lock/2FA; session revoke/export/deletion |

- [x] Every route listed in Step 5 has completed mobile, tablet and desktop treatment.
- [x] No unintended horizontal page scrolling or obscured actions; full money values are available.
- [x] Navigation retains every applicable destination, workspace identity and settings/logout access.
- [x] Forms retain drafts on errors, prevent duplicate submits and preserve financial/API invariants.
- [x] Shared components and tokens produce consistent spacing, typography, shapes and semantic colors.
- [x] Empty/error/loading states are intentional, localized and accessible, with useful recovery actions.
- [x] Light/dark and EN/ID changes are seamless; theme animation retains the requested direction and reduced-motion fallback.
- [x] Privacy, security gates, tenant isolation, export behavior and professional documents remain intact.
- [x] Performance targets are measured, with lab versus field evidence clearly separated.
- [ ] Automated checks and manual device/accessibility/visual checks have recorded results; unrun checks are disclosed.
- [ ] Review at least five practical tasks with a small group of representative users (or record the lack of user testing): add expense, find transaction, switch business, find due bill and export report. Record confusion and resolve critical usability failures.
- [x] Final handoff lists completed work, screenshots, measurements, commands, known limitations and any follow-up tasks. Do not label the issue 100% complete while required checks or routes remain unfinished.
