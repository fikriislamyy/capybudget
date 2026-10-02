<script lang="ts">
  import BudgetPond from '$lib/components/shared/budget-pond.svelte';
  import SavingsPool from '$lib/components/shared/savings-pool.svelte';
  import { getContext, onMount } from 'svelte';
  import { page } from '$app/state';
  import { ArrowRight, ArrowUpRight, Check, ChevronDown, Wallet, ChartPie, Sprout, Bell, Repeat2, FileText, ChartNoAxesCombined, Tags, ShieldCheck, Fingerprint, EyeOff, Download, Sparkles, Sun, Moon, Menu, X, Heart, BriefcaseBusiness, ExternalLink } from '@lucide/svelte';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { switchThemeChoice, persistPreferences } from '$lib/theme';

  const ui = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  let menuOpen = $state(false);
  let scrolled = $state(false);
  let heroPassed = $state(false);
  let hero: HTMLElement | undefined;
  const description = 'A calmer place for personal and business finances. Track spending, build budgets, send invoices, and plan ahead with Capy, your explainable cashflow assistant.';
  const nav = [{ title: 'Features', href: '#features' }, { title: 'AI Assistant', href: '#assistant' }, { title: 'Pricing', href: '#pricing' }, { title: 'FAQ', href: '#faq' }];
  const features = [
    { icon: Wallet, title: 'Every wallet, one clear view', body: 'Log income and expenses across cash, bank, card, and e-wallet accounts. Transfers stay transfers, so your totals make sense.', tone: 'blue' },
    { icon: ChartPie, title: 'Budgets with breathing room', body: 'Set weekly or monthly category budgets. Watch your budget pond fill, and see what’s left before your next purchase.', tone: 'green' },
    { icon: Sprout, title: 'Little steps. Bigger goals.', body: 'Give your emergency fund, next trip, or new gadget a target and a date. See your savings pool grow along the way.', tone: 'green' },
    { icon: Bell, title: 'Bills without the surprise', body: 'Keep due dates in sight and get reminders before bills land. A gentle heads-up goes a long way.', tone: 'coral' },
    { icon: Repeat2, title: 'Make the regular stuff easy', body: 'Set up recurring salary, rent, and subscriptions. Spend less time entering the same things each month.', tone: 'brown' },
    { icon: FileText, title: 'Business, beautifully separate', body: 'Switch between personal and business workspaces. Create invoices, export PDFs, and track draft, sent, paid, and overdue statuses.', tone: 'blue' },
    { icon: ChartNoAxesCombined, title: 'The bigger picture, made clear', body: 'See income, expenses, cashflow, and budget versus actual in simple charts. Take your reports with you as PDF, Excel, or CSV.', tone: 'brown' },
    { icon: Tags, title: 'Organized your way', body: 'Use your own categories, subcategories, tags, and notes. Search, filter, and sort to find that one transaction in a moment.', tone: 'coral' }
  ];
  const steps = [
    ['Make yourself at home', 'Create your account and choose personal, business, or both. One login keeps it all together.'],
    ['Start with one wallet', 'Add an account and log a transaction. No bank connection required; account syncing is coming later.'],
    ['Give your money a plan', 'Set a budget, start a savings goal, and add your upcoming bills. Small steps are plenty.'],
    ['Look ahead with Capy', 'See your cashflow forecast, check safe-to-spend, and choose the suggestions that work for you.']
  ];
  const quotes = [
    { name: 'Maya', role: 'Young professional', initials: 'M', quote: 'I want to know what’s left after bills without turning Sunday into spreadsheet day. This is the kind of calm overview I’d come back to.', tone: 'green' },
    { name: 'Rafi', role: 'Freelance designer', initials: 'R', quote: 'My client payments and my grocery money need their own space. Having both in one place would make the week feel a lot simpler.', tone: 'blue' },
    { name: 'Nadia', role: 'Small shop owner', initials: 'N', quote: 'A clear view of upcoming bills and unpaid invoices would help me plan the next stock order with a little more breathing room.', tone: 'coral' }
  ];
  const plans = [
    { name: 'Free', subtitle: 'A calmer everyday starting point.', price: 'Free', note: 'Proposed free-forever plan', features: ['Core income and expense tracking', 'Budgets and savings goals', 'Basic dashboards and reports', 'Limited AI and basic forecasting'], future: [], cta: 'Get started free', featured: false },
    { name: 'Plus', subtitle: 'More room for your personal plans.', price: 'TBD', note: 'Personal · pricing to be confirmed', features: ['Everything in the proposed Free plan'], future: ['Unlimited AI assistance', 'Bank sync', 'Advanced reports', 'Shared household budgets'], cta: 'Start with free', featured: true },
    { name: 'Business', subtitle: 'For your next chapter at work.', price: 'TBD', note: 'Business · pricing to be confirmed', features: ['Tracking and business workspaces', 'Invoices with PDF export'], future: ['Multi-user roles', 'Accountant access', 'Invoicing extras', 'Higher AI limits'], cta: 'Start with free', featured: false }
  ];
  const faqs = [
    ['Is my financial data secure?', 'CapyBudget includes two-factor authentication, PIN and supported biometric locks, encryption for sensitive fields, and regular backups. Privacy mode hides balances on screen. Keep your device and recovery codes secure, too.'],
    ['Can I use it for both personal and business money?', 'Yes. Choose personal, business, or both during onboarding. Separate workspaces keep your records apart, and you can switch between them with the same account. Multiple business profiles are supported.'],
    ['Does Capy ever move my money?', 'No. Capy explains forecasts and suggestions; it doesn’t initiate payments or transfers. You choose what to do. Its suggestions are helpful guidance, not professional financial advice.'],
    ['Is there a free plan?', 'Free is the proposed starting tier. You can create an account without a credit card. Paid pricing, limits, and final plan packaging are still being confirmed; the plans above are a preview, not a subscription offer.'],
    ['Can I connect my bank or share a household budget?', 'Those features are coming soon. Today you can add your accounts manually, log transactions, and use budgets, goals, invoices, and reports. Bank sync, shared households, and accountant access are planned for a later release.'],
    ['What happens to my data if I stop using CapyBudget?', 'You can export your records and request account deletion from privacy settings. Cancelling a future paid plan and deleting your account are separate actions. Paid cancellation and retention terms will be published before subscriptions launch.']
  ];

  function toggleTheme() {
    const next = ui.dark ? 'light' : 'dark';
    ui.theme = next;
    ui.dark = switchThemeChoice(next);
    void persistPreferences(next, ui.locale);
  }
  onMount(() => {
    const update = () => { scrolled = window.scrollY > 48; heroPassed = (hero?.getBoundingClientRect().bottom ?? Infinity) < 80; };
    update();
    window.addEventListener('scroll', update, { passive: true });
    const closeMenu = (event: KeyboardEvent) => { if (event.key === 'Escape') menuOpen = false; };
    window.addEventListener('keydown', closeMenu);
    const elements = document.querySelectorAll<HTMLElement>('.marketing [data-reveal]');
    const observer: IntersectionObserver | undefined = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('revealed'); observer?.unobserve(entry.target); }
    }, { threshold: 0.08 }) : undefined;
    elements.forEach(element => observer?.observe(element));
    const heroVisual = document.querySelector<HTMLElement>('.marketing .hero-visual');
    if (heroVisual && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      heroVisual.classList.add('hero-motion-ready');
      if (observer) observer.observe(heroVisual);
      else heroVisual.classList.add('revealed');
    }
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('keydown', closeMenu); observer?.disconnect(); };
  });
</script>

<svelte:head>
  <title>CapyBudget — Stay Chill With Your Money</title>
  <meta name="description" content={description} />
  <meta property="og:title" content="CapyBudget — Stay Chill With Your Money" />
  <meta property="og:description" content={description} />
  <meta property="og:type" content="website" />
  <meta property="og:image" content={`${page.url.origin}/capybudget-social.png`} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Capy resting in a warm pond beside the CapyBudget tagline. Brand illustration." />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="CapyBudget — Stay Chill With Your Money" />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={`${page.url.origin}/capybudget-social.png`} />
</svelte:head>

