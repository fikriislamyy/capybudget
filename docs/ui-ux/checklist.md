# Issue #16 route and acceptance checklist

Source scope: every route in Step 5 of `issue.md`. Implementation status and browser evidence are separate. Test details and external validation limits are in `handoff.md`.

| Route family | Implemented treatment | Automated coverage |
|---|---|---|
| App shell | Responsive navigation, grouped More, tablet add/menu, workspace switching, skip link, notification sheet, independent security checks and recovery | Mobile/tablet/desktop, both locales/themes, focus trap/restoration, offline, workspace isolation |
| Dashboard | Balance/safe-to-spend hierarchy, obligations, budgets/goals, recent activity, exact localized money, stable refresh states | Reflow, accessibility, privacy, production timings, screenshots |
| Transactions | History first, creation/edit/filter sheets, visible chips, row menu, delete confirmation, retry keys and retained drafts | Network ambiguity produces one entry; keyboard, privacy chips, locale change, reflow |
| Accounts | Shared states/money, inline rename and archive confirmation | Reflow/accessibility, cross-session refresh and privacy |
| Categories/tags | Shared states, inline rename, archive confirmation and tag editor | Reflow/accessibility |
| Recurring | Clear rule/occurrence summaries and archive confirmation; refresh loop fixed | Reflow/accessibility; materialization does not loop |
| Budgets | Semantic progress, exact spent/remaining values and archive confirmation | Reflow/accessibility, seeded populated states |
| Goals | Progress, target/date, contributions and archive confirmation | Reflow/accessibility, seeded populated states |
| Bills | Due groups, overdue badge, pay/archive confirmation, shared states | Reflow/accessibility, existing actions retained |
| Assistant | Forecast hierarchy, responsive controls, source/uncertainty details, accessible table, shared lazy chart renderer, consent controls | Populated forecasts, EN/ID reflow, chart/privacy presentation and accessibility |
| Reports | Summaries first, responsive charts, exact tables in keyboard-scrollable regions, export history and same-period refresh | Reflow/accessibility, chart resizing/privacy, screenshots |
| Invoices/list | Status filters, exact money and localized states in a labeled scroll region | Personal/business switching, reflow/accessibility |
| Invoice editor/detail | Stacked mobile line items, labeled fields, reason dialog for void/reversal, professional export retained | Populated draft/detail, reflow/accessibility |
| Business settings | Shared heading/states, readable form | Business workspace, reflow/accessibility |
| Notifications/preferences | Read state semantics, masked financial messages, shared states, accessible notification sheet | Budget alerts, language/privacy, keyboard read/snooze/dismiss, workspace isolation |
| Appearance | RadioGroup with arrows, central theme helper, immediate language changes | Light/dark/system, EN/ID, no reload, reduced motion, draft retention |
| Security/privacy settings | Consistent headings/errors, usable controls, preserved reauthentication/confirmation flows | PIN, virtual platform WebAuthn, session listing, privacy and mobile reflow |
| Onboarding | Step/provision summary, refreshed workspace handoff, category reload on resume | Signup → four onboarding steps → first wallet → dashboard |
| Auth screens (8) | Warm theme tokens, narrow responsive forms, headings, localized close/preferences | Signup/OTP/login/reset/logout; all screens reflow/accessibility |
| Public landing | Responsive bilingual marketing page and authenticated dashboard redirect | Reflow/accessibility, no fixture financial content |
| Quick-add | Focused amount, visible wallet/currency, workspace cancellation, exact EN/ID parsing, empty/error recovery and retry key | Focus trap/restore, pending-response isolation, ambiguous retry, 10 timed entries, landscape, simulated 200% text enlargement and open-overlay resize |

## Implementation acceptance

- [x] Every listed route has responsive treatment; financial actions remain available.
- [x] Mobile navigation retains applicable destinations and workspace identity.
- [x] No page overflow in tested layouts; wide tables scroll in labeled regions.
- [x] Source wallet/currency is visible, exact amounts stay intact and retries retain identity.
- [x] Shared tokens/components provide consistent shapes, status colors and states.
- [x] Theme/language updates are immediate; reduced motion and privacy cancel snapshots.
- [x] Security checks remain independent of finance polling; failed checks have recovery.
- [x] Migration registration and local schema deployment are complete.
- [x] Production build, static checks, screenshots and reproducible browser coverage are provided.
- [x] User-testing and hardware limits are recorded instead of claiming unperformed checks.

## External acceptance still to record

- [ ] Physical Android Chrome and iOS Safari, including software keyboard and installed PWA safe areas.
- [ ] VoiceOver or NVDA manual reading/focus review.
- [ ] Previous supported browser versions and the Edge application itself.
- [ ] Representative users complete the five practical tasks; record confusion and resolve any critical findings.
- [ ] Production field Core Web Vitals, once real usage exists.

The current Linux browser lab cannot establish these external results. Do not interpret source completion or automated accessibility checks as those results.
