# CapyBudget: calm in-app visual system

## Scope

This pass changes presentation and existing navigation affordances. Financial calculations, auth, API calls, data models, routes, and document generators retain their existing behavior. Marketing and app screens inherit `apps/web/src/tokens.css` through `app.css`.

## Everyday use

- Page headings use Fredoka at 26–32px; panel headings use 18px. Numbers use Nunito with tabular numerals and heavier weight.
- Personal cards use 20px corners. Business workspaces inherit `--radius: 0.875rem`, 14px card corners, 16px card padding, and denser tables.
- Buttons remain pills; inputs use 14px corners. Existing actions stay visible, with at least 44px controls.
- Income uses green, expenses coral, savings blue, and caution yellow. Budget percentage labels accompany the cool/warm/coral fill. Goals use blue pool progress.
- Capy stays small near actual data. Empty states use a napping pose; completed goals can use a small celebration. Business contexts add glasses/notepad and reduce contextual illustration size.
- Data regions have clean surfaces. Business/reporting screens use no scroll reveals. Progress changes and routine status messages use short spring/steam transitions; reduced motion suppresses movement.

## Contrast decision

White on the prescribed fur fill `#B98B5E` is approximately 3.04:1, below AA even for large text. Bark text on that same fill is 4.50:1. Primary buttons therefore retain the brand fill with bark text, matching the actual landing page. Expense tiles use a lighter tint so the exact `--text-coral` remains readable. Warm input borders remain darker than decorative card borders for control visibility.

## Existing screen coverage

| Screen family | Treatment |
| --- | --- |
| Onboarding | Warm cards, labeled selectors, numbered progress, compact account setup |
| Dashboard | Numbers first; small Capy; clean balance card and semantic income/expense tiles |
| Transactions / quick-add | Category accents, clear sign/type indicators, touch-friendly sheets and actions |
| Accounts / categories / recurring | Consistent cards, lists, labeled fields, existing edit/archive controls |
| Budgets / goals / bills | Pond progress and textual state, blue savings, existing contribution/payment controls |
| Invoices / business profile | Compact tables/forms; labeled invoice statuses; existing PDF export |
| Reports | Brand chart palette, matching chart fonts/tooltips, dense data tables, existing exports |
| Assistant | Suggestion bubbles, visible existing reasoning, existing confirmation/snooze/dismiss controls |
| Settings / notifications | Compact preference/security cards and existing toggles/actions |
| Navigation | Warm active indicators, mobile bottom navigation, business-aware sidebar |

## Proposed patterns — not new functionality

These requested screens or affordances are absent from the current app. No dummy routes, controls, financial data, or APIs have been added.

- **Customer/vendor directory (proposed):** a compact searchable table with name, type, and contact details; a labeled detail card; existing account/invoice typography and business density. Implement its data feature separately before publishing the screen.
- **Conversational AI chat (proposed):** small Capy avatar, compact bubbles, a keyboard-accessible composer, and an expandable explanation for suggestions. Today's assistant retains its actual forecast and suggestion cards; it is not represented as a functioning chat.
- **Inline PDF preview (proposed):** a neutral document panel using the existing PDF output, with a download fallback. Existing PDF export works through its current controls; no new document generation or embedding behavior is introduced.
- **Quick-add photo capture (proposed):** a labeled attachment control once that flow is implemented. Current attachments remain in the existing full transaction form reached from quick-add.
- **State illustration variants (new presentation pattern):** decorative `state` on the shared Capy SVG; no financial behavior. Unused poses remain available for future screens rather than inventing new financial states.

Exported invoice PDFs and report files are not restyled in this pass and receive no mascot artwork.

## Verification

- Svelte checking: 0 errors and 0 warnings. Production build passed.
- Browser audit: 20 existing routes × light/dark × mobile/desktop = 80 rendered checks, with no automated WCAG AA violations or horizontal overflow.
- Quick-add: four personal/business and light/dark cases passed automated accessibility checks. Visible overlay controls meet the 44×44px target; the close button was enlarged after measurement.
- Representative screens and the quick-add overlay were visually inspected. Audits used an isolated local fixture database and did not submit financial actions.

Automated scans cover rendered states, not every possible error, financial state, hardware biometric flow, or assistive technology interaction. Manual screen-reader and real-device acceptance remain separate checks.