{#snippet capy(large = false)}
  <svg viewBox="0 0 220 170" fill="none" class:large class="capy-art" aria-hidden="true">
    <ellipse cx="110" cy="143" rx="103" ry="22" fill="#5BB8D4" opacity=".25" />
    <path d="M55 137C43 113 49 71 75 59C94 42 150 45 172 73C187 95 180 126 168 141Z" fill="#B98B5E" stroke="#8A5F3A" stroke-width="4" />
    <ellipse cx="73" cy="56" rx="13" ry="17" transform="rotate(-22 73 56)" fill="#B98B5E" stroke="#8A5F3A" stroke-width="4" />
    <ellipse cx="160" cy="57" rx="12" ry="16" transform="rotate(25 160 57)" fill="#B98B5E" stroke="#8A5F3A" stroke-width="4" />
    <ellipse cx="144" cy="105" rx="35" ry="25" fill="#D7AD80" />
    <path d="M86 89Q93 95 100 89M142 86Q149 92 156 86M158 105L163 106M134 119Q143 123 150 118" stroke="#3B2A1E" stroke-width="4" stroke-linecap="round" />
    <ellipse cx="78" cy="104" rx="9" ry="5" fill="#FF7A6B" opacity=".5" />
    <path d="M20 145Q65 159 109 146Q157 135 201 146" stroke="#5BB8D4" stroke-width="5" stroke-linecap="round" />
    <ellipse cx="119" cy="43" rx="13" ry="11" fill="#FFC53D" stroke="#8A5F3A" stroke-width="2" />
    <path d="M117 32Q120 24 131 27" stroke="#2F7A2A" stroke-width="3" stroke-linecap="round" />
    {#if large}<path class="steam" d="M32 86Q23 73 33 58M197 68Q187 55 197 40M102 24Q94 13 103 4" stroke="#B98B5E" stroke-width="3" stroke-linecap="round" opacity=".5" />{/if}
  </svg>
{/snippet}

<div class="marketing" lang="en">
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header class:solid={scrolled} class="site-header">
    <nav class="container flex items-center justify-between gap-4" aria-label="Main navigation">
      <a class="brand" href="/" aria-label="CapyBudget home">{@render capy()}<span>Capy<span class="brand-light">Budget</span></span></a>
      <div class="desktop-nav flex items-center gap-6">{#each nav as item}<a href={item.href}>{item.title}</a>{/each}</div>
      <div class="nav-actions flex items-center gap-2">
        <button class="icon-button" type="button" onclick={toggleTheme} aria-label={ui.dark ? 'Switch to light mode' : 'Switch to Night Pond dark mode'}>{#if ui.dark}<Sun aria-hidden="true" size={20} />{:else}<Moon aria-hidden="true" size={20} />{/if}</button>
        <a class="login-link" href="/login">Log in</a>
        <a class="cta nav-cta" href="/sign-up">Get started free <ArrowUpRight size={16} aria-hidden="true" /></a>
        <button class="icon-button mobile-menu-button" type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="mobile-menu" onclick={() => menuOpen = !menuOpen}>{#if menuOpen}<X aria-hidden="true" />{:else}<Menu aria-hidden="true" />{/if}</button>
      </div>
    </nav>
    {#if menuOpen}<nav id="mobile-menu" class="mobile-menu container" aria-label="Mobile navigation">{#each nav as item}<a href={item.href} onclick={() => menuOpen = false}>{item.title}<ArrowUpRight aria-hidden="true" size={16} /></a>{/each}<a href="/login">Log in</a><a class="cta" href="/sign-up">Get started free</a></nav>{/if}
  </header>

  <main id="main-content">
    <section class="hero container grid items-center gap-12 lg:grid-cols-2" bind:this={hero} aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow"><span class="status-dot"></span> YOUR MONEY. A LITTLE MORE ZEN.</p>
        <h1 id="hero-title">Stay chill<br />with your <span class="money-word">money.<svg viewBox="0 0 260 20" aria-hidden="true"><path d="M4 13Q110 0 253 10M9 19Q130 6 237 16" /></svg></span></h1>
        <p class="hero-description">Personal spending, business cashflow, and a helpful AI assistant. All together in one calm place, so you can get on with living.</p>
        <div class="flex flex-wrap items-center gap-3 hero-actions"><a href="/sign-up" class="cta cta-large">Get started free <ArrowRight size={20} aria-hidden="true" /></a><a href="#how-it-works" class="secondary-cta">See how it works <span class="play-circle" aria-hidden="true">▶</span></a></div>
        <div class="trust-row flex flex-wrap gap-x-5 gap-y-2"><span><Check size={15} aria-hidden="true" /> No credit card</span><span><ShieldCheck size={15} aria-hidden="true" /> Sensitive-field encryption</span><span><Sprout size={15} aria-hidden="true" /> Free plan preview</span></div>
        <div class="hero-note"><span class="tiny-capy">{@render capy()}</span><p>A little planning. A lot more breathing room.</p></div>
      </div>
      <div class="hero-visual" role="img" aria-label="Illustrative Capy dashboard preview with sample balance, budget pond, savings pool, and a rent reminder. These are invented example amounts, not live app data.">
        <div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>
        <div class="preview-sticker"><Sparkles size={15} aria-hidden="true" /> A calmer kind of finance app</div>
        <div class="dashboard-mock sticker">
          <div class="mock-header flex justify-between items-center"><span class="mock-brand">Your little money pond</span><span class="sample-label">ILLUSTRATION</span></div>
          <div class="mock-greeting flex justify-between items-start"><div><p>Good morning. Take a breath.</p><span class="balance-label">Example total balance</span><strong>Rp 12.450.000<span class="positive-badge">Looking steady <Sprout size={12} /></span></strong></div><span class="mock-avatar">C</span></div>
          <div class="mock-pair grid grid-cols-2 gap-3"><div class="mini-stat"><span><span class="green-dot"></span> Income</span><strong>Rp 8.500.000</strong></div><div class="mini-stat"><span><span class="coral-dot"></span> Expenses</span><strong>Rp 3.250.000</strong></div></div>
          <BudgetPond name="Your monthly budget pond" usedPercent={65} compact note="A little space left for the good stuff." />
          <SavingsPool name="A rainy-day cushion" percent={72} compact />
        </div>
        <div class="suggestion-float sticker flex gap-3"><span class="ai-icon"><Sparkles size={20} aria-hidden="true" /></span><div><strong>A gentle heads-up from Capy</strong><p>Rent lands on the 1st. Set aside Rp 2 million now for a smoother week.</p><span class="why-label">Why? Your next payday is on the 5th.</span></div></div>
        <div class="hero-mascot">{@render capy(true)}<span>Less worry.<br />More warm water.</span></div>
        <p class="preview-caption">Concept preview · sample amounts and suggestion</p>
      </div>
    </section>

    <section class="problem-strip" aria-labelledby="problem-title"><div class="container"><p class="eyebrow text-center">WE GET IT. MONEY CAN FEEL LIKE A LOT.</p><h2 id="problem-title" class="sr-only">A little less friction in your finances</h2><div class="grid gap-6 md:grid-cols-3"><p><span>01</span> Tracking shouldn’t feel<br /><strong>like another chore.</strong></p><p><span>02</span> Work money and life money<br /><strong>deserve their own space.</strong></p><p><span>03</span> A cashflow heads-up helps<br /><strong>before things get tight.</strong></p></div></div></section>

    <section id="features" class="section container" aria-labelledby="features-title" data-reveal>
      <div class="section-heading text-center"><p class="eyebrow">A PLACE FOR EVERY PART OF YOUR MONEY</p><h2 id="features-title">Everything you need,<br />in one calm place.</h2><p>From your morning coffee to your next client invoice.<br class="desktop-break" /> Clear, useful tools that fit into real life.</p></div>
      <div class="feature-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{#each features as feature}<article class="feature-card sticker"><span class="feature-icon" data-tone={feature.tone}><feature.icon size={24} aria-hidden="true" /></span><h3>{feature.title}</h3><p>{feature.body}</p></article>{/each}</div>
      <div class="feature-footnote flex flex-wrap items-center justify-center gap-x-6 gap-y-2"><span><Check size={16} aria-hidden="true" /> Quick-add, without the fuss</span><span><Check size={16} aria-hidden="true" /> Light or Night Pond mode</span><span><Check size={16} aria-hidden="true" /> English & Bahasa Indonesia</span></div>
    </section>

    <section id="assistant" class="assistant-section" aria-labelledby="assistant-title"><div class="container grid items-center gap-12 lg:grid-cols-2" data-reveal>
      <div><p class="eyebrow"><Sparkles size={16} aria-hidden="true" /> A LITTLE FORESIGHT. A FRIENDLY NUDGE.</p><h2 id="assistant-title">Meet Capy.<br />Your calm cashflow companion.</h2><p class="section-description">Knowing where your money went is useful. Knowing what’s coming next? That’s where Capy helps.</p><ul class="assistant-list"><li><span class="list-icon"><ChartNoAxesCombined size={20} aria-hidden="true" /></span><div><h3>A clearer view of the next 30, 60, or 90 days</h3><p>Forecast from your history, recurring items, bills, and unpaid invoices. Estimates, with the assumptions explained.</p></div></li><li><span class="list-icon"><Wallet size={20} aria-hidden="true" /></span><div><h3>Know what’s safe to spend today</h3><p>See what’s left after upcoming commitments, with gentle alerts for low balances and possible shortfalls.</p></div></li><li><span class="list-icon"><Sparkles size={20} aria-hidden="true" /></span><div><h3>Helpful suggestions. Clear reasons.</h3><p>Get practical next steps and see why they’re suggested. Auto-categorization also learns from your corrections.</p></div></li></ul><a class="text-link" href="/sign-up">Find a little breathing room <ArrowRight size={18} aria-hidden="true" /></a></div>
      <div class="assistant-visual"><div class="assistant-heading flex items-center gap-3"><span class="capy-circle">{@render capy()}</span><div><strong>A few words from Capy</strong><p>Illustrative suggestion cards · not a live chat</p></div></div><div class="chat-bubble"><span class="bubble-tag" data-tone="blue">LOOKING AHEAD</span><p>“Heads up: your balance will be tight after rent on the 1st. Set a little aside before then, or review a flexible expense.”</p><div class="bubble-why"><Sparkles size={14} aria-hidden="true" /><span><strong>Why?</strong> Rent is due four days before your next payday.</span></div></div><div class="chat-bubble offset"><span class="bubble-tag" data-tone="coral">YOUR BUSINESS POND</span><p>“Invoice #21 is 5 days late. A friendly reminder could help keep next week’s bills on track.”</p><div class="bubble-why"><FileText size={14} aria-hidden="true" /><span><strong>Why?</strong> This unpaid invoice is included in your forecast.</span></div></div><div class="chat-bubble"><span class="bubble-tag" data-tone="green">A SMALL WIN</span><p>“After this week’s bills, there may be Rp 150.000 to put toward your rainy-day goal. Check the forecast before you decide.”</p><div class="bubble-why"><Sprout size={14} aria-hidden="true" /><span><strong>Why?</strong> Your protected balance and upcoming bills are covered in this example.</span></div></div><p class="ai-reassurance"><ShieldCheck size={18} aria-hidden="true" /> Explained suggestions. You decide. Capy never moves your money.</p></div>
    </div><div class="container"><p class="advice-note">Forecasts depend on the data you add and may change. Suggestions are not professional financial advice. You control which financial data the assistant can access.</p></div></section>

    <section id="for-you" class="section container" aria-labelledby="audience-title" data-reveal><div class="section-heading text-center"><p class="eyebrow">ONE ACCOUNT. YOUR WHOLE MONEY LIFE.</p><h2 id="audience-title">Built for you,<br />however you earn.</h2><p>A salary, a side project, a shop, or a little of everything.<br class="desktop-break" /> Switch spaces, keep the same peace of mind.</p></div><div class="grid gap-6 md:grid-cols-2"><article class="audience-card personal-card sticker"><span class="feature-icon" data-tone="green"><Heart aria-hidden="true" /></span><h3>For the life you’re building</h3><p>Make everyday spending easier to see, and make room for what matters next.</p><ul class="check-list"><li><Check aria-hidden="true" /> Category budgets with progress</li><li><Check aria-hidden="true" /> Savings goals and target dates</li><li><Check aria-hidden="true" /> Bill reminders and recurring expenses</li><li><span class="coming-label">Coming soon</span> Shared household budgets</li></ul><a class="text-link" href="/sign-up">Make room for your goals <ArrowRight size={18} aria-hidden="true" /></a></article><article class="audience-card business-card sticker"><span class="feature-icon" data-tone="blue"><BriefcaseBusiness aria-hidden="true" /></span><h3>For the business you’re growing</h3><p>Keep work finances in their own space, without adding another app to your day.</p><ul class="check-list"><li><Check aria-hidden="true" /> Multiple business profiles</li><li><Check aria-hidden="true" /> Invoices, PDF export, and payment statuses</li><li><Check aria-hidden="true" /> Cashflow and budget reports</li><li><span class="coming-label">Coming soon</span> Receivables aging and accountant access</li></ul><a class="text-link" href="/sign-up">Give your business some clarity <ArrowRight size={18} aria-hidden="true" /></a></article></div><p class="switch-note"><Repeat2 size={17} aria-hidden="true" /> Personal ↔ Business. Separate records. One familiar home.</p></section>

    <section id="how-it-works" class="section how-section" aria-labelledby="how-title"><div class="container" data-reveal><div class="section-heading text-center"><p class="eyebrow">START SMALL. FEEL THE DIFFERENCE.</p><h2 id="how-title">Your calmer money habit<br />starts right here.</h2><p>No complicated setup. No spreadsheet marathon.</p></div><ol class="steps grid gap-8 sm:grid-cols-2 lg:grid-cols-4">{#each steps as step, index}<li><span class="step-number">0{index + 1}</span><h3>{step[0]}</h3><p>{step[1]}</p></li>{/each}</ol></div></section>

    <section class="section container" aria-labelledby="proof-title" data-reveal><div class="section-heading text-center"><p class="eyebrow">REAL-LIFE NEEDS. A CALMER APPROACH.</p><h2 id="proof-title">Less spreadsheet energy.<br />More living-your-life energy.</h2><p>Illustrative stories from the people we’re building for.</p><p class="placeholder-note">Sample testimonials · fictional names and quotes, not customer endorsements.</p></div><div class="grid gap-5 md:grid-cols-3">{#each quotes as quote}<figure class="quote-card sticker"><span class="quote-mark" aria-hidden="true">“</span><blockquote>{quote.quote}</blockquote><figcaption class="flex items-center gap-3"><span class="quote-avatar" data-tone={quote.tone}>{quote.initials}</span><div><strong>{quote.name}</strong><span>{quote.role} · sample persona</span></div></figcaption></figure>{/each}</div></section>

    <section id="security" class="security-section" aria-labelledby="security-title"><div class="container" data-reveal><div class="section-heading text-center"><span class="security-icon"><ShieldCheck size={32} aria-hidden="true" /></span><h2 id="security-title">Your money story stays yours.</h2><p>Thoughtful safeguards. Clear choices. A little extra peace of mind.</p></div><div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"><article><Fingerprint aria-hidden="true" /><h3>Lock it your way</h3><p>PIN, supported biometrics, and two-factor authentication.</p></article><article><ShieldCheck aria-hidden="true" /><h3>Protected behind the scenes</h3><p>Sensitive-field encryption, session controls, and regular backups.</p></article><article><EyeOff aria-hidden="true" /><h3>Keep balances to yourself</h3><p>Privacy mode hides money on screen when you’re out and about.</p></article><article><Download aria-hidden="true" /><h3>You hold the keys</h3><p>Export your data or request account deletion in privacy settings.</p></article></div><p class="security-footer"><Check size={16} aria-hidden="true" /> Capy suggests. You approve your own actions. No automatic money movement.</p></div></section>

    <section id="pricing" class="section container" aria-labelledby="pricing-title" data-reveal><div class="section-heading text-center"><p class="eyebrow">A LITTLE CALM, AT YOUR OWN PACE</p><h2 id="pricing-title">Start simple.<br />Grow when you’re ready.</h2><p>Start with free tracking. Here’s a preview of where we’re headed.</p><p class="placeholder-note">Proposed plans · paid prices and limits TBD · no paid subscriptions offered here.</p></div><div class="pricing-grid grid gap-5 md:grid-cols-3">{#each plans as plan}<article class="price-card sticker" class:featured={plan.featured}>{#if plan.featured}<span class="plan-badge">FOR YOUR EVERYDAY PLANS</span>{/if}<h3>{plan.name}{#if plan.name === 'Plus'}<span>Personal</span>{/if}</h3><p>{plan.subtitle}</p><div class="price">{plan.price}</div><p class="price-note">{plan.note}</p><a class:secondary-plan={!plan.featured} class="cta" href="/sign-up">{plan.cta}<ArrowUpRight size={17} aria-hidden="true" /></a><ul class="check-list">{#each plan.features as feature}<li><Check size={17} aria-hidden="true" />{feature}</li>{/each}</ul>{#if plan.future.length}<p class="planned-heading">PLANNED · COMING SOON</p><ul class="check-list future-list">{#each plan.future as feature}<li><span class="future-dot" aria-hidden="true"></span>{feature}</li>{/each}</ul>{/if}</article>{/each}</div><p class="pricing-footnote">Plan packaging is a preview. See the features above for what’s available in the current MVP.</p></section>

    <section id="faq" class="section faq-section container" aria-labelledby="faq-title" data-reveal><div class="faq-intro"><p class="eyebrow">A FEW THINGS YOU MIGHT BE WONDERING</p><h2 id="faq-title">Good questions.<br />Clear answers.</h2><p>Money tools should feel easy to understand, right from the start.</p><div class="faq-capy">{@render capy(true)}</div></div><div class="faq-list">{#each faqs as faq}<details class="faq-item"><summary>{faq[0]}<ChevronDown size={20} aria-hidden="true" /></summary><div class="faq-answer"><p>{faq[1]}</p></div></details>{/each}</div></section>

    <section class="final-cta" aria-labelledby="cta-title"><div class="container flex flex-col items-center text-center" data-reveal><div class="final-capy">{@render capy(true)}</div><p class="eyebrow">YOUR NEXT CHAPTER CAN FEEL A LITTLE LIGHTER</p><h2 id="cta-title">Your money.<br />A little more peace of mind.</h2><p>Start with one wallet. Let the calm grow from there.</p><a class="cta cta-large" href="/sign-up">Get started free <ArrowRight size={20} aria-hidden="true" /></a><span class="final-note">No credit card required. Just a fresh start.</span></div></section>
  </main>

  <footer class="site-footer"><div class="container"><div class="footer-grid grid gap-8"><div><a class="brand" href="/" aria-label="CapyBudget home">{@render capy()}<span>Capy<span class="brand-light">Budget</span></span></a><p>Stay chill with your money.</p><p class="footer-language">Available in English & Bahasa Indonesia.<br />Examples on this page use Indonesian rupiah.</p></div><div><h2>Product</h2><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#assistant">AI Assistant</a></div><div><h2>Company</h2><a href="#for-you">About CapyBudget</a><details><summary>Blog</summary><p>Our journal is coming soon.</p></details><a href="https://github.com/fikriislamyy/capybudget/issues">Contact the project</a></div><div><h2>Legal</h2><details><summary>Privacy</summary><p>Export and deletion controls are available in the app. Formal privacy terms are pending publication; this preview is not a legal policy.</p></details><details><summary>Terms</summary><p>Paid pricing and subscription terms are pending. This page does not offer paid subscriptions.</p></details><a class="social-link" href="https://github.com/fikriislamyy/capybudget"><ExternalLink size={18} aria-hidden="true" /> GitHub</a></div></div><div class="footer-bottom flex flex-wrap justify-between gap-3"><span>© {new Date().getFullYear()} CapyBudget. All rights reserved.</span><span>Made for a little more breathing room. <Sprout size={14} aria-hidden="true" /></span></div></div></footer>
  {#if heroPassed}<aside class="mobile-bottom-cta" aria-label="Get started"><span>A calmer money habit.</span><a class="cta" href="/sign-up">Get started free <ArrowRight size={16} aria-hidden="true" /></a></aside>{/if}
</div>

<style>
  :global(html:has(.marketing)){
    scroll-behavior:smooth
  }
  .marketing{
    --heading-ink:var(--brand-ink);
    --page:var(--background);
    --surface:var(--card);
    --sand:var(--secondary);
    --ink:var(--foreground);
    --muted:var(--muted-foreground);
    --line:var(--border);
    --blue-fill:var(--pond-soft);
    --green-fill:var(--leaf-soft);
    --coral-fill:var(--coral-soft);
    --green-text:var(--text-green);
    --blue-text:var(--text-blue);
    --coral-text:var(--text-coral);
    --button-ink:var(--primary-foreground);
    --spring:var(--ease-spring);
    font-family:'Nunito','Quicksand',ui-rounded,sans-serif;
    color:var(--ink);
    background:var(--page);
    overflow:clip;
    font-variant-numeric:tabular-nums;
    line-height:1.65
  }
  .container{
    width:min(1160px,calc(100% - 40px));
    margin-inline:auto
  }
  .section{
    padding-block:92px
  }
  .marketing h1,.marketing h2,.marketing h3,.brand{
    font-family:'Fredoka','Baloo 2',ui-rounded,sans-serif;
    letter-spacing:-.025em
  }
  .marketing h1,.marketing h2{
    color:var(--heading-ink);
    text-wrap:balance
  }
  .marketing h2{
    font-size:clamp(2rem,4vw,3.1rem);
    font-weight:500;
    line-height:1.15;
    margin:14px 0 20px
  }
  .marketing h3{
    font-size:1.25rem;
    font-weight:500;
    line-height:1.3
  }
  .marketing p{
    margin:0
  }
  .marketing a{
    text-decoration:none;
    color:inherit
  }
  .marketing button{
    font:inherit;
    cursor:pointer
  }
  .marketing :is(a,button,summary):focus-visible{
    outline:3px solid var(--blue-text);
    outline-offset:5px
  }
  .marketing a,.marketing button{
    transition:transform 180ms var(--spring),background-color 180ms,color 180ms
  }
  .marketing a:hover:not(.cta):not(.brand){
    color:var(--blue-text)
  }
  .marketing section[id]{
    scroll-margin-top:100px
  }
  .skip-link{
    position:fixed;
    top:8px;
    left:16px;
    padding:12px 20px;
    background:var(--surface);
    border:2px solid var(--line);
    border-radius:14px;
    z-index:100;
    transform:translateY(-160%)
  }
  .skip-link:focus{
    transform:none
  }
  .eyebrow{
    font-size:.68rem;
    font-weight:800;
    letter-spacing:.15em;
    color:var(--muted);
    display:flex;
    align-items:center;
    gap:8px
  }
  .text-center .eyebrow{
    justify-content:center
  }
  .status-dot{
    width:8px;
    height:8px;
    border-radius:50%;
    background:var(--leaf-green);
    box-shadow:0 0 0 4px var(--green-fill)
  }
  .site-header{
    position:sticky;
    top:0;
    z-index:40;
    background:color-mix(in srgb,var(--page) 90%,transparent);
    border-bottom:1px solid transparent;
    transition:background 200ms,border-color 200ms;
    backdrop-filter:blur(12px)
  }
  .site-header.solid{
    background:var(--page);
    border-color:var(--line)
  }
  .site-header nav:first-child{
    min-height:84px
  }
  .brand{
    display:flex;
    align-items:center;
    gap:8px;
    font-size:1.45rem;
    font-weight:600;
    white-space:nowrap
  }
  .brand-light{
    font-weight:400
  }
  .capy-art{
    width:64px;
    height:auto
  }
  .brand .capy-art{
    width:46px
  }
  .desktop-nav{
    font-size:.85rem;
    font-weight:700
  }
  .desktop-nav a,.login-link{
    display:inline-flex;
    align-items:center;
    min-height:44px
  }
  .login-link{
    padding:8px 14px;
    font-weight:800;
    font-size:.85rem
  }
  .icon-button{
    display:grid;
    place-items:center;
    min-width:44px;
    min-height:44px;
    background:transparent;
    border:1px solid transparent;
    border-radius:50%;
    color:var(--ink)
  }
  .icon-button:hover{
    background:var(--sand)
  }
  .cta{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    gap:10px;
    min-height:48px;
    padding:12px 22px;
    border:2px solid var(--capy-fur);
    border-radius:999px;
    background:var(--capy-fur);
    color:var(--button-ink)!important;
    font-weight:800;
    font-size:.85rem;
    box-shadow:0 3px 0 #8A5F3A30
  }
  .cta:hover{
    background:#C99B6E;
    border-color:#C99B6E;
    transform:translateY(-2px)
  }
  .cta:active{
    transform:scale(.96)
  }
  .cta-large{
    min-height:56px;
    padding:14px 26px;
    font-size:.95rem
  }
  .secondary-cta{
    display:inline-flex;
    align-items:center;
    gap:12px;
    min-height:48px;
    padding:10px 12px;
    font-size:.9rem;
    font-weight:800
  }
  .play-circle{
    display:grid;
    place-items:center;
    width:28px;
    height:28px;
    border:1.5px solid var(--line);
    border-radius:50%;
    font-size:10px;
    padding-left:2px
  }
  .mobile-menu-button{
    display:none
  }
  .mobile-menu{
    display:flex;
    flex-direction:column;
    gap:4px;
    padding-bottom:20px
  }
  .mobile-menu a{
    display:flex;
    align-items:center;
    justify-content:space-between;
    min-height:48px;
    padding:8px 14px;
    border-radius:14px
  }
  .hero{
    min-height:720px;
    padding-block:70px 100px;
    position:relative
  }
  .hero h1{
    font-size:clamp(3.5rem,6.8vw,5.75rem);
    font-weight:500;
    line-height:1.06;
    margin:20px 0 30px;
    letter-spacing:-.035em
  }
  .money-word{
    position:relative;
    display:inline-block;
    color:var(--ink)
  }
  .money-word svg{
    position:absolute;
    left:0;
    bottom:-14px;
    width:100%;
    height:22px;
    fill:none;
    stroke:var(--capy-fur);
    stroke-width:4;
    stroke-linecap:round
  }
  .hero-description{
    max-width:440px;
    font-size:1.1rem;
    line-height:1.8;
    color:var(--muted)
  }
  .hero-actions{
    margin-top:30px
  }
  .trust-row{
    margin-top:23px;
    font-size:.68rem;
    font-weight:700;
    color:var(--muted)
  }
  .trust-row span{
    display:inline-flex;
    align-items:center;
    gap:5px
  }
  .trust-row :global(svg){
    color:var(--green-text)
  }
  .hero-note{
    display:flex;
    align-items:center;
    gap:4px;
    font-size:.75rem;
    color:var(--muted);
    margin-top:24px
  }
  .tiny-capy .capy-art{
    width:54px
  }
  .hero-visual{
    position:relative;
    isolation:isolate;
    min-width:0;
    padding:25px 12px 110px 24px
  }
  /* One entrance sequence, triggered on visibility; rotations remain unchanged. */
  @media(prefers-reduced-motion:no-preference){
    .hero-visual :global(:is(.preview-sticker,.dashboard-mock,.mock-header,.mock-greeting,.mini-stat,.pond-card,.mock-goal,.suggestion-float,.hero-mascot,.preview-caption)){
      --hero-delay:0ms;
    }
    .hero-visual .dashboard-mock{--hero-delay:160ms}
    .hero-visual .mock-header{--hero-delay:320ms}
    .hero-visual .mock-greeting{--hero-delay:480ms}
    .hero-visual .mini-stat:first-child{--hero-delay:640ms}
    .hero-visual .mini-stat:last-child{--hero-delay:800ms}
    .hero-visual :global(.pond-card){--hero-delay:960ms}
    .hero-visual :global(.mock-goal){--hero-delay:1120ms}
    .hero-visual .suggestion-float{--hero-delay:1280ms}
    .hero-visual .hero-mascot{--hero-delay:1440ms}
    .hero-visual .preview-caption{--hero-delay:1600ms}
    .hero-visual:global(.hero-motion-ready):not(:global(.revealed)) :global(:is(.preview-sticker,.dashboard-mock,.mock-header,.mock-greeting,.mini-stat,.pond-card,.mock-goal,.suggestion-float,.hero-mascot,.preview-caption)){opacity:0}
    .hero-visual:global(.hero-motion-ready.revealed) :global(:is(.preview-sticker,.dashboard-mock,.mock-header,.mock-greeting,.mini-stat,.pond-card,.mock-goal,.suggestion-float,.hero-mascot,.preview-caption)){
      animation:hero-piece-in 280ms var(--spring) var(--hero-delay) both;
    }
  }
  @keyframes hero-piece-in{
    from{opacity:0;translate:0 8px}
    to{opacity:1;translate:0 0}
  }
  .orbit{
    position:absolute;
    border:1px dashed var(--line);
    border-radius:50%;
    z-index:-1
  }
  .orbit-one{
    inset:-30px -30px 30px -25px;
    transform:rotate(-15deg)
  }
  .orbit-two{
    inset:15px -10px 65px -65px;
    transform:rotate(15deg)
  }
  .sticker{
    border:2px solid var(--line);
    border-radius:20px;
    background:var(--surface);
    box-shadow:0 8px 24px #8A5F3A08
  }
  .dashboard-mock{
    padding:23px;
    transform:rotate(-2deg);
    box-shadow:0 20px 60px #8A5F3A12
  }
  .preview-sticker{
    position:absolute;
    top:-4px;
    right:10px;
    z-index:2;
    display:flex;
    align-items:center;
    gap:7px;
    font-size:.7rem;
    font-weight:800;
    background:var(--sand);
    padding:8px 14px;
    border:2px solid var(--line);
    border-radius:14px;
    transform:rotate(4deg)
  }
  .mock-header{
    padding-bottom:18px;
    border-bottom:1px solid var(--line);
    gap:8px
  }
  .mock-brand{
    font-family:'Fredoka',ui-rounded,sans-serif;
    font-size:.95rem
  }
  .sample-label{
    font-size:.5rem;
    letter-spacing:.12em;
    color:var(--muted)
  }
  .mock-greeting{
    padding-block:20px
  }
  .mock-greeting p{
    font-size:.8rem;
    font-weight:800;
    margin-bottom:12px
  }
  .balance-label{
    display:block;
    font-size:.65rem;
    color:var(--muted)
  }
  .mock-greeting strong{
    display:block;
    font-size:clamp(1.35rem,2.8vw,1.85rem);
    letter-spacing:-.02em;
    line-height:1.5
  }
  .positive-badge{
    display:flex;
    align-items:center;
    gap:4px;
    font-size:.56rem;
    color:var(--green-text);
    font-weight:800;
    letter-spacing:0
  }
  .mock-avatar{
    display:grid;
    place-items:center;
    background:var(--sand);
    width:32px;
    height:32px;
    border-radius:50%;
    font:500 16px 'Fredoka',sans-serif
  }
  .mini-stat{
    border:1px solid var(--line);
    border-radius:14px;
    padding:12px
  }
  .mini-stat>span{
    display:flex;
    align-items:center;
    gap:6px;
    font-size:.65rem;
    color:var(--muted)
  }
  .mini-stat strong{
    display:block;
    font-size:.8rem;
    margin-top:6px
  }
  .green-dot,.coral-dot{
    width:6px;
    height:6px;
    border-radius:50%;
    background:var(--leaf-green)
  }
  .coral-dot{
    background:var(--berry-coral)
  }
  .suggestion-float{
    position:absolute;
    left:0;
    right:22px;
    bottom:35px;
    z-index:2;
    padding:17px 20px;
    transform:rotate(1deg);
    box-shadow:0 10px 30px #8A5F3A16;
    max-width:365px
  }
  .ai-icon{
    background:var(--sand);
    color:var(--heading-ink);
    width:34px;
    height:34px;
    display:grid;
    place-items:center;
    border-radius:12px;
    flex-shrink:0
  }
  .suggestion-float strong{
    font-size:.73rem
  }
  .suggestion-float p{
    font-size:.72rem;
    line-height:1.6;
    margin-top:3px
  }
  .why-label{
    font-size:.62rem;
    display:block;
    margin-top:8px;
    color:var(--blue-text);
    font-weight:800
  }
  .hero-mascot{
    position:absolute;
    right:-22px;
    bottom:-9px;
    z-index:3;
    transform:rotate(3deg)
  }
  .hero-mascot .capy-art{
    width:160px
  }
  .hero-mascot span{
    display:block;
    font-size:.64rem;
    font-weight:800;
    text-align:center;
    transform:rotate(-7deg);
    line-height:1.4;
    color:var(--muted)
  }
  .preview-caption{
    position:absolute;
    bottom:-14px;
    left:20px;
    font-size:.6rem;
    color:var(--muted)
  }
  .problem-strip{
    padding:36px 0 42px;
    border-block:1px solid var(--line);
    background:var(--sand)
  }
  .problem-strip .eyebrow{
    justify-content:center;
    margin-bottom:28px
  }
  .problem-strip .grid p{
    position:relative;
    padding-left:44px;
    font-size:.98rem;
    line-height:1.6
  }
  .problem-strip .grid p>span{
    position:absolute;
    left:0;
    top:4px;
    font:500 1.2rem 'Fredoka',sans-serif;
    color:var(--heading-ink)
  }
  .problem-strip strong{
    font-weight:800
  }
  .section-heading{
    max-width:700px;
    margin:0 auto 44px
  }
  .section-heading>p:not(.eyebrow){
    font-size:.98rem;
    line-height:1.75;
    color:var(--muted)
  }
  .feature-card{
    padding:25px 22px;
    transition:transform 250ms var(--spring),box-shadow 250ms
  }
  .feature-card:hover{
    transform:translateY(-4px);
    box-shadow:0 14px 30px #8A5F3A12
  }
  .feature-icon{
    display:inline-grid;
    place-items:center;
    width:48px;
    height:48px;
    border-radius:14px;
    background:var(--sand);
    color:var(--heading-ink)
  }
  [data-tone=blue]{
    background:var(--blue-fill);
    color:var(--blue-text)
  }
  [data-tone=green]{
    background:var(--green-fill);
    color:var(--green-text)
  }
  [data-tone=coral]{
    background:var(--coral-fill);
    color:var(--coral-text)
  }
  .feature-card h3{
    margin:19px 0 12px;
    font-size:1.12rem
  }
  .feature-card p{
    font-size:.81rem;
    color:var(--muted);
    line-height:1.8
  }
  .feature-footnote{
    margin-top:30px;
    font-size:.77rem;
    font-weight:700;
    color:var(--muted)
  }
  .feature-footnote span{
    display:flex;
    align-items:center;
    gap:7px
  }
  .feature-footnote :global(svg){
    color:var(--green-text)
  }
  .assistant-section{
    padding-block:80px 28px;
    background:var(--sand);
    border-block:1px solid var(--line);
    position:relative
  }
  .assistant-section h2{
    font-size:clamp(2.1rem,4.1vw,3.15rem)
  }
  .section-description{
    color:var(--muted);
    font-size:1.02rem;
    line-height:1.8;
    max-width:440px
  }
  .assistant-list{
    display:flex;
    flex-direction:column;
    gap:24px;
    list-style:none;
    padding:0;
    margin:30px 0
  }
  .assistant-list li{
    display:flex;
    gap:14px
  }
  .list-icon{
    flex-shrink:0;
    display:grid;
    place-items:center;
    width:40px;
    height:40px;
    background:var(--surface);
    border-radius:14px;
    color:var(--heading-ink)
  }
  .assistant-list h3{
    font-family:'Nunito',sans-serif;
    letter-spacing:0;
    font-size:.9rem;
    font-weight:800;
    margin:0 0 5px
  }
  .assistant-list p{
    font-size:.82rem;
    color:var(--muted);
    line-height:1.8
  }
  .text-link{
    display:inline-flex;
    align-items:center;
    gap:10px;
    min-height:44px;
    color:var(--heading-ink)!important;
    font-size:.88rem;
    font-weight:800
  }
  .text-link:hover{
    gap:15px;
    text-decoration:underline!important
  }
  .assistant-heading{
    margin-bottom:20px
  }
  .capy-circle{
    width:60px;
    height:60px;
    border-radius:50%;
    background:var(--surface);
    display:grid;
    place-items:center;
    flex-shrink:0
  }
  .capy-circle .capy-art{
    width:56px
  }
  .assistant-heading strong{
    font-family:'Fredoka',sans-serif;
    font-size:1.15rem;
    font-weight:500
  }
  .assistant-heading p{
    font-size:.64rem;
    color:var(--muted)
  }
  .chat-bubble{
    background:var(--surface);
    border:2px solid var(--line);
    border-radius:20px 20px 20px 6px;
    padding:21px 24px;
    margin-bottom:16px;
    box-shadow:0 6px 20px #8A5F3A08
  }
  .chat-bubble.offset{
    margin-left:28px;
    border-radius:20px 20px 6px 20px
  }
  .bubble-tag{
    display:inline-block;
    border-radius:8px;
    font-size:.56rem;
    font-weight:800;
    letter-spacing:.09em;
    padding:4px 8px
  }
  .chat-bubble>p{
    margin-top:10px;
    font-size:.9rem;
    line-height:1.75
  }
  .bubble-why{
    display:flex;
    align-items:flex-start;
    gap:8px;
    margin-top:15px;
    border-top:1px solid var(--line);
    padding-top:12px;
    font-size:.69rem;
    color:var(--muted)
  }
  .bubble-why :global(svg){
    flex-shrink:0;
    margin-top:3px
  }
  .ai-reassurance{
    display:flex;
    align-items:center;
    justify-content:center;
    gap:8px;
    font-size:.72rem;
    color:var(--muted)
  }
  .ai-reassurance :global(svg){
    flex-shrink:0
  }
  .advice-note{
    margin-top:42px!important;
    text-align:center;
    font-size:.67rem;
    color:var(--muted);
    line-height:1.8
  }
  .audience-card{
    padding:32px;
    background:var(--surface)
  }
  .personal-card{
    background:color-mix(in srgb,var(--green-fill) 45%,var(--surface))
  }
  .business-card{
    background:color-mix(in srgb,var(--blue-fill) 45%,var(--surface))
  }
  .audience-card h3{
    font-size:1.6rem;
    margin:18px 0 12px
  }
  .audience-card>p{
    font-size:.9rem;
    color:var(--muted);
    max-width:390px
  }
  .check-list{
    list-style:none;
    display:flex;
    flex-direction:column;
    gap:13px;
    padding:0;
    margin:24px 0
  }
  .check-list li{
    display:flex;
    align-items:flex-start;
    gap:9px;
    font-size:.82rem
  }
  .check-list :global(svg){
    width:17px;
    height:17px;
    color:var(--green-text);
    margin-top:3px;
    flex-shrink:0
  }
  .coming-label{
    background:var(--sand);
    padding:2px 6px;
    white-space:nowrap;
    font-size:.58rem;
    font-weight:800;
    border-radius:6px;
    margin-top:1px
  }
  .switch-note{
    display:flex;
    justify-content:center;
    align-items:center;
    gap:8px;
    text-align:center;
    margin-top:24px!important;
    font-size:.8rem;
    color:var(--muted)
  }
  .how-section{
    background:var(--sand);
    border-block:1px solid var(--line)
  }
  .steps{
    list-style:none;
    padding:0;
    margin:0
  }
  .step-number{
    display:grid;
    place-items:center;
    width:48px;
    height:48px;
    border:2px solid var(--capy-fur);
    border-radius:50%;
    font:500 1.3rem 'Fredoka',sans-serif;
    color:var(--heading-ink);
    background:var(--page)
  }
  .steps h3{
    font-size:1.2rem;
    margin:20px 0 12px
  }
  .steps p{
    font-size:.85rem;
    color:var(--muted);
    line-height:1.8
  }
  .placeholder-note{
    font-size:.69rem!important;
    margin-top:12px!important;
    color:var(--muted)
  }
  .quote-card{
    margin:0;
    padding:26px;
    display:flex;
    flex-direction:column
  }
  .quote-mark{
    font:500 3.2rem/1 'Fredoka',sans-serif;
    color:var(--capy-fur)
  }
  .quote-card blockquote{
    margin:2px 0 28px;
    font-size:.98rem;
    line-height:1.85;
    flex:1
  }
  .quote-avatar{
    width:42px;
    height:42px;
    display:grid;
    place-items:center;
    border-radius:50%;
    font:500 1.2rem 'Fredoka',sans-serif;
    flex-shrink:0
  }
  .quote-card figcaption strong{
    display:block;
    font-size:.84rem
  }
  .quote-card figcaption div>span{
    display:block;
    font-size:.65rem;
    color:var(--muted)
  }
  .security-section{
    padding-block:56px;
    background:var(--green-fill);
    border-block:1px solid var(--line)
  }
  .security-section .section-heading{
    margin-bottom:36px
  }
  .security-section h2{
    font-size:clamp(1.8rem,3vw,2.6rem)
  }
  .security-icon{
    display:inline-grid;
    place-items:center;
    width:60px;
    height:60px;
    border:2px solid var(--line);
    border-radius:20px;
    background:var(--surface);
    color:var(--green-text)
  }
  .security-section article>:global(svg){
    color:var(--green-text);
    width:24px;
    height:24px
  }
  .security-section h3{
    font:800 .85rem 'Nunito',sans-serif;
    letter-spacing:0;
    margin:12px 0 8px
  }
  .security-section article p{
    font-size:.79rem;
    color:var(--muted);
    line-height:1.8
  }
  .security-footer{
    display:flex;
    justify-content:center;
    align-items:center;
    gap:8px;
    text-align:center;
    font-size:.73rem;
    font-weight:700;
    margin-top:36px!important
  }
  .security-footer :global(svg){
    flex-shrink:0;
    color:var(--green-text)
  }
  .price-card{
    padding:30px 26px;
    position:relative;
    display:flex;
    flex-direction:column
  }
  .price-card.featured{
    border-color:var(--capy-fur);
    background:color-mix(in srgb,var(--sand) 40%,var(--surface));
    box-shadow:0 16px 35px #8A5F3A12
  }
  .plan-badge{
    position:absolute;
    top:-14px;
    left:50%;
    transform:translateX(-50%);
    white-space:nowrap;
    background:var(--yuzu-yellow);
    color:var(--capy-bark);
    border-radius:999px;
    border:2px solid var(--line);
    padding:5px 13px;
    font-size:.56rem;
    font-weight:800;
    letter-spacing:.06em
  }
  .price-card h3{
    margin:0 0 9px;
    font-size:1.6rem
  }
  .price-card h3 span{
    font:700 .7rem 'Nunito',sans-serif;
    letter-spacing:0;
    margin-left:10px;
    color:var(--muted)
  }
  .price-card>p{
    font-size:.8rem;
    color:var(--muted)
  }
  .price{
    font:500 2.8rem/1.3 'Fredoka',sans-serif;
    color:var(--heading-ink);
    margin-top:24px
  }
  .price-note{
    font-size:.67rem!important;
    min-height:24px
  }
  .price-card>.cta{
    margin-top:22px
  }
  .secondary-plan{
    background:transparent;
    border-color:var(--line);
    color:var(--ink)!important;
    box-shadow:none
  }
  .secondary-plan:hover{
    background:var(--sand);
    border-color:var(--capy-fur)
  }
  .planned-heading{
    font-size:.6rem!important;
    letter-spacing:.1em;
    font-weight:800;
    padding-top:17px;
    border-top:1px solid var(--line)
  }
  .future-list{
    margin-top:14px;
    color:var(--muted)
  }
  .future-dot{
    width:5px;
    height:5px;
    border-radius:50%;
    border:1px solid var(--muted);
    margin:9px 6px 0 3px;
    flex-shrink:0
  }
  .pricing-footnote{
    text-align:center;
    font-size:.71rem;
    color:var(--muted);
    margin-top:28px!important
  }
  .faq-section{
    display:grid;
    grid-template-columns:1fr 1.45fr;
    gap:70px;
    padding-top:24px
  }
  .faq-intro>p:not(.eyebrow){
    color:var(--muted);
    font-size:.9rem
  }
  .faq-capy{
    margin-top:22px
  }
  .faq-capy .capy-art{
    width:155px
  }
  .faq-item{
    border-bottom:1px solid var(--line)
  }
  .faq-item:first-child{
    border-top:1px solid var(--line)
  }
  .faq-item summary{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:16px;
    min-height:72px;
    padding-block:18px;
    cursor:pointer;
    font-size:.9rem;
    font-weight:800;
    list-style:none
  }
  .faq-item summary::-webkit-details-marker{
    display:none
  }
  .faq-item summary :global(svg){
    flex-shrink:0;
    transition:transform 220ms var(--spring);
    color:var(--heading-ink)
  }
  .faq-item[open] summary :global(svg){
    transform:rotate(180deg)
  }
  .faq-answer{
    padding:0 28px 22px 0;
    animation:answer-in 200ms ease-out
  }
  .faq-answer p{
    font-size:.86rem;
    color:var(--muted);
    line-height:1.85
  }
  .final-cta{
    background:var(--sand);
    padding-block:40px 60px;
    border-block:1px solid var(--line);
    position:relative
  }
  .final-capy .capy-art{
    width:140px
  }
  .final-cta .eyebrow{
    justify-content:center;
    margin-top:14px
  }
  .final-cta h2{
    font-size:clamp(2.4rem,5vw,3.7rem);
    margin-bottom:18px
  }
  .final-cta p:not(.eyebrow){
    font-size:.95rem;
    color:var(--muted)
  }
  .final-cta .cta{
    margin-top:27px;
    background:var(--yuzu-yellow);
    border-color:var(--yuzu-yellow);
    color:var(--capy-bark)!important
  }
  .final-cta .cta:hover{
    background:#FFD468;
    border-color:#FFD468
  }
  .final-note{
    font-size:.7rem;
    color:var(--muted);
    margin-top:17px
  }
  .site-footer{
    padding-block:48px 24px
  }
  .footer-grid{
    grid-template-columns:2.2fr 1fr 1fr 1fr
  }
  .site-footer .brand{
    font-size:1.35rem
  }
  .site-footer p{
    font-size:.8rem;
    color:var(--muted);
    margin-top:8px
  }
  .footer-language{
    font-size:.69rem!important;
    line-height:1.8;
    margin-top:15px!important
  }
  .site-footer h2{
    font:800 .78rem 'Nunito',sans-serif;
    letter-spacing:0;
    margin:8px 0 12px;
    color:var(--ink)
  }
  .footer-grid>div:not(:first-child)>a,.footer-grid summary{
    display:flex;
    align-items:center;
    min-height:44px;
    font-size:.75rem;
    color:var(--muted);
    cursor:pointer
  }
  .footer-grid summary{
    list-style:none
  }
  .footer-grid summary::-webkit-details-marker{
    display:none
  }
  .footer-grid details p{
    font-size:.68rem;
    margin:0 0 12px;
    line-height:1.7;
    max-width:200px
  }
  .social-link{
    gap:8px
  }
  .footer-bottom{
    border-top:1px solid var(--line);
    margin-top:32px;
    padding-top:24px;
    font-size:.65rem;
    color:var(--muted)
  }
  .footer-bottom>span:last-child{
    display:flex;
    align-items:center;
    gap:6px
  }
  .mobile-bottom-cta{
    display:none
  }
  @keyframes answer-in{
    from{
      opacity:0;
      transform:translateY(-4px)
    }
    to{
      opacity:1;
      transform:none
    }
  }
  [data-reveal]:global(.revealed){
    animation:reveal-in 350ms var(--spring) both
  }
  @keyframes reveal-in{
    from{
      opacity:.2;
      transform:translateY(14px)
    }
    to{
      opacity:1;
      transform:none
    }
  }
  .steam{
    animation:steam-drift 5s ease-in-out infinite alternate
  }
  @keyframes steam-drift{
    to{
      transform:translateY(-4px);
      opacity:.25
    }
  }
  @media(min-width:1024px){
    .mobile-menu{display:none}
    .hero{
      gap:56px
    }
    .hero-copy{
      padding-bottom:12px
    }
    .hero-visual{
      margin-top:30px
    }
    .feature-grid{
      gap:16px
    }
    .pricing-grid{
      align-items:stretch
    }
  }
  @media(max-width:1100px){
    .desktop-nav{
      gap:18px
    }
    .nav-cta{
      padding-inline:15px
    }
    .hero-mascot{
      right:-10px
    }
    .hero-mascot .capy-art{
      width:130px
    }
  }
  @media(max-width:1023px){
    .desktop-nav{
      display:none
    }
    .mobile-menu-button{
      display:grid
    }
    .hero{
      min-height:0;
      max-width:740px;
      text-align:center;
      padding-block:48px 90px;
      gap:50px
    }
    .hero-copy .eyebrow,.hero-actions,.trust-row,.hero-note{
      justify-content:center
    }
    .hero h1{
      font-size:clamp(3.7rem,10vw,5.7rem)
    }
    .hero-description{
      margin-inline:auto!important;
      max-width:530px
    }
    .hero-visual{
      max-width:540px;
      width:100%;
      margin-inline:auto;
      min-height:530px;
      text-align:left
    }
    .hero-mascot{
      right:-8px
    }
    .hero-mascot .capy-art{
      width:155px
    }
    .hero-note{
      margin-top:16px
    }
    .assistant-section .grid{
      max-width:740px
    }
    .assistant-visual{
      max-width:550px;
      width:100%;
      margin-inline:auto
    }
    .section{
      padding-block:72px
    }
    .faq-section{
      padding-top:10px;
      gap:32px
    }
    .footer-grid{
      grid-template-columns:1.7fr 1fr 1fr 1fr
    }
  }
  @media(max-width:767px){
    .container{
      width:calc(100% - 36px)
    }
    .site-header nav:first-child{
      min-height:72px
    }
    .brand{
      font-size:1.25rem;
      gap:3px
    }
    .brand .capy-art{
      width:38px
    }
    .nav-cta{
      display:none
    }
    .login-link{
      padding:8px;
      font-size:.78rem
    }
    .nav-actions{
      gap:0
    }
    .hero{
      padding-top:38px;
      gap:38px
    }
    .hero h1{
      font-size:clamp(3.35rem,12vw,5rem);
      margin-block:20px 30px
    }
    .hero-description{
      font-size:1rem
    }
    .hero-copy .eyebrow{
      font-size:.6rem;
      letter-spacing:.11em
    }
    .hero-actions{
      gap:7px
    }
    .hero-actions .cta{
      font-size:.83rem;
      padding-inline:20px
    }
    .secondary-cta{
      font-size:.8rem;
      padding-inline:6px
    }
    .trust-row{
      gap:12px;
      font-size:.6rem
    }
    .hero-note{
      font-size:.68rem
    }
    .hero-visual{
      padding:20px 8px 110px 10px;
      min-height:0;
      max-width:470px
    }
    .dashboard-mock{
      padding:18px
    }
    .mock-header{
      padding-bottom:14px
    }
    .mock-greeting strong{
      font-size:1.55rem
    }
    .mini-stat{
      padding:10px
    }
    .mini-stat strong{
      font-size:.73rem
    }
    .preview-sticker{
      font-size:.6rem;
      right:0
    }
    .suggestion-float{
      max-width:310px;
      right:36px;
      bottom:16px;
      padding:15px;
      gap:9px
    }
    .suggestion-float p{
      font-size:.67rem
    }
    .suggestion-float strong{
      font-size:.67rem
    }
    .hero-mascot{
      right:-4px;
      bottom:-42px
    }
    .hero-mascot .capy-art{
      width:115px
    }
    .hero-mascot span{
      font-size:.57rem
    }
    .preview-caption{
      bottom:-27px;
      left:8px;
      font-size:.54rem
    }
    .problem-strip{
      padding-block:30px
    }
    .problem-strip .grid{
      gap:23px;
      max-width:350px;
      margin:auto
    }
    .problem-strip .eyebrow{
      font-size:.58rem;
      letter-spacing:.1em;
      margin-bottom:25px
    }
    .problem-strip .grid p{
      font-size:.95rem
    }
    .section{
      padding-block:60px
    }
    .section-heading{
      margin-bottom:30px
    }
    .section-heading>p:not(.eyebrow){
      font-size:.9rem
    }
    .section-heading .eyebrow{
      font-size:.6rem;
      letter-spacing:.11em
    }
    .feature-card{
      padding:22px
    }
    .feature-card h3{
      font-size:1.2rem;
      margin-top:14px
    }
    .feature-card p{
      font-size:.87rem
    }
    .feature-footnote{
      font-size:.68rem
    }
    .assistant-section{
      padding-top:56px
    }
    .assistant-section .eyebrow{
      font-size:.59rem
    }
    .assistant-section h2{
      font-size:2.35rem
    }
    .section-description{
      font-size:.95rem
    }
    .chat-bubble{
      padding:19px
    }
    .chat-bubble.offset{
      margin-left:16px
    }
    .chat-bubble>p{
      font-size:.85rem
    }
    .ai-reassurance{
      font-size:.65rem;
      align-items:flex-start
    }
    .advice-note{
      font-size:.64rem
    }
    .audience-card{
      padding:25px
    }
    .audience-card h3{
      font-size:1.45rem
    }
    .check-list li{
      font-size:.79rem
    }
    .switch-note{
      font-size:.67rem
    }
    .steps{
      gap:28px
    }
    .steps li{
      display:grid;
      grid-template-columns:48px 1fr;
      column-gap:16px
    }
    .steps .step-number{
      grid-row:1/3
    }
    .steps h3{
      margin:2px 0 6px
    }
    .steps p{
      font-size:.84rem
    }
    .quote-card{
      padding:24px
    }
    .quote-card blockquote{
      font-size:.96rem
    }
    .security-section{
      padding-block:44px
    }
    .security-section article{
      padding:4px
    }
    .security-footer{
      font-size:.67rem;
      align-items:flex-start
    }
    .pricing-grid{
      gap:28px
    }
    .price-card{
      padding:28px
    }
    .price-card>.cta{
      width:100%
    }
    .price-card .check-list li{
      font-size:.88rem
    }
    .price-card .price-note{
      font-size:.75rem!important
    }
    .faq-section{
      grid-template-columns:1fr;
      gap:22px
    }
    .faq-capy{
      display:none
    }
    .faq-intro .eyebrow{
      font-size:.58rem
    }
    .faq-item summary{
      font-size:.87rem;
      min-height:72px
    }
    .faq-answer p{
      font-size:.84rem
    }
    .final-cta{
      padding-block:36px 48px
    }
    .final-cta .eyebrow{
      font-size:.55rem
    }
    .final-cta h2{
      font-size:2.5rem
    }
    .final-capy .capy-art{
      width:125px
    }
    .footer-grid{
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:24px 14px
    }
    .footer-grid>div:first-child{
      grid-column:1/-1
    }
    .site-footer{
      padding-bottom:104px
    }
    .footer-grid>div:not(:first-child)>a,.footer-grid summary{
      font-size:.71rem;
      min-height:44px
    }
    .footer-bottom{
      font-size:.62rem
    }
    .mobile-bottom-cta{
      position:fixed;
      z-index:35;
      bottom:0;
      inset-inline:0;
      background:var(--page);
      border-top:1px solid var(--line);
      box-shadow:0 -4px 24px #8A5F3A10;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      padding:10px 16px max(10px,env(safe-area-inset-bottom))
    }
    .mobile-bottom-cta>span{
      font-size:.7rem;
      font-weight:800
    }
    .mobile-bottom-cta .cta{
      font-size:.72rem;
      padding:10px 15px;
      min-height:44px
    }
    .desktop-break{
      display:none
    }
  }
  @media(max-width:380px){
    .nav-actions>.login-link{
      display:none
    }
  }
  @media(prefers-reduced-motion:reduce){
    :global(html:has(.marketing)){
      scroll-behavior:auto
    }
    .marketing *,[data-reveal]:global(.revealed){
      animation:none!important;
      transition:none!important
    }
    .feature-card:hover,.cta:hover{
      transform:none
    }
  }
  @supports(interpolate-size:allow-keywords){
    .faq-item{
      interpolate-size:allow-keywords
    }
    .faq-item::details-content{
      height:0;
      overflow:clip;
      transition:height 250ms,content-visibility 250ms;
      transition-behavior:allow-discrete
    }
    .faq-item[open]::details-content{
      height:auto
    }
  }
</style>
