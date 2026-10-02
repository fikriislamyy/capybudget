# Shared controls and loading feedback

The in-app screens use shadcn-svelte components built on Bits UI. Keep the existing financial values, API requests, and validation rules when adding a screen.

## Controls

- `forms/choice-select.svelte`: single selection and multiple selection. Options retain their original string or number values. Empty options remain empty values. Required fields participate in form validation and focus the trigger when missing.
- `forms/date-picker.svelte`: shadcn Input plus Popover and Calendar. Supports typed ISO dates (`YYYY-MM-DD`), calendar selection, optional clearing, and minimum/maximum dates. Values sent to the API remain ISO strings.
- Use the shared Input, Textarea, Checkbox, RadioGroup, ToggleGroup, Button, Dialog, Sheet, and other UI primitives instead of creating another native control style.
- `shared/disclosure.svelte`: Bits UI Collapsible for expandable card details.
- A visually hidden native input is used inside ChoiceSelect solely for required-field validation. Inputs rendered by the UI primitives remain ordinary HTML form controls underneath.

## Password controls

`forms/password-input.svelte` provides a separate show/hide button for each password/PIN field, preserving the value and cursor. It retains autocomplete and paste support, and its button has a localized accessible name and pressed state.

`forms/password-checklist.svelte` updates the five rules while typing, with icons and text for met/unmet states and one screen-reader status summary. Signup and reset share `shared/password-policy.ts` with the API: at least one uppercase letter, lowercase letter, number, symbol (whitespace does not count), and 12 characters. The existing 128-character maximum remains. Better Auth's before hook validates newly created/reset/changed passwords; login and reauthentication are unchanged.

## Currency amount entry

### Onboarding currency selection

Step 2 uses `forms/currency-select.svelte`, a shadcn Popover with a Bits UI Command list. Search accepts currency codes, provider names, and localized English/Indonesian names. Keyboard navigation, selection checks, 44px rows, warm theme tokens, and a scrolling list preserve the app's control conventions. Continue stays disabled during loading or until the selected code is in the catalog. API failures show a retry action.

`GET /api/currencies` fetches CurrencyFreaks' public [supported-currencies endpoint](https://currencyfreaks.com/documentation#supported-currencies) server-side; no API key is required. It exposes only available three-letter fiat entries with complete names/country metadata, excluding crypto, metals, and deprecated entries. Provider cookies, icons, and financial data are never sent or fetched. Successful results cache for 24 hours; concurrent requests share one fetch. On failure, the server returns the last good list or the bundled 166-entry provider snapshot dated 2026-10-02 and waits one minute before trying again. The dropdown identifies a saved-list fallback. There is no exchange-rate conversion in this change.

### Business workspace currency and timezone

The Add business dialog reuses `forms/currency-select.svelte` from onboarding, including search by currency code/name. `forms/timezone-select.svelte` follows the same Bits UI Command/Popover pattern and searches city, region, and exact IANA identifiers such as `Asia/Jakarta`. Both controls show loading/error/retry feedback, selected indicators, and saved-list hints. The Create business action waits for both valid selections. Fields stack inside the dialog so long names remain readable on mobile.

`GET /api/timezones` requires a verified session and fetches [TimeAPI’s public available-timezones endpoint](https://www.timeapi.io/api/TimeZone/AvailableTimeZones) server-side, with a five-second timeout and no forwarded user data. Results are validated against the runtime’s timezone support, deduplicated, sorted, and cached for 24 hours. Concurrent requests share one fetch. On failure, the last good list or ICU’s built-in timezone list (including UTC) is returned; refresh retries after one minute. Workspace creation retains its existing timezone validation and stores the exact selected identifier.

`forms/amount-input.svelte` wraps the shared shadcn Input for every monetary field. The currency comes from the selected account/invoice when supplied, otherwise the active workspace. English uses `1,234.56`; Indonesian uses `1.234,56`. A currency prefix identifies the unit. Grouping appears while typing, and currency decimal padding appears on blur. Invoice quantities and tax percentages remain ordinary numeric fields.

The bound value is an exact decimal string with a dot separator and no grouping, suitable for JSON payloads. Formatting uses BigInt for the integer part and retains up to four typed fractional digits without floating-point conversion or currency rounding. Currency/language changes update the presentation without changing the value. Caret restoration, deletion next to separators, localized paste, privacy masking, and keyboard entry are handled in the shared component. Transaction edit forms now assign the stored decimal directly; their existing positive-amount validation receives the canonical decimal rather than the formatted presentation.

## Invoice status emphasis

Invoice detail uses `business/invoice-status.svelte` in the shared PageHeader’s optional metadata snippet. It replaces the former muted text status with a 44px-high status chip, a state-specific Lucide icon, a visible Status label, and one plain-language explanation. Paid uses leaf green, overdue soft coral, issued/sent/partial payment pond blue, and draft/void warm neutral styling. Copy follows English/Indonesian preferences and announces status changes politely. The status reads the existing server value; payment and delivery logic are unchanged.

This is a new invoice-specific emphasis pattern. Reuse it where a financial document’s state needs more prominence than a compact table badge. Backgrounds and text come from shared tokens. Blue labels use the primary foreground for AA text contrast on the pond tint, while the icon retains the semantic blue. The invoice header wraps its existing actions beneath the title when space is limited.

## Spacing and themes

All document and nested scrollbars use the sidebar appearance from `src/app.css`, including portaled select/popover menus, dialogs, sheets, searchable lists, report tables, and textareas. Standard scrollbar properties use a thin thumb with `--sidebar-primary` and a `--sidebar` track; WebKit styling uses 8px vertical/horizontal bars, a rounded thumb with a 2px track-colored border, a themed corner, and `--sidebar-foreground` on hover. Theme tokens supply light/Night Pond colors. Forced-colors mode restores native width/colors. Individual components keep their existing overflow, keyboard scrolling, and containment behavior; avoid local scrollbar styling that diverges from this shared rule.

`src/app.css` owns shared card, field, popup, and control spacing. Cards use 24px desktop padding and 16px mobile/business padding. Form groups use 16px gaps and individual fields use 8px gaps. Select controls, calendar buttons, and primary actions have generous touch targets.

Use semantic tokens from `tokens.css` for backgrounds, borders, text, and shadows. Popup menus are portaled outside the page, so their shared theme styles must be global. Avoid per-page border, radius, or background overrides for shared controls.

## Loading overlay

The root layout installs the request tracker and renders `shared/loading-overlay.svelte`. It covers route navigation and foreground API requests, including the configured API origin. Routine session/status polling is excluded to keep the app usable during background refreshes.

The overlay appears after 250ms. Counter updates use Svelte `untrack` so a fetch inside a page effect cannot accidentally subscribe that effect to the global request count. Concurrent operations are counted independently; it closes when all foreground operations finish. The nonmodal loading card preserves keyboard focus and page interaction. Its title/status text follows the active English or Indonesian language. After 10 seconds it explains the delay and offers a hide action; hiding feedback does not cancel requests or bypass security checks. Colors follow the current light/Night Pond theme, with reduced-motion support inherited from the app stylesheet.

For a page's loading/saving flags, use `LoadingScope active={loading || saving}`. This also covers local processing and asynchronous operations beyond an individual HTTP request. Effect cleanup removes the scope when the component unmounts.

For a long action such as a generated report export, call `trackLoading()` before starting and call its returned cleanup function in `finally`. Do not hold an overlay open for recurring background polling. Preserve existing error messages and recovery actions.

## Checks performed

Svelte diagnostics reported zero errors and zero warnings after the migration. Browser interaction tests were not run for this change.
