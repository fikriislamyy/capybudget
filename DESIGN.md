# CapyBudget: Design System & Visual Metaphor

> **Tagline:** *Stay chill with your money.*
> **Status:** v0.1 (design direction, to be validated with real screens and user testing)

---

## 1. The Core Metaphor: "The Onsen"

Capybaras are famous for one thing above all: **staying calm in warm water while everyone else (ducks, monkeys, birds) hangs out around them.** CapyBudget turns that image into the entire product metaphor.

| Real world | Product world |
|---|---|
| The hot spring (onsen) | **Your money.** Water is cash. |
| Water level | Balance, remaining budget, savings progress |
| Water temperature | Financial "mood" (cool = calm, warm = attention needed) |
| The capybara | **Capy**, the AI assistant and mascot who stays calm no matter what |
| The yuzu on Capy's head | Rewards and milestones |
| Animals sitting on Capy's back | Categories, clients, and goals that "ride along" with you |
| Steam | Gentle alerts and nudges, never sirens |
| Stepping stones and paths | Cashflow forecast (where you'll land next) |

**One-sentence rule:** *If a design decision doesn't feel like sitting in a warm pond with a calm friend, reconsider it.*

---

## 2. Capybara Traits → Design Principles

| Capybara trait | Design principle | What it looks like in the app |
|---|---|---|
| **Calm and unbothered** | Reduce financial anxiety | Soft colors, no harsh reds, slow reveals, generous whitespace |
| **Gets along with everyone** | Inclusive, non-judgmental | Friendly tone, no shaming for overspending, works for students, families, and business owners |
| **Social hub for other animals** | Everything connects to you | Categories, goals, and clients shown as small animal "friends" around Capy |
| **Loves water** | Progress is fluid | Budgets, goals, and cashflow drawn as water levels and ripples |
| **Round, sturdy, cuddly body** | Soft geometry | Large corner radii, pill buttons, rounded charts, no sharp edges |
| **Warm earthy fur** | Warm, natural palette | Cream backgrounds, brown anchors, no cold grays |
| **Slow, steady movement** | Reliable, not flashy | Springy but unhurried motion, no jarring transitions |
| **Herbivore, grazes steadily** | Small consistent habits win | Streaks, tiny recurring savings, "a little every day" framing |
| **Semi-aquatic (two habitats)** | Two modes, one identity | Personal (full playful) and Business (calmer, denser) share the same DNA |

---

## 3. Color System: Mapped to Meaning

Every color comes from something in the capybara's world. This keeps the palette memorable and gives each color a **fixed job** in the interface.

### 3.1 Primary Palette

| Token | Hex | Source in nature | Job in the UI |
|---|---|---|---|
| `capy-fur` | `#B98B5E` | Capybara fur | Brand primary, mascot, primary buttons |
| `capy-fur-deep` | `#8A5F3A` | Fur shadow | Headings, pressed states, text on cream |
| `capy-bark` | `#3B2A1E` | Wet fur, tree bark | Main text |
| `onsen-cream` | `#FFF8EC` | Warm steam and sandy bank | App background |
| `onsen-sand` | `#F3E6CF` | Riverbank | Cards, secondary surfaces |
| `pond-blue` | `#5BB8D4` | Spring water | Savings, water-level fills, links, info |
| `leaf-green` | `#6BBF59` | Grass Capy eats | Income, on-track, success |
| `yuzu-yellow` | `#FFC53D` | The yuzu on Capy's head | Rewards, streaks, highlights, gentle warnings |
| `berry-coral` | `#FF7A6B` | Berries and warm steam | Expenses, over-budget (soft, never harsh red) |

### 3.2 Financial Semantics

Keep meaning consistent everywhere (charts, lists, badges, notifications):

| Meaning | Color | Icon (never color alone) |
|---|---|---|
| Money in (income) | `leaf-green` | Leaf / up arrow |
| Money out (expense) | `berry-coral` | Berry / down arrow |
| Savings and goals | `pond-blue` | Water drop |
| Reward and streak | `yuzu-yellow` | Yuzu |
| Neutral / transfer | `capy-fur` | Two-way arrow |
| Needs attention | `yuzu-yellow` → `berry-coral` | Steam wisp (never a siren) |

### 3.3 Water Temperature Scale (budget health)

Budgets and cashflow use a **temperature gradient** instead of red/yellow/green traffic lights:

| Budget used | Water | Meaning | Capy state |
|---|---|---|---|
| 0–60% | Cool blue | Plenty of room | Relaxing, eyes closed |
| 60–85% | Warm teal-yellow | On track, keep an eye out | Content, watching |
| 85–100% | Warm coral | Getting close | Sitting up, alert |
| >100% | Deep coral, gentle steam | Over, time to adjust | Slightly worried, with a helpful suggestion |

### 3.4 Text-Safe Variants (accessibility)

Light fills like `leaf-green` and `pond-blue` do **not** have enough contrast for body text on cream. Use darker "ink" variants for text and keep the bright versions for fills, icons, and charts.

| Purpose | Suggested text tone |
|---|---|
| Green text | `#2F7A2A` |
| Blue text | `#1F7A96` |
| Coral text | `#C7473A` |
| Yellow text | Do not use as text. Use `capy-fur-deep` on a yellow fill. |

> **Action item:** verify every text/background pair against WCAG AA (4.5:1 for body text, 3:1 for large text and UI components) with a contrast checker before finalizing.

### 3.5 Dark Mode: "Night Pond"

| Token | Hex | Notes |
|---|---|---|
| `night-bg` | `#2A211B` | Warm dark brown, never pure black |
| `night-surface` | `#372C24` | Cards |
| `night-text` | `#FFF1DC` | Warm off-white |
| Accents | Same hues, slightly desaturated | Avoid glowing neon on dark |

Fireflies and a moon can appear in dark-mode illustrations. Same pond, different time of day.

---

## 4. Visual Elements of the Metaphor

### 4.1 Budgets as Ponds

Each budget category is a small pond with a **water level** that drains as you spend.
- Full pond = untouched budget
- Level drops smoothly when a transaction is added (animated)
- Water color follows the temperature scale (section 3.3)
- Tiny ripple when the level changes

### 4.2 Savings Goals as Onsen Pools

- Empty pool at the start, slowly filling toward the goal
- Goal hit = steam rises, Capy sinks in happily, yuzu confetti
- Goal deadline shown as a soft sun or moon position (optional)

### 4.3 Categories as Animal Friends

Small animals sit on or around Capy. They serve as category icons.

| Category | Friend (suggested) |
|---|---|
| Food and dining | Duck |
| Transport | Turtle |
| Shopping | Monkey |
| Bills and utilities | Heron (patient, punctual) |
| Entertainment | Parrot |
| Health | Frog |
| Savings | Fish |
| Business clients | Small otter with a briefcase |

Users can also create custom categories with emoji or pick from an icon set.

### 4.4 Cashflow Forecast as Stepping Stones

The AI forecast is drawn as a **path of stepping stones across the pond**:
- Each stone is an upcoming event (rent, salary, invoice due)
- Stone size = amount
- A gap between stones means a potential shortfall, with Capy offering a bridge (suggestion)

### 4.5 Yuzu as the Reward Currency

- Earned for streaks, on-budget months, and goals reached
- Shown as a small counter, not a "score" that pressures users
- Never converts to real money or creates financial pressure

### 4.6 Steam as Notifications

- Alerts appear as soft steam wisps, not red badges
- Urgent items (fraud, overdue payments) use clearer, more direct styling
- Playfulness scales **down** as seriousness scales up

---

## 5. Mascot: Capy

### 5.1 Character Sheet

- **Personality:** calm, kind, quietly clever. Never panics, never lectures.
- **Shape language:** rounded rectangle body, small round ears, sleepy but warm eyes, tiny smile
- **Signature accessory:** the yuzu (always present, tilts with mood)
- **Voice:** short, warm sentences, light humor, plain language

### 5.2 State Map

| App situation | Capy state |
|---|---|
| Healthy finances | Soaking, eyes closed, yuzu balanced |
| Nearing a limit | Sits up, one eye open |
| Over budget | Gentle worry, sweat drop, a helpful tip bubble |
| Goal achieved | Celebrating, yuzu confetti |
| No activity for days | Sleeping, "zzz" |
| AI thinking | Munching a leaf, or slow blink |
| Loading | Ripple animation, yuzu bobbing |
| Empty state | Napping, "Nothing here yet. Add your first transaction?" |
| Business mode | Wears round glasses, holds a tiny notepad |
| Error | Confused head tilt, "Something went wrong. Try again?" |

### 5.3 Rules

1. Capy never blames the user.
2. Capy is decoration, not a replacement for clear information. Numbers always appear in plain text.
3. Capy can be hidden or minimized in settings.
4. Commission an **original** illustration and avoid resembling existing characters.

---

## 6. Typography

| Role | Font | Notes |
|---|---|---|
| Display / headings | **Fredoka** (alt: Baloo 2) | Rounded, friendly, matches the pill and pond shapes |
| Body / UI | **Nunito** (alt: Quicksand) | Rounded but highly readable at small sizes |
| Numbers | Nunito with `font-variant-numeric: tabular-nums` | Aligned columns, easy scanning |
| Monospace (business tables, IDs) | JetBrains Mono or system mono | Sparingly |

**Guidelines**
- Money amounts are the **largest and boldest** element on any card.
- Show the currency symbol with lower visual weight than the number.
- Self-host fonts in the Docker build.
- Scale: 12 / 14 / 16 / 20 / 24 / 32 / 40 px. Body minimum 14px, 16px preferred on mobile.

---

## 7. Shape, Space, and Depth

| Property | Value | Rationale |
|---|---|---|
| Corner radius (cards) | 20px | Pebble-like softness |
| Corner radius (inputs, chips) | 14px | Friendly but precise |
| Buttons | Fully rounded (pill) | Like smooth river stones |
| Borders | 2px, warm tone (`onsen-sand` or slightly darker) | "Sticker" feel |
| Shadows | Soft, warm-tinted, low opacity | No cold gray shadows |
| Spacing unit | 4px base, 8/12/16/24/32 scale | Generous and calm |
| Touch targets | Minimum 44×44px | Mobile ergonomics |
| Layout density | Personal: comfortable. Business: compact option | Different needs, same style |

---

## 8. Motion Language

**Motion feel: "gentle spring."** Bouncy enough to feel alive, slow enough to feel calm.

| Interaction | Motion |
|---|---|
| Button press | Small squish (scale ~0.96) with spring return |
| Adding a transaction | Bottom sheet rises with a soft spring |
| Balance change | Digits roll, pond level animates |
| Budget drain | Water level lowers with a small ripple |
| Goal hit | Steam plus yuzu confetti, Capy celebrates |
| List add/remove | FLIP layout animation (`svelte/animate`) |
| Swipe to delete | Springy release with a soft "plop" feel |
| Page transitions | Short fade and slide (150–250ms) |
| Idle Capy | Occasional blink, ear twitch, yuzu wobble |

**Rules**
- Always honor `prefers-reduced-motion` (replace movement with simple fades).
- No motion that delays a financial action.
- Keep animations under ~400ms unless they're celebratory.
- Store motion values (durations, spring stiffness/damping) in one tokens file so they can be tuned globally.

**Suggested tech:** Svelte transitions and `spring`/`tweened` for UI, Rive or Lottie for Capy's states.

---

## 9. Voice and Microcopy

### 9.1 Tone Principles

- **Calm, not cutesy.** One light touch per message at most.
- **Specific, not vague.** Always give the number and the next step.
- **Encouraging, never shaming.**
- **Simple language.** No jargon without a plain explanation.

### 9.2 Before / After

| Cold / Anxious | CapyBudget |
|---|---|
| "Warning: budget exceeded by 23%." | "Food's running a little warm this month 🍜. Want me to find a few places to trim?" |
| "Cashflow shortfall detected." | "Heads up: rent lands on the 1st and your balance will be tight. Here are 2 easy ways to smooth it out." |
| "No data available." | "Capy's napping. Add your first transaction to wake them up." |
| "Invoice overdue." | "Invoice #21 is 5 days late. Want me to draft a friendly reminder?" |

### 9.3 Tone Setting

Offer a user setting: **Playful / Balanced / Professional**. Business users often prefer Balanced or Professional.

### 9.4 Serious Moments Override

For fraud alerts, security events, tax deadlines, and legal notices, use **clear, direct language** with minimal decoration. Keep the warm tone but drop the jokes and mascot animations.

---

## 10. Two Modes, One Identity

| Aspect | Personal ("Pond Mode") | Business ("Studio Mode") |
|---|---|---|
| Mascot | Prominent, animated | Small, in corners and empty states |
| Illustrations | Full onsen scenes | Minimal spot illustrations |
| Density | Comfortable | Compact, table-friendly |
| Gamification | Streaks, yuzu, badges | Minimal (optional) |
| Charts | Rounded, colorful, water-themed | Cleaner, more axis and label detail |
| Copy | Playful by default | Balanced by default |
| Documents (invoices, reports) | n/a | **Professional and neutral**, with only a small logo and accent color |

Implementation: a single attribute (for example `data-mode="business"`) swaps token values. Colors, fonts, and core shapes stay the same, so the brand stays recognizable.

> **Important:** invoices, PDFs, and exported reports may be seen by third parties. Keep them clean, and never put the mascot front and center unless the user opts in.

---

## 11. Component Guidelines

### Buttons
- Primary: `capy-fur` fill, white text, pill shape
- Secondary: `onsen-sand` fill, `capy-fur-deep` text
- Destructive: soft coral with a confirm step (no aggressive red)
- Loading state: yuzu bobbing inside the button

### Cards
- `onsen-sand` or white on cream, 20px radius, 2px warm border
- Money amount is the hero element

### Inputs
- 14px radius, generous padding, clear labels above (not placeholder-only)
- Amount input uses a large numeric keypad experience on mobile

### Bottom Sheet (Quick Add)
- The primary entry point: amount → category (animal friend) → done
- Target: log a transaction in under 5 seconds

### Charts
- Rounded bar ends, soft gradients, palette from section 3
- Cashflow: line with stepping-stone markers for future events
- Always provide labels and a table alternative for accessibility

### Toasts and Alerts
- Steam-style, calm entrance, auto-dismiss for low priority
- Persistent and clear for high priority

### Empty States
- Always illustrated with Capy, one sentence, one clear action

---

## 12. Design Tokens (Starter)

```css
:root {
  /* Brand */
  --capy-fur: #B98B5E;
  --capy-fur-deep: #8A5F3A;
  --capy-bark: #3B2A1E;
  --onsen-cream: #FFF8EC;
  --onsen-sand: #F3E6CF;

  /* Semantic fills */
  --pond-blue: #5BB8D4;
  --leaf-green: #6BBF59;
  --yuzu-yellow: #FFC53D;
  --berry-coral: #FF7A6B;

  /* Text-safe variants */
  --text-green: #2F7A2A;
  --text-blue: #1F7A96;
  --text-coral: #C7473A;

  /* shadcn-svelte mapping */
  --background: var(--onsen-cream);
  --foreground: var(--capy-bark);
  --card: #FFFFFF;
  --card-foreground: var(--capy-bark);
  --primary: var(--capy-fur);
  --primary-foreground: #FFFFFF;
  --secondary: var(--onsen-sand);
  --secondary-foreground: var(--capy-fur-deep);
  --accent: var(--yuzu-yellow);
  --accent-foreground: var(--capy-fur-deep);
  --destructive: var(--berry-coral);
  --border: #E6D5B8;
  --ring: var(--pond-blue);

  /* Shape */
  --radius: 1.25rem;

  /* Type */
  --font-heading: "Fredoka", ui-rounded, system-ui, sans-serif;
  --font-body: "Nunito", ui-rounded, system-ui, sans-serif;

  /* Motion */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --dur-fast: 150ms;
  --dur-base: 250ms;
  --dur-slow: 400ms;
}

:root[data-theme="dark"] {
  --background: #2A211B;
  --foreground: #FFF1DC;
  --card: #372C24;
  --card-foreground: #FFF1DC;
  --secondary: #443729;
  --border: #52422F;
}

:root[data-mode="business"] {
  --radius: 0.875rem;   /* slightly tighter */
  /* denser spacing and calmer illustration set applied at component level */
}

@media (prefers-reduced-motion: reduce) {
  :root { --dur-fast: 0ms; --dur-base: 0ms; --dur-slow: 0ms; }
}
```

---

## 13. Accessibility Checklist

- [ ] All text and UI pairs meet WCAG AA contrast
- [ ] Color is never the only carrier of meaning (icons and labels accompany it)
- [ ] `prefers-reduced-motion` respected everywhere
- [ ] Touch targets ≥ 44px
- [ ] Screen-reader labels for mascot, charts, and pond levels ("Food budget: 62% remaining")
- [ ] Charts have table or text alternatives
- [ ] Text scales with system font size settings
- [ ] Mascot and playful elements can be turned off

---

## 14. Do and Don't

| Do | Don't |
|---|---|
| Make numbers the clearest thing on screen | Bury amounts under decoration |
| Use warm, soft, rounded shapes | Mix in sharp corporate or neon styles |
| Encourage with specific next steps | Shame, scare, or nag |
| Scale playfulness down for serious moments | Joke during fraud or tax alerts |
| Let users tone down or hide Capy | Force the mascot on business users |
| Keep exported documents professional | Put cartoons on client invoices |
| Use one gentle animation per event | Stack confetti, shakes, and popups |

---

## 15. Asset Checklist (for the illustrator / designer)

- [ ] Capy master character, front, side, and 3/4 views
- [ ] Capy state set (section 5.2), around 10 poses
- [ ] Animal friend icon set (8–12 categories)
- [ ] Yuzu, leaf, water drop, steam, and ripple icons
- [ ] Onsen pool and pond level illustrations (light and dark)
- [ ] Empty-state illustrations (transactions, budgets, goals, invoices, reports)
- [ ] App icon and logo lockups (with and without wordmark)
- [ ] Business-mode Capy variant (glasses and notepad)
- [ ] Seasonal outfits (optional, e.g., Ramadan/Lebaran, New Year, rainy season)
- [ ] Rive or Lottie files for key animations

---

## 16. Open Questions

1. Final mascot art direction: flat vector, soft 3D, or hand-drawn?
2. Target markets and localization: currency formatting, Bahasa microcopy, and seasonal themes?
3. How much gamification is right, and do business users want any?
4. Should the AI assistant have its own name, or is it simply "Capy"?
5. Trademark check on the "CapyBudget" name and mascot before launch.

---

*This document is a living guide. Update it as real screens, user feedback, and accessibility testing come in.*