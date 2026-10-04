# Graph Report - capybudget  (2026-10-04)

## Corpus Check
- 570 files · ~569,647 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 73 file(s) not represented in the graph (top: .csv 53, .Identifier 7, (none) 6)

## Summary
- 4050 nodes · 7183 edges · 261 communities (194 shown, 67 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 70 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fdf2a619`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Money
- loading-scope.svelte
- schema.ts
- scripts/core.py
- validate_data.py
- _run
- utils.ts
- gray
- dependencies
- business/worker.ts
- toUnits
- scripts
- slide_search_core.py
- Tailwind CSS Utility Reference
- CapyBudget: Design System & Visual Metaphor
- business/routes.ts
- reports/routes.ts
- ref_node_crypto
- Brand Guidelines v1.0
- client
- Design
- Canvas Design System
- assistant/routes.ts
- scripts
- Form & Input Components
- Tailwind CSS Responsive Design
- 6. Step-by-step implementation
- Typography Specifications
- design_system.py
- web/package.json
- Logo Usage Rules
- Component Specifications
- html-token-validator.py
- shadcn/ui Accessibility Patterns
- TestTailwindConfigGenerator
- cip/core.py
- api/package.json
- exports.ts
- Asset Approval Checklist
- Logo AI Prompt Engineering
- tracking/routes.ts
- Color Palette Management
- CIP Deliverable Guide
- States and Variants
- UI Styling Skill
- fetch-background.py
- generate-slide.py
- [invoiceId]/+page.svelte
- Workflow
- []
- Design System
- Tailwind CSS Customization
- render-html.py
- spacing
- TailwindConfigGenerator
- CapyBudget: Recommended Features
- TestWebStackFreshness
- assistant/+page.svelte
- AWS EC2 free-tier VPS setup for CapyBudget
- Routing by Task Type
- shadcn/ui Theming & Customization
- ref_postgres
- Asset Organization Guide
- Primary Color Meanings
- Core Logo Types
- operations/backup.ts
- color
- DesignSystemGenerator
- Core tracking V2
- Brand Consistency Checklist
- CIP Mockup Prompt Engineering
- Color Semantics
- select/index.ts
- devDependencies
- components.json
- dependencies
- BM25
- Design Principles
- Design Principles
- generate_cip_set
- fontSize
- TestShadcnInstaller
- CapyBudget User Guide
- extract-colors.cjs
- CIP Design Reference
- Icon Design Reference
- Copywriting Formulas
- Copywriting Formulas
- TestGeneratedConfigIsValidJs
- assistant-benchmark.ts
- generate_design_system
- CatalogRefreshTest
- Banner Design - Multi-Format Creative Banner System
- Messaging Framework
- Brand Voice Framework
- svelte
- validate-asset.cjs
- Layout Patterns
- Tailwind Integration
- radius
- Layout Patterns
- CapyBudget deployment: local Jenkins → one VPS
- sheet-content.svelte
- CapyBudget: Product Requirements Document (PRD)
- update.md
- Logo Design Reference
- icon/generate.py
- Token Architecture
- design-tokens-starter.json
- bits-ui
- TestDomainDetection
- BM25
- personal-finance/routes.ts
- compilerOptions
- Primitive Tokens
- embed-tokens.cjs
- validate-tokens.cjs
- card
- ShadcnInstaller
- TestSearchDomains
- Core Visual Elements
- inject-brand-context.cjs
- CIP Design Style Guide
- TestNativeDesktopStackFreshness
- Quick Reference
- provider.ts
- sync-brand-to-tokens.cjs
- Brand
- Slide Strategies
- Component Tokens
- generate-tokens.cjs
- button
- duration
- Slide Strategies
- ux/routes.ts
- scheduler.ts
- notifications/routes.ts
- compilerOptions
- persist_design_system
- BM25
- 6. Functional Requirements
- v2/worker.ts
- privacy.ts
- onboarding.ts
- 18. Protect your account and data
- input
- ui-ux-pro-max
- Prerequisites
- CapyBudget
- Shared controls and loading feedback
- CapyBudget: calm in-app visual system
- 9. Non-Functional Requirements
- Slides Reference
- HTML Slide Template
- HTML Slide Template
- calendar-caption.svelte
- debts/+page.svelte
- Security and privacy MVP — issue 13
- assistant/types.ts
- Pre-Delivery Checklist
- Query Contract
- api.ts
- 15. Use Capy, your cashflow assistant
- 14. Release Plan
- Brand Guidelines Template
- $type
- radius
- lg
- sm
- test_design_system_mode.py
- Common Rules for Professional UI
- Example Workflow
- scripts
- UI/UX refresh baseline — issue #16
- 1. Overview
- 8. AI Requirements (Detail)
- padding-y
- xl
- none
- Tips for Better Results
- logo/search.py
- TestTokenizer
- 14. Create and manage invoices
- 20. A simple daily and weekly routine
- 5. Record income and expenses
- 16
- 1
- 3
- 8
- destructive
- destructive-foreground
- muted
- primary-foreground
- ring
- secondary-foreground
- dev.ts
- app.d.ts
- 12. Manage bills and due dates
- 1. Start here
- 7. Organize categories and tags
- 8. Find and correct transactions
- 13. Success Metrics
- 19. Appendix
- 2. Goals and Non-Goals
- AGENTS.md
- slides-create.md
- create.md
- refresh.spec.ts
- test_relevance_evaluator.py
- i18n/auth.ts
- TestBm25CoreBehavior
- rate-limit.ts
- categorization.ts
- test_text_layout_resilience.py
- button/index.ts
- loading.svelte.ts
- TestStyleTaxonomy
- Included in this change
- TestThresholdGate
- devDependencies
- Start
- 13. Keep business finances separate
- deletion-receipt/+page.svelte
- CapyBudget email design
- deploy.sh
- scope.ts
- formatDate

## God Nodes (most connected - your core abstractions)
1. `client` - 60 edges
2. `TailwindConfigGenerator` - 58 edges
3. `TestTailwindConfigGenerator` - 35 edges
4. `DesignSystemGenerator` - 35 edges
5. `ShadcnInstaller` - 34 edges
6. `[]` - 33 edges
7. `scripts` - 30 edges
8. `businessRoutes` - 28 edges
9. `q()` - 28 edges
10. `Money` - 27 edges

## Surprising Connections (you probably didn't know these)
- `Off-host S3 backup destination` --references--> `ensureBackupBucket()`  [INFERRED]
  docs/deployment-jenkins.md → apps/api/src/privacy/tombstones.ts
- `Available Domains` --references--> `ux()`  [INFERRED]
  .agents/skills/ui-ux-pro-max/SKILL.md → apps/web/src/routes/(app)/invoices/new/+page.svelte
- `How to Use This Skill` --references--> `ux()`  [INFERRED]
  .agents/skills/ui-ux-pro-max/SKILL.md → apps/web/src/routes/(app)/invoices/new/+page.svelte
- `Rule Categories by Priority` --references--> `ux()`  [INFERRED]
  .agents/skills/ui-ux-pro-max/SKILL.md → apps/web/src/routes/(app)/invoices/new/+page.svelte
- `Step 3: Supplement with Detailed Searches (as needed)` --references--> `ux()`  [INFERRED]
  .agents/skills/ui-ux-pro-max/SKILL.md → apps/web/src/routes/(app)/invoices/new/+page.svelte

## Import Cycles
- None detected.

## Communities (261 total, 67 thin omitted)

### Community 0 - "Money"
Cohesion: 0.18
Nodes (33): budgetMethodRoutes, detail(), funding(), label(), nonnegative(), percentages(), debtRoutes, label() (+25 more)

### Community 1 - "loading-scope.svelte"
Cohesion: 0.14
Nodes (9): load(), send(), displayAmount, sign, messages, load(), send(), load() (+1 more)

### Community 2 - "schema.ts"
Cohesion: 0.02
Nodes (93): accountDeletionRequests, accounts, aiInvocations, assistantAccountSettings, assistantActionProposals, assistantRefreshState, assistantSettings, assistantSuggestions (+85 more)

### Community 3 - "scripts/core.py"
Cohesion: 0.06
Nodes (31): BM25, _contains_phrase(), detect_domain(), _domain_keywords(), _exact_match_diagnostic(), _exact_row_identity(), _exact_stack_identifier(), _file_signature() (+23 more)

### Community 4 - "validate_data.py"
Cohesion: 0.07
Nodes (42): read_rows(), TestAccessibilityGuidance, TestChartsTypographyAndIcons, TestCurrentReactGuidance, TestSemanticColors, _catalog_date(), _check_app_interface_contract(), _check_catalog_contract() (+34 more)

### Community 5 - "_run"
Cohesion: 0.29
Nodes (3): _run(), test_flags_hardcoded_hex_sharing_line_with_token(), test_token_only_line_reports_no_violation()

### Community 6 - "utils.ts"
Cohesion: 0.07
Nodes (4): children(), WithElementRef, WithoutChild, WithoutChildren

### Community 7 - "gray"
Cohesion: 0.05
Nodes (53): $type, $value, $type, $value, $type, $value, $type, $value (+45 more)

### Community 8 - "dependencies"
Cohesion: 0.09
Nodes (23): dependencies, archiver, @aws-sdk/client-s3, @aws-sdk/lib-storage, better-auth, bullmq, csv-parse, decimal.js (+15 more)

### Community 9 - "business/worker.ts"
Cohesion: 0.10
Nodes (32): connection, queue, links, dispatchInvoiceDeliveries(), loadInvoiceDelivery(), markInvoiceDeliveryAccepted(), markInvoiceDeliveryFailed(), markInvoiceReminderFailed() (+24 more)

### Community 10 - "toUnits"
Cohesion: 0.23
Nodes (18): BacktestObservation, PERCENT_DENOMINATOR_FLOOR, summarizeBacktest(), hasUnresolvedSourceOverlap(), projectCashflow(), historicalDailyAverages, ceilDivide(), fromUnits() (+10 more)

### Community 11 - "scripts"
Cohesion: 0.08
Nodes (24): scripts, assistant:query-plans, assistant:redis-persistence, backtest:assistant, benchmark:assistant, check, db:cleanup-auth, db:fresh (+16 more)

### Community 12 - "slide_search_core.py"
Cohesion: 0.11
Nodes (16): format_context(), format_result(), main(), calculate_pattern_break(), detect_domain(), get_background_config(), get_color_for_emotion(), get_layout_for_goal() (+8 more)

### Community 13 - "Tailwind CSS Utility Reference"
Cohesion: 0.05
Nodes (43): Arbitrary Values, Aspect Ratio, Background Colors, Border Color, Border Radius, Border Style, Border Width, Borders (+35 more)

### Community 14 - "CapyBudget: Design System & Visual Metaphor"
Cohesion: 0.05
Nodes (42): 10. Two Modes, One Identity, 11. Component Guidelines, 12. Design Tokens (Starter), 13. Accessibility Checklist, 14. Do and Don't, 15. Asset Checklist (for the illustrator / designer), 16. Open Questions, 1. The Core Metaphor: "The Onsen" (+34 more)

### Community 15 - "business/routes.ts"
Cohesion: 0.17
Nodes (34): addMoney(), CalculatedLine, calculateInvoice(), compareMoney(), currencyScale(), format(), InvoiceLineInput, mulToCurrency() (+26 more)

### Community 16 - "reports/routes.ts"
Cohesion: 0.07
Nodes (58): Doc, escape(), Line, renderInvoicePdf(), appLink(), codeCard(), detailCard(), emailLayout (+50 more)

### Community 17 - "ref_node_crypto"
Cohesion: 0.17
Nodes (25): decryptPushAuth(), encryptPushAuth(), key(), PushScope, scopedContext(), fieldContext(), protectedContact(), protectedJson() (+17 more)

### Community 18 - "Brand Guidelines v1.0"
Cohesion: 0.05
Nodes (37): 1. Color Palette, 2. Typography, 3. Logo Usage, 4. Voice & Tone, 5. Imagery Guidelines, 6. Design Components, Accessibility, AI Image Generation (+29 more)

### Community 19 - "client"
Cohesion: 0.16
Nodes (23): app, clientIpForRequest(), trustedProxyHops, trustedProxyIps, auth, consumeAuthRateLimit(), client, db (+15 more)

### Community 20 - "Design"
Cohesion: 0.06
Nodes (35): Banner Design (Built-in), Banner: Design Rules, Banner: Quick Size Reference, Banner: Top Art Styles, Banner: Workflow, CIP Design (Built-in), CIP: Generate Brief, CIP: Generate Mockups (+27 more)

### Community 21 - "Canvas Design System"
Cohesion: 0.06
Nodes (35): 1. Visual Communication First, 2. Minimal Text Integration, 3. Expert Craftsmanship, 4. Systematic Patterns, Analog Meditation, Approach, Canvas Boundaries, Canvas Design System (+27 more)

### Community 22 - "assistant/routes.ts"
Cohesion: 0.16
Nodes (24): hashAssistantActionPayload(), isValidActionPayloadHash(), ASSISTANT_QUEUE, enqueueAssistantForecastRun(), getQueue(), scheduleAssistantForecastRefresh(), asJson(), assistantRoutes (+16 more)

### Community 23 - "scripts"
Cohesion: 0.06
Nodes (35): engines, bun, name, private, scripts, backtest:assistant, backup:create, benchmark:assistant (+27 more)

### Community 24 - "Form & Input Components"
Cohesion: 0.06
Nodes (32): Accordion, Alert, Alert Dialog, Avatar, Badge, Button, Card, Checkbox (+24 more)

### Community 25 - "Tailwind CSS Responsive Design"
Cohesion: 0.06
Nodes (32): 1. Mobile-First Design, 2. Consistent Breakpoint Usage, 3. Test at Breakpoint Boundaries, 4. Use Container for Content Width, 5. Progressive Enhancement, 6. Avoid Too Many Breakpoints, Best Practices, Breakpoint System (+24 more)

### Community 26 - "6. Step-by-step implementation"
Cohesion: 0.06
Nodes (28): External acceptance still to record, Implementation acceptance, Issue #16 route and acceptance checklist, Acceptance requiring external evidence, Delivered, Issue #16 implementation handoff, Measurements and visual evidence, Reproduce (+20 more)

### Community 27 - "Typography Specifications"
Cohesion: 0.06
Nodes (30): Accessibility, Base System, Best Practices, Clean & Modern, Common Font Pairings, Contrast Requirements, CSS Implementation, Editorial (+22 more)

### Community 28 - "design_system.py"
Cohesion: 0.05
Nodes (7): load_env(), format_brief(), format_results(), main(), main(), format_output(), TestDiagnosticsContracts

### Community 29 - "web/package.json"
Cohesion: 0.07
Nodes (28): better-auth, postgres, typescript, name, private, type, @capybudget/api, cn (+20 more)

### Community 30 - "Logo Usage Rules"
Cohesion: 0.07
Nodes (28): Absolute Don'ts, Approved Backgrounds, Before Using Logo, Clear Space, Co-branding, Color Rules, Color Usage, Color Variants (+20 more)

### Community 31 - "Component Specifications"
Cohesion: 0.07
Nodes (28): Alert, Anatomy, Anatomy, Anatomy, Anatomy, Anatomy, Badge, Button (+20 more)

### Community 32 - "html-token-validator.py"
Cohesion: 0.12
Nodes (12): get_context(), is_allowed_exception(), is_allowed_rgba(), is_inside_block(), load_css_variables(), main(), print_result(), print_summary() (+4 more)

### Community 33 - "shadcn/ui Accessibility Patterns"
Cohesion: 0.07
Nodes (28): Accordion, Alert, ARIA Labels, Checkbox and Radio, Color Contrast, Command Palette Navigation, Component-Specific Patterns, Dialog/Modal Navigation (+20 more)

### Community 35 - "cip/core.py"
Cohesion: 0.10
Nodes (11): detect_domain(), get_cip_brief(), _load_csv(), search(), search_all(), _search_csv(), detect_domain(), _load_csv() (+3 more)

### Community 36 - "api/package.json"
Cohesion: 0.06
Nodes (41): exports, better-auth, postgres, typescript, name, private, type, amount() (+33 more)

### Community 37 - "exports.ts"
Cohesion: 0.20
Nodes (12): deletionPreview(), eraseSubject(), requestDeletion(), runDeletion(), archiveContext(), privacyArchive(), runPrivacyExport(), exportRecord() (+4 more)

### Community 38 - "Asset Approval Checklist"
Cohesion: 0.08
Nodes (25): Accessibility, Archival, Asset Approval Checklist, Automation Support, Color Compliance, Common Issues & Fixes, Content Accessibility, Content Quality (+17 more)

### Community 39 - "Logo AI Prompt Engineering"
Cohesion: 0.08
Nodes (25): Common Pitfalls, Core Prompt Structure, Detailed Brief, Eco/Sustainable, Effective Keywords by Style, Fashion Brand, Healthcare, Industry-Specific Prompts (+17 more)

### Community 40 - "tracking/routes.ts"
Cohesion: 0.22
Nodes (27): Actor, actorFor(), audit(), decimal(), dirtyUnusualBaselines(), fail(), Input, learnCategory() (+19 more)

### Community 41 - "Color Palette Management"
Cohesion: 0.08
Nodes (24): Accessibility Requirements, Brand Compliance Validation, Checking Contrast, Color Documentation Format, Color Extraction, Color Palette Examples, Color Palette Management, Color System Structure (+16 more)

### Community 42 - "CIP Deliverable Guide"
Cohesion: 0.08
Nodes (24): Apparel, Business Card, Car/Sedan, CIP Deliverable Guide, Core Identity, Digital Assets, Email Signature, Envelope (+16 more)

### Community 43 - "States and Variants"
Cohesion: 0.08
Nodes (24): Accessibility, Accessibility Requirements, ARIA States, Color Contrast, Color Variants, Disabled States, Error Messages, Error States (+16 more)

### Community 44 - "UI Styling Skill"
Cohesion: 0.08
Nodes (24): Accessibility Patterns, Alternative: Tailwind-Only Setup, Best Practices, Common Patterns, Component Layer: shadcn/ui, Component Library Guide, Component + Styling Setup, Core Stack (+16 more)

### Community 45 - "fetch-background.py"
Cohesion: 0.16
Nodes (9): generate_css_for_background(), get_background_image(), get_curated_images(), get_overlay_css(), get_pexels_search_url(), load_backgrounds_config(), load_brand_colors(), main() (+1 more)

### Community 46 - "generate-slide.py"
Cohesion: 0.13
Nodes (11): _e(), generate_chart_slide(), generate_cta_slide(), generate_deck(), generate_metrics_slide(), generate_problem_slide(), generate_solution_slide(), generate_testimonial_slide() (+3 more)

### Community 47 - "[invoiceId]/+page.svelte"
Cohesion: 0.14
Nodes (5): words, dateToday(), id, load(), ux()

### Community 48 - "Workflow"
Cohesion: 0.08
Nodes (23): Art Direction Styles (Reuse from Banner), Color & Contrast, Design Best Practices, HTML Design Rules, HTML Template Structure, Option A: Chrome Headless CLI (Recommended — zero dependencies), Option B: chrome-devtools skill, Option C: Playwright script (+15 more)

### Community 49 - "[]"
Cohesion: 0.12
Nodes (20): securityRequest(), [], busy, code, device(), enable(), error, factor() (+12 more)

### Community 50 - "Design System"
Cohesion: 0.09
Nodes (22): Best Practices, Chart.js Integration, Command, Component Spec Pattern, Contextual Decision Flow, Decision System CSVs, Design System, Integration (+14 more)

### Community 51 - "Tailwind CSS Customization"
Cohesion: 0.09
Nodes (22): @apply Directive, Best Practices, Color Customization, Complete Tailwind Config, Configuration Examples, Content Configuration, Custom Color Palette, Custom Font Sizes (+14 more)

### Community 52 - "render-html.py"
Cohesion: 0.21
Nodes (4): generate_html(), get_deliverable_info(), get_image_base64(), main()

### Community 53 - "spacing"
Cohesion: 0.09
Nodes (22): $type, $value, $type, $value, $type, $value, $type, $value (+14 more)

### Community 55 - "CapyBudget: Recommended Features"
Cohesion: 0.09
Nodes (21): 10. Monetization, 11. Suggested Build Order, 1. Core Tracking (shared by personal and business), 2. Personal Finance, 3. Business Finance, 4.1 Cashflow Management, 4.2 Insights and Detection, 4.3 Conversational Features (+13 more)

### Community 57 - "assistant/+page.svelte"
Cohesion: 0.18
Nodes (10): formatExactAmount(), parseLocalizedAmount(), for(), money(), #snippet(), if(), load(), formatDate() (+2 more)

### Community 58 - "AWS EC2 free-tier VPS setup for CapyBudget"
Cohesion: 0.18
Nodes (11): 10. Monitor credits and prepare for expiry, 1. Understand the AWS free plan and choose one server, 2. Create and secure the AWS account, 3. Create networking and a security group, 4. Launch the EC2 instance, 5. Prepare Ubuntu, 6. Create the deployment account, 7. Add DNS records (+3 more)

### Community 59 - "Routing by Task Type"
Cohesion: 0.10
Nodes (19): Banner Design Tasks, Brand Identity Tasks, Component Creation, Corporate Identity Program Tasks, Design Routing Guide, Design System Migration, Icon Design Tasks, Implementation Tasks (+11 more)

### Community 60 - "shadcn/ui Theming & Customization"
Cohesion: 0.10
Nodes (19): Base Color Presets, Best Practices, Color Customization, Color Format, Component Customization, CSS Variable System, Customize Styles, Customize Variants (+11 more)

### Community 61 - "ref_postgres"
Cohesion: 0.12
Nodes (9): databaseName, PlanNode, sql, summarize(), admin, args, database, maintenance (+1 more)

### Community 62 - "Asset Organization Guide"
Cohesion: 0.11
Nodes (18): Asset Entry (manifest.json), Asset Organization Guide, By Campaign, By Status, By Type, Cleanup Workflow, Components, Directory Structure (+10 more)

### Community 63 - "Primary Color Meanings"
Cohesion: 0.11
Nodes (18): Accessibility Considerations, Analogous, Black, Blue, Color Combinations by Industry, Color Harmony Types, Complementary, Green (+10 more)

### Community 64 - "Core Logo Types"
Cohesion: 0.11
Nodes (18): 1. Wordmark (Logotype), 2. Lettermark (Monogram), 3. Pictorial Mark (Brand Mark), 4. Abstract Mark, 5. Mascot, 6. Emblem, 7. Combination Mark, Aesthetic Styles (+10 more)

### Community 65 - "operations/backup.ts"
Cohesion: 0.20
Nodes (17): allKeys(), backupCommand(), command(), context(), createBackup(), database, databaseName, exactState() (+9 more)

### Community 66 - "color"
Cohesion: 0.11
Nodes (19): $type, $value, background, foreground, muted-foreground, primary, primary-hover, secondary (+11 more)

### Community 67 - "DesignSystemGenerator"
Cohesion: 0.05
Nodes (15): DesignSystemGenerator, _resolve_dial(), apply_decision_rules(), _object_without_duplicates(), parse_decision_rules(), _validate_action(), TestReasoningMatch, read_rows() (+7 more)

### Community 68 - "Core tracking V2"
Cohesion: 0.20
Nodes (9): Checks performed during implementation, Core tracking V2, Currency setup, Privacy and durability, Receipt capture, Remove a statement, Splits and bulk actions, Start locally (+1 more)

### Community 69 - "Brand Consistency Checklist"
Cohesion: 0.11
Nodes (17): Audit Frequency, Brand Consistency Checklist, Channel Audit, Collateral, Colors, Common Issues, Email, Imagery (+9 more)

### Community 70 - "CIP Mockup Prompt Engineering"
Cohesion: 0.11
Nodes (17): Apparel (Polo/T-Shirt), Base Prompt Structure, Business Card, CIP Mockup Prompt Engineering, Context Modifiers, Corporate Minimal, Deliverable-Specific Modifiers, Letterhead (+9 more)

### Community 71 - "Color Semantics"
Cohesion: 0.11
Nodes (17): Accent, Applying Semantic Tokens, Background & Foreground, Border & Ring, Color Semantics, Dark Mode Overrides, Destructive, Interactive States (+9 more)

### Community 74 - "devDependencies"
Cohesion: 0.11
Nodes (19): devDependencies, @axe-core/playwright, cn, @fontsource-variable/fredoka, @fontsource-variable/nunito-sans, @internationalized/date, @lucide/svelte, @playwright/test (+11 more)

### Community 75 - "components.json"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+8 more)

### Community 76 - "dependencies"
Cohesion: 0.12
Nodes (16): dependencies, better-auth, bits-ui, @capybudget/api, echarts, @elysiajs/eden, lucide-svelte, qrcode (+8 more)

### Community 78 - "Design Principles"
Cohesion: 0.12
Nodes (15): 22 Art Direction Styles, Banner Sizes & Art Direction Styles Reference, Complete Banner Sizes, CTA Rules, Design Principles, Pinterest Research Queries, Print, Print Specs (+7 more)

### Community 79 - "Design Principles"
Cohesion: 0.12
Nodes (15): 22 Art Direction Styles, Banner Sizes & Art Direction Styles Reference, Complete Banner Sizes, CTA Rules, Design Principles, Pinterest Research Queries, Print, Print Specs (+7 more)

### Community 80 - "generate_cip_set"
Cohesion: 0.24
Nodes (6): build_cip_prompt(), check_logo_required(), generate_cip_set(), generate_with_nano_banana(), load_logo_image(), main()

### Community 81 - "fontSize"
Cohesion: 0.12
Nodes (16): $type, $value, $type, $value, $type, $value, $type, $value (+8 more)

### Community 83 - "CapyBudget User Guide"
Cohesion: 0.12
Nodes (15): 10. Make a budget, 11. Track a savings goal, 16. Read and export reports, 17. Manage notifications, 19. Change appearance and language, 21. Common questions, 2. Find your way around, 3. Read your dashboard (+7 more)

### Community 84 - "extract-colors.cjs"
Cohesion: 0.20
Nodes (11): calculateCompliance(), colorDistance(), displayPalette(), extractHexColors(), findNearestBrandColor(), fs, generateImageMagickCommand(), hexToRgb() (+3 more)

### Community 85 - "CIP Design Reference"
Cohesion: 0.13
Nodes (14): CIP Brief (Start Here), CIP Design Reference, Commands, Deliverable Categories, Design Styles, Detailed References, Generate Mockups, HTML Presentation Features (+6 more)

### Community 86 - "Icon Design Reference"
Cohesion: 0.13
Nodes (14): Available Styles, CLI Options, Commands, Generate Batch Variations, Generate Multiple Sizes, Generate Single Icon, Icon Categories, Icon Design Reference (+6 more)

### Community 87 - "Copywriting Formulas"
Cohesion: 0.13
Nodes (14): AIDA (Attention-Interest-Desire-Action), Before-After-Bridge, Contrast Patterns, Copywriting Formulas, Core Formulas, Cost of Inaction, FAB (Features-Advantages-Benefits), Formula-to-Slide Mapping (+6 more)

### Community 88 - "Copywriting Formulas"
Cohesion: 0.13
Nodes (14): AIDA (Attention-Interest-Desire-Action), Before-After-Bridge, Contrast Patterns, Copywriting Formulas, Core Formulas, Cost of Inaction, FAB (Features-Advantages-Benefits), Formula-to-Slide Mapping (+6 more)

### Community 90 - "assistant-benchmark.ts"
Cohesion: 0.50
Nodes (3): accounts, events, samples

### Community 91 - "generate_design_system"
Cohesion: 0.12
Nodes (7): ansi_ljust(), format_ascii_box(), format_markdown(), generate_design_system(), hex_to_ansi(), section_header(), TestPersistence

### Community 94 - "Banner Design - Multi-Format Creative Banner System"
Cohesion: 0.14
Nodes (13): Art Direction Styles (Top 10), Banner Design - Multi-Format Creative Banner System, Banner Size Quick Reference, Design Rules, Prerequisites, Security, Step 1: Gather Requirements (AskUserQuestion), Step 2: Research & Art Direction (+5 more)

### Community 95 - "Messaging Framework"
Cohesion: 0.14
Nodes (13): Core Statements, Elevator Pitches, Framework Structure, Message Architecture, Message by Audience, Message Testing, Messaging Framework, Mission Statement (+5 more)

### Community 96 - "Brand Voice Framework"
Cohesion: 0.14
Nodes (13): Brand Voice Framework, Character Spectrum, Emotion Spectrum, Language Spectrum, Step 1: Define Personality Traits, Step 2: Create Voice Chart, Step 3: Context Adaptation, Tone Spectrum (+5 more)

### Community 98 - "validate-asset.cjs"
Cohesion: 0.25
Nodes (13): checkManifest(), formatBytes(), formatOutput(), fs, main(), parseFilename(), path, RULES (+5 more)

### Community 99 - "Layout Patterns"
Cohesion: 0.14
Nodes (13): Card Styles, Component Variants, CSS Structures, Feature Grid (3 columns), Layout Decision Flow, Layout Patterns, Layout Selection by Use Case, Metric Styles (+5 more)

### Community 100 - "Tailwind Integration"
Cohesion: 0.14
Nodes (13): Animation Tokens, Base Layer, Button Example, Component Classes, CSS Variables Setup, Dark Mode Toggle, HSL Format Benefits, shadcn/ui Alignment (+5 more)

### Community 101 - "radius"
Cohesion: 0.19
Nodes (14): $type, $value, $type, $value, $type, $value, primitive, radius (+6 more)

### Community 102 - "Layout Patterns"
Cohesion: 0.14
Nodes (13): Card Styles, Component Variants, CSS Structures, Feature Grid (3 columns), Layout Decision Flow, Layout Patterns, Layout Selection by Use Case, Metric Styles (+5 more)

### Community 103 - "CapyBudget deployment: local Jenkins → one VPS"
Cohesion: 0.11
Nodes (18): 10. Common problems, 1. Recommended layout, 3.1 Configure the production SvelteKit adapter, 3.2 Adopt the reference files, 3.3 Validate before deploying, 3. Prepare the repository once, locally, 4. Configure production secrets on the VPS, 5. Set up real email and off-host backups (+10 more)

### Community 104 - "sheet-content.svelte"
Cohesion: 0.12
Nodes (4): AUTH_UI_CONTEXT, AuthUiState, WithoutChildrenOrChild, bits-ui

### Community 105 - "CapyBudget: Product Requirements Document (PRD)"
Cohesion: 0.14
Nodes (13): 10. Technical Approach (Summary), 11. Data Model (High-Level), 12. Monetization (Proposed), 15. Risks and Mitigations, 16. Dependencies and Assumptions, 17. Testing and Quality Plan, 18. Open Questions / Decisions Needed, 3.1 Personas (+5 more)

### Community 106 - "update.md"
Cohesion: 0.15
Nodes (12): Color Presets, Examples, Files Modified, Important, Overview, Skills Used, Step 1: Gather Brand Input, Step 2: Update Brand Guidelines (+4 more)

### Community 107 - "Logo Design Reference"
Cohesion: 0.15
Nodes (12): Available Styles, Color Psychology, Commands, Design Brief (Start Here), Detailed References, Generate Logo, Industry Defaults, Logo Design Reference (+4 more)

### Community 108 - "icon/generate.py"
Cohesion: 0.10
Nodes (13): apply_color(), apply_viewbox_size(), extract_svgs(), generate_batch(), generate_icon(), generate_sizes(), load_env(), main() (+5 more)

### Community 109 - "Token Architecture"
Cohesion: 0.15
Nodes (12): Categories, Dark Mode, File Organization, Layer 1: Primitive Tokens, Layer 2: Semantic Tokens, Layer 3: Component Tokens, Layer Overview, Migration from Flat Tokens (+4 more)

### Community 110 - "design-tokens-starter.json"
Cohesion: 0.15
Nodes (12): component, $type, $value, dark, semantic, $schema, $type, $value (+4 more)

### Community 114 - "personal-finance/routes.ts"
Cohesion: 0.10
Nodes (25): budgetProgress(), decimal(), scaled(), AssistantPushJob, deliverAssistantPushJob(), deliverPushJob(), PushJob, PushSender (+17 more)

### Community 115 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, allowJs, checkJs, esModuleInterop, forceConsistentCasingInFileNames, moduleResolution, resolveJsonModule, skipLibCheck (+4 more)

### Community 116 - "Primitive Tokens"
Cohesion: 0.17
Nodes (11): Border Radius, Color Scales, Gray Scale, Motion / Duration, Primary Colors (Blue), Primitive Tokens, Shadows, Spacing Scale (+3 more)

### Community 117 - "embed-tokens.cjs"
Cohesion: 0.17
Nodes (8): args, fs, minimal, MINIMAL_TOKENS, path, projectRoot, tokensPath, wrapStyle

### Community 118 - "validate-tokens.cjs"
Cohesion: 0.24
Nodes (11): extensions, formatReport(), fs, getFiles(), main(), parseArgs(), path, patterns (+3 more)

### Community 119 - "card"
Cohesion: 0.20
Nodes (12): $type, $value, bg, bg, padding, shadow, card, bg (+4 more)

### Community 124 - "Core Visual Elements"
Cohesion: 0.18
Nodes (10): Color Palette, Colors, Core Visual Elements, Logo, Logo, Quick Checks, Typography, Typography (+2 more)

### Community 125 - "inject-brand-context.cjs"
Cohesion: 0.31
Nodes (10): extractColorsFromTable(), extractCoreAttributes(), extractHexColors(), extractImageStyle(), extractTypography(), extractVoice(), fs, generatePromptAddition() (+2 more)

### Community 126 - "CIP Design Style Guide"
Cohesion: 0.18
Nodes (10): Bold Dynamic, CIP Design Style Guide, Classic Traditional, Color Psychology, Corporate Minimal, Fresh Modern, Luxury Premium, Modern Tech (+2 more)

### Community 128 - "Quick Reference"
Cohesion: 0.18
Nodes (11): 10. Charts & Data (LOW), 1. Accessibility (CRITICAL), 2. Touch & Interaction (CRITICAL), 3. Performance (HIGH), 4. Style Selection (HIGH), 5. Layout & Responsive (HIGH), 6. Typography & Color (MEDIUM), 7. Animation (MEDIUM) (+3 more)

### Community 129 - "provider.ts"
Cohesion: 0.22
Nodes (7): AssistantProvider, assistantProviderAvailable(), disabledAssistantProvider, ProviderCategoryInput, ProviderCategoryResult, ProviderSuggestionInput, ProviderSuggestionResult

### Community 130 - "sync-brand-to-tokens.cjs"
Cohesion: 0.29
Nodes (8): adjustBrightness(), { execFileSync }, extractColorsFromMarkdown(), fs, generateColorScale(), main(), path, updateDesignTokens()

### Community 131 - "Brand"
Cohesion: 0.20
Nodes (9): Brand, Brand Sync Workflow, Quick Start, References, Routing, Scripts, Subcommands, Templates (+1 more)

### Community 132 - "Slide Strategies"
Cohesion: 0.20
Nodes (9): Common Structures, Duarte Sparkline Pattern, Matching Strategy to Context, Product Demo (6 slides), Sales Pitch (9 slides), Search Commands, Slide Strategies, Strategy Selection (+1 more)

### Community 133 - "Component Tokens"
Cohesion: 0.20
Nodes (9): Alert Tokens, Badge Tokens, Button Tokens, Card Tokens, Component Tokens, Dialog/Modal Tokens, Input Tokens, Table Tokens (+1 more)

### Community 134 - "generate-tokens.cjs"
Cohesion: 0.36
Nodes (9): flattenTokens(), fs, generateCSS(), generateTailwind(), main(), parseArgs(), path, resolveReference() (+1 more)

### Community 135 - "button"
Cohesion: 0.20
Nodes (10): fg, font-size, hover-bg, button, $type, $value, $type, $value (+2 more)

### Community 136 - "duration"
Cohesion: 0.20
Nodes (10): fast, normal, slow, $type, $value, $type, $value, duration (+2 more)

### Community 137 - "Slide Strategies"
Cohesion: 0.20
Nodes (9): Common Structures, Duarte Sparkline Pattern, Matching Strategy to Context, Product Demo (6 slides), Sales Pitch (9 slides), Search Commands, Slide Strategies, Strategy Selection (+1 more)

### Community 139 - "ux/routes.ts"
Cohesion: 0.10
Nodes (31): CurrencyCatalog, CurrencyOption, FALLBACK_CURRENCIES, parseCatalog(), supportedCurrencies(), Actor, actorFor(), fail() (+23 more)

### Community 140 - "scheduler.ts"
Cohesion: 0.28
Nodes (13): exceedsUnusualThreshold(), medianUnits(), unusualThreshold(), evaluate(), evaluateUnusualCandidate(), notify(), q(), resolve() (+5 more)

### Community 141 - "notifications/routes.ts"
Cohesion: 0.44
Nodes (7): fail(), notificationRoutes, q(), queueUnusualReview(), Row, scope(), validateSnooze()

### Community 142 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, module, moduleResolution, noEmit, skipLibCheck, strict, target, types (+1 more)

### Community 143 - "persist_design_system"
Cohesion: 0.13
Nodes (7): _detect_page_type(), format_master_md(), format_page_override_md(), _generate_intelligent_overrides(), persist_design_system(), safe_slug(), _write_persisted_file()

### Community 145 - "6. Functional Requirements"
Cohesion: 0.20
Nodes (10): 6.1 Accounts and Onboarding (AUTH), 6.2 Core Tracking (TRK), 6.3 Budgets and Goals (BUD), 6.4 Bills and Reminders (REM), 6.5 Business Finance (BIZ), 6.6 Dashboard, Reports, and Export (RPT), 6.7 AI Assistant (AI), 6.8 Gamification and Delight (FUN) (+2 more)

### Community 146 - "v2/worker.ts"
Cohesion: 0.26
Nodes (14): getQueue(), scheduleRecurringWorkspace(), scheduleTrackingTask(), TRACKING_QUEUE, processRecurringWorkspace(), receiptFields(), cleanCaptureFiles(), dispatchCaptureJobs() (+6 more)

### Community 147 - "privacy.ts"
Cohesion: 0.08
Nodes (23): color, fill, message, status, fill, status, PRIVACY_CONTEXT, PrivacyState (+15 more)

### Community 149 - "onboarding.ts"
Cohesion: 0.16
Nodes (8): handle(), ONBOARDING_STEPS, OnboardingState, OnboardingStep, parseOnboardingState(), load(), 2. Understand the domain configuration, @sveltejs/kit

### Community 150 - "18. Protect your account and data"
Cohesion: 0.22
Nodes (9): 18. Protect your account and data, Backups and online sync, Delete your account, Download all your account data, Hide balances on screen, PIN and device unlock, Review signed-in devices, Turn on two-factor authentication (+1 more)

### Community 151 - "input"
Cohesion: 0.29
Nodes (8): padding-x, input, $type, $value, focus-ring, padding-x, $type, $value

### Community 152 - "ui-ux-pro-max"
Cohesion: 0.25
Nodes (7): How to Use, Primary Use Cases, Recommended, Rule Categories by Priority, Skip, ui-ux-pro-max, When to Apply

### Community 153 - "Prerequisites"
Cohesion: 0.33
Nodes (6): Available Domains, Available Stacks, How to Use This Skill, Output Formats, Prerequisites, Search Reference

### Community 154 - "CapyBudget"
Cohesion: 0.25
Nodes (8): CapyBudget, Core Tracking V2, Deployment guides, Layout, Local requirements, Personal finance V2 progress, Reset the local database, Security and privacy

### Community 155 - "Shared controls and loading feedback"
Cohesion: 0.20
Nodes (9): Business workspace currency and timezone, Checks performed, Controls, Currency amount entry, Invoice status emphasis, Onboarding currency selection, Password controls, Shared controls and loading feedback (+1 more)

### Community 156 - "CapyBudget: calm in-app visual system"
Cohesion: 0.25
Nodes (7): CapyBudget: calm in-app visual system, Contrast decision, Everyday use, Existing screen coverage, Proposed patterns — not new functionality, Scope, Verification

### Community 157 - "9. Non-Functional Requirements"
Cohesion: 0.25
Nodes (8): 9.1 Performance, 9.2 Reliability, 9.3 Security, 9.4 Privacy and Compliance, 9.5 Accessibility, 9.6 Localization, 9.7 Compatibility, 9. Non-Functional Requirements

### Community 158 - "Slides Reference"
Cohesion: 0.29
Nodes (6): Key Features, Knowledge Base, Slides Reference, Usage, When to Use, Workflow

### Community 159 - "HTML Slide Template"
Cohesion: 0.29
Nodes (6): Animation Classes, Background Images, Base Structure, Chart.js Integration, CSS Variables Reference, HTML Slide Template

### Community 161 - "HTML Slide Template"
Cohesion: 0.29
Nodes (6): Animation Classes, Background Images, Base Structure, Chart.js Integration, CSS Variables Reference, HTML Slide Template

### Community 163 - "debts/+page.svelte"
Cohesion: 0.24
Nodes (10): References (Knowledge Base), Routing, Slides, Subcommands, When to Use, create(), history(), load() (+2 more)

### Community 165 - "Security and privacy MVP — issue 13"
Cohesion: 0.22
Nodes (9): Backup and restore runbook, Failed privacy jobs and rollout, Key rotation and recovery, Local evidence (2026-10-01), Local setup, Protected data inventory, Security and privacy MVP — issue 13, User flows (+1 more)

### Community 166 - "assistant/types.ts"
Cohesion: 0.18
Nodes (10): AssistantActionProposalPayload, AssistantEvidence, AssistantForecastQualityFlag, AssistantSourcePermission, ForecastAccount, ForecastDay, ForecastEvent, ForecastEventKind (+2 more)

### Community 167 - "Pre-Delivery Checklist"
Cohesion: 0.33
Nodes (6): Accessibility, Interaction, Layout, Light/Dark Mode, Pre-Delivery Checklist, Visual Quality

### Community 168 - "Query Contract"
Cohesion: 0.29
Nodes (7): Query Contract, Step 1: Analyze User Requirements, Step 2: Generate Design System (new projects/pages), Step 2b: Persist Design System (Master + Overrides Pattern), Step 2c: Design Dials (optional), Step 3: Supplement with Detailed Searches (as needed), Step 4: Stack Guidelines

### Community 169 - "api.ts"
Cohesion: 0.50
Nodes (3): App, api, @elysiajs/eden

### Community 170 - "15. Use Capy, your cashflow assistant"
Cohesion: 0.33
Nodes (6): 15. Use Capy, your cashflow assistant, Act on a suggestion, Enable forecasts and choose the data, Read a 30-, 60-, or 90-day forecast, Teach category suggestions, Understand “Safe to spend today”

### Community 171 - "14. Release Plan"
Cohesion: 0.33
Nodes (6): 14. Release Plan, Phase 0: Discovery (2–4 weeks), Phase 1: MVP build, Phase 2: v1.5, Phase 3: v2.0, Phase 4: v3.0

### Community 172 - "Brand Guidelines Template"
Cohesion: 0.40
Nodes (4): Brand Guidelines Template, Document Structure, Extractable Fields, Usage

### Community 173 - "$type"
Cohesion: 0.60
Nodes (5): $type, $value, border, border, border

### Community 174 - "radius"
Cohesion: 0.60
Nodes (5): radius, radius, radius, $type, $value

### Community 175 - "lg"
Cohesion: 0.60
Nodes (5): lg, $type, $value, lg, lg

### Community 176 - "sm"
Cohesion: 0.60
Nodes (5): sm, sm, sm, $type, $value

### Community 177 - "test_design_system_mode.py"
Cohesion: 0.07
Nodes (14): _contrast_ratio(), _derive_dark_palette(), _filter_anti_patterns_for_mode(), _palette_is_dark(), _query_wants_dark(), _relative_luminance(), _resolve_color_mode(), _select_palette_for_mode() (+6 more)

### Community 178 - "Common Rules for Professional UI"
Cohesion: 0.40
Nodes (5): Common Rules for Professional UI, Icons & Visual Elements, Interaction (App), Layout & Spacing, Light/Dark Mode Contrast

### Community 179 - "Example Workflow"
Cohesion: 0.40
Nodes (5): Example Workflow, Step 1: Analyze Requirements, Step 2: Generate Design System, Step 3: Supplement with Detailed Searches (as needed), Step 4: Stack Guidelines

### Community 180 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, check, dev, test:e2e

### Community 181 - "UI/UX refresh baseline — issue #16"
Cohesion: 0.40
Nodes (4): Confirmed defects and implemented fixes, Environment, Evidence, UI/UX refresh baseline — issue #16

### Community 182 - "1. Overview"
Cohesion: 0.40
Nodes (5): 1.1 Summary, 1.2 Problem Statement, 1.3 Vision, 1.4 Product Principles, 1. Overview

### Community 183 - "8. AI Requirements (Detail)"
Cohesion: 0.40
Nodes (5): 8.1 Architecture Principle, 8.2 Requirements, 8.3 Suggestion Types (Initial Catalog), 8.4 AI Safety and Tone, 8. AI Requirements (Detail)

### Community 184 - "padding-y"
Cohesion: 0.67
Nodes (4): padding-y, padding-y, $type, $value

### Community 185 - "xl"
Cohesion: 0.67
Nodes (4): xl, xl, $type, $value

### Community 186 - "none"
Cohesion: 0.67
Nodes (4): $type, $value, none, none

### Community 187 - "Tips for Better Results"
Cohesion: 0.50
Nodes (4): Common Sticking Points, Pre-Delivery Checklist, Query Strategy, Tips for Better Results

### Community 190 - "14. Create and manage invoices"
Cohesion: 0.50
Nodes (4): 14. Create and manage invoices, Create and send an invoice, Record money received, Understand invoice states

### Community 191 - "20. A simple daily and weekly routine"
Cohesion: 0.50
Nodes (4): 20. A simple daily and weekly routine, Each day, Each month, Each week

### Community 192 - "5. Record income and expenses"
Cohesion: 0.50
Nodes (4): 5. Record income and expenses, Add a detailed transaction, Attach a receipt or document, Quick add for everyday entries

### Community 193 - "16"
Cohesion: 0.67
Nodes (3): $type, $value, 16

### Community 194 - "1"
Cohesion: 0.67
Nodes (3): $type, $value, 1

### Community 195 - "3"
Cohesion: 0.67
Nodes (3): $type, $value, 3

### Community 196 - "8"
Cohesion: 0.67
Nodes (3): $type, $value, 8

### Community 197 - "destructive"
Cohesion: 0.67
Nodes (3): destructive, $type, $value

### Community 198 - "destructive-foreground"
Cohesion: 0.67
Nodes (3): destructive-foreground, $type, $value

### Community 199 - "muted"
Cohesion: 0.67
Nodes (3): muted, $type, $value

### Community 200 - "primary-foreground"
Cohesion: 0.67
Nodes (3): primary-foreground, $type, $value

### Community 201 - "ring"
Cohesion: 0.67
Nodes (3): ring, $type, $value

### Community 202 - "secondary-foreground"
Cohesion: 0.67
Nodes (3): secondary-foreground, $type, $value

### Community 206 - "12. Manage bills and due dates"
Cohesion: 0.67
Nodes (3): 12. Manage bills and due dates, After you pay, Give the forecast better payment dates

### Community 207 - "1. Start here"
Cohesion: 0.67
Nodes (3): 1. Start here, Complete the welcome setup, Create your account

### Community 208 - "7. Organize categories and tags"
Cohesion: 0.67
Nodes (3): 7. Organize categories and tags, Create a category or subcategory, Create and use a tag

### Community 209 - "8. Find and correct transactions"
Cohesion: 0.67
Nodes (3): 8. Find and correct transactions, Fix or remove an entry, Search, filter, and sort

### Community 210 - "13. Success Metrics"
Cohesion: 0.67
Nodes (3): 13.1 North Star, 13.2 Metrics, 13. Success Metrics

### Community 211 - "19. Appendix"
Cohesion: 0.67
Nodes (3): 19.1 Glossary, 19.2 Related Documents, 19. Appendix

### Community 212 - "2. Goals and Non-Goals"
Cohesion: 0.67
Nodes (3): 2.1 Goals, 2.2 Non-Goals (for the first releases), 2. Goals and Non-Goals

### Community 216 - "refresh.spec.ts"
Cohesion: 0.11
Nodes (8): apiPort, webPort, artifacts, metrics, pages, test, @axe-core/playwright, @playwright/test

### Community 220 - "i18n/auth.ts"
Cohesion: 0.06
Nodes (9): dismissed, isId, slow, visible, messages, Locale, messages, words (+1 more)

### Community 226 - "rate-limit.ts"
Cohesion: 0.25
Nodes (9): Bucket, buildRateLimitBuckets(), digest(), disabledPaths, guardAuthRequest(), incrementScript, normalizeEmailForLimit(), RateDecision (+1 more)

### Community 227 - "categorization.ts"
Cohesion: 0.60
Nodes (3): CategoryRuleCandidate, chooseCategoryRule(), normalizeMerchant()

### Community 229 - "test_text_layout_resilience.py"
Cohesion: 0.18
Nodes (3): read_rows(), TestTextLayoutDataContracts, TestTextLayoutRetrieval

### Community 232 - "loading.svelte.ts"
Cohesion: 0.14
Nodes (9): NAV_GROUPS, NavEntry, NavGroup, installLoadingTracker(), loadingState, trackLoading(), Loading overlay, lucide-svelte (+1 more)

### Community 235 - "Included in this change"
Cohesion: 0.22
Nodes (8): Budget methods (`/budgets`), Debts (`/debts`), Included in this change, Migration and operations, Net worth (`/net-worth`), Personal finance V2 — implementation status and usage, Remaining work before issue #5 V2 can be called complete, Subscriptions (`/subscriptions`)

### Community 238 - "devDependencies"
Cohesion: 0.29
Nodes (7): devDependencies, drizzle-kit, @types/archiver, @types/bun, @types/nodemailer, @types/web-push, typescript

### Community 239 - "Start"
Cohesion: 0.33
Nodes (6): AI assistant MVP, Business finance and invoices, Email authentication, Notifications and reminders MVP, Reports and analytics MVP, Start

### Community 242 - "deletion-receipt/+page.svelte"
Cohesion: 0.29
Nodes (5): busy, error, mounted, status, value

### Community 255 - "scope.ts"
Cohesion: 0.67
Nodes (5): failure(), mapScopeError(), q(), reject(), withAssistantScope()

## Knowledge Gaps
- **1569 isolated node(s):** `fs`, `path`, `fs`, `path`, `fs` (+1564 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2149 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **67 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `formatDate()` connect `reports/routes.ts` to `loading-scope.svelte`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `ux()` connect `[invoiceId]/+page.svelte` to `ui-ux-pro-max`, `Prerequisites`, `Query Contract`, `loading-scope.svelte`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `How to Use This Skill` connect `Prerequisites` to `[invoiceId]/+page.svelte`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `TailwindConfigGenerator` (e.g. with `TestGeneratedConfigIsValidJs` and `TestTailwindConfigGenerator`) actually correct?**
  _`TailwindConfigGenerator` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `DesignSystemGenerator` (e.g. with `TestReasoningMatch` and `TestReasoningContract`) actually correct?**
  _`DesignSystemGenerator` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `fs`, `path`, `fs` to the rest of the system?**
  _1569 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `loading-scope.svelte` be split into smaller, more focused modules?**
  _Cohesion score 0.1447811447811448 - nodes in this community are weakly interconnected._