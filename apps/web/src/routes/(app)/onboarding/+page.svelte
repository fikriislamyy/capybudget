<script lang="ts">
  import AmountInput from '$lib/components/forms/amount-input.svelte';
  import CurrencySelect from '$lib/components/forms/currency-select.svelte';
  import * as ToggleGroup from '$lib/components/ui/toggle-group';
  import LoadingScope from '$lib/components/shared/loading-scope.svelte';
  import ChoiceSelect from '$lib/components/forms/choice-select.svelte';
  import DatePicker from '$lib/components/forms/date-picker.svelte';
  import { getContext, onMount, tick, untrack } from 'svelte';
  import { ONBOARDING_STEPS, type OnboardingStep } from '$lib/onboarding';
  import type { PageData } from './$types';
  import Check from '@lucide/svelte/icons/check';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Card from '$lib/components/ui/card';
  import * as Field from '$lib/components/ui/field';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { trackingText } from '$lib/i18n/tracking';
  import { uxText } from '$lib/i18n/ux';

  type Category = { id: string; name: string; type: string };
  const authUi = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const workspace=getContext<{refreshWorkspaces:(id?:string)=>Promise<void>}>('capybudget-workspaces');
  const t = (key: Parameters<typeof uxText>[1]) => uxText(authUi.locale, key);

  let { data }: { data: PageData } = $props();
  const initial = untrack(() => data.onboarding);
  const STEPS = ONBOARDING_STEPS;
  type Step = OnboardingStep;
  let step = $state<Step>(initial.currentStep);
  let direction = $state(1);
  const stepIndex = $derived(STEPS.indexOf(step));
  let loading = $state(true);
  let busy = $state(false);
  let error = $state('');
  let usageType = $state<'personal' | 'business' | 'both' | ''>(initial.usageType ?? 'personal');
  let businessName = $state('');
  let currency = $state(initial.currency);
  let currencyReady = $state(false);
  let language = $state<'en' | 'id'>(initial.language);
  let firstWorkspaceId = $state(initial.firstWorkspaceId ?? '');
  let accountName = $state('');
  let accountKind = $state('cash');
  let openingBalance = $state('');
  let goalChoice = $state<'budget' | 'goal' | 'skip'>('skip');
  let categories = $state<Category[]>([]);
  let budgetCategoryId = $state('');
  let budgetAmount = $state('');
  let goalName = $state('');
  let goalTarget = $state('');
  let goalDate = $state('');

  onMount(async () => {
    try {
      authUi.locale = language;
      document.documentElement.lang = language;
      if (step==='goal' && firstWorkspaceId) await loadCategories();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unable to load onboarding.';
    } finally {
      loading = false;
    }
  });

  function changeStep(next: Step) {
    direction = STEPS.indexOf(next) < stepIndex ? -1 : 1;
    step = next;
    void tick().then(() => document.getElementById('onboarding-step-title')?.focus({ preventScroll: true }));
  }

  async function loadCategories() {
    const response=await fetch(`/api/workspaces/${firstWorkspaceId}/categories`);
    if(!response.ok)throw new Error(authUi.locale==='id'?'Tidak dapat memuat kategori.':'Unable to load categories.');
    const data=await response.json();categories=data.items??[];
    budgetCategoryId=categories.find(c=>c.type==='expense')?.id??'';
  }
  async function saveProgress(currentStep: Step) {
    if (!usageType) throw new Error(authUi.locale === 'id' ? 'Pilih Pribadi, Bisnis, atau Keduanya untuk melanjutkan.' : 'Choose Personal, Business, or Both to continue.');
    const response = await fetch('/api/onboarding', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ usageType, currency: currency.trim().toUpperCase(), language, currentStep })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message ?? 'Unable to save progress.');
    }
  }

  async function nextFromUsage() {
    if (busy || !usageType) return;
    busy = true;
    error = '';
    try {
      await saveProgress('details');
      changeStep('details');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unable to continue.';
    } finally {
      busy = false;
    }
  }

  async function nextFromDetails() {
    if (busy || !currencyReady) return;
    busy = true;
    error = '';
    try {
      const code = currency.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(code)) throw new Error(t('currencyHint'));
      const response = await fetch('/api/onboarding/provision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usageType, currency: code, language, businessName: businessName.trim() })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? 'Unable to set up workspaces.');
      firstWorkspaceId = body.firstWorkspaceId;
      authUi.locale = language;
      document.documentElement.lang = language;
      try {
        localStorage.setItem('capybudget-locale', language);
      } catch {}
      changeStep('account');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unable to continue.';
    } finally {
      busy = false;
    }
  }

  async function nextFromAccount() {
    busy = true;
    error = '';
    try {
      if (!accountName.trim()) throw new Error(authUi.locale === 'id' ? 'Beri nama dompet Anda.' : 'Name your wallet.');
      const balance = openingBalance.trim() || '0';
      if (!/^-?(0|[1-9]\d{0,14})(\.\d{1,4})?$/.test(balance)) throw new Error(t('openingHint'));
      const response = await fetch(`/api/workspaces/${firstWorkspaceId}/accounts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: accountName.trim(), kind: accountKind, openingBalance: balance })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? 'Unable to create wallet.');
      await loadCategories();
      await saveProgress('goal');
      changeStep('goal');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unable to continue.';
    } finally {
      busy = false;
    }
  }

  async function finish() {
    busy = true;
    error = '';
    try {
      if (goalChoice === 'budget') {
        if (!budgetCategoryId || !/^(0|[1-9]\d{0,14})(\.\d{1,4})?$/.test(budgetAmount.trim()) || Number(budgetAmount) <= 0) {
          throw new Error(authUi.locale === 'id' ? 'Pilih kategori dan jumlah anggaran.' : 'Choose a category and budget amount.');
        }
        const category = categories.find((c) => c.id === budgetCategoryId);
        const response = await fetch(`/api/workspaces/${firstWorkspaceId}/budgets`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: category?.name ?? 'Monthly budget', categoryId: budgetCategoryId, amount: budgetAmount.trim(), cadence: 'monthly' })
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message ?? 'Unable to create budget.');
        }
      } else if (goalChoice === 'goal') {
        if (!goalName.trim() || !/^(0|[1-9]\d{0,14})(\.\d{1,4})?$/.test(goalTarget.trim()) || Number(goalTarget) <= 0) {
          throw new Error(authUi.locale === 'id' ? 'Beri nama dan target tabungan.' : 'Name your goal and set a target.');
        }
        const response = await fetch(`/api/workspaces/${firstWorkspaceId}/goals`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: goalName.trim(), targetAmount: goalTarget.trim(), ...(goalDate ? { targetDate: goalDate } : {}) })
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message ?? 'Unable to create goal.');
        }
      }
      const done = await fetch('/api/onboarding/finish', { method: 'POST' });
      if (!done.ok) {
        const body = await done.json().catch(() => ({}));
        throw new Error(body.message ?? 'Unable to finish onboarding.');
      }
      await workspace.refreshWorkspaces(firstWorkspaceId);
      await goto('/dashboard', { invalidateAll: true });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unable to finish.';
    } finally {
      busy = false;
    }
  }

  function back() {
    error = '';
    const index = STEPS.indexOf(step);
    if (index > 0) changeStep(STEPS[index - 1]!);
  }
</script>
<LoadingScope active={!!loading || !!busy} />

<svelte:head><title>{t('onboardingTitle')} · CapyBudget</title></svelte:head>
<div class="wrap">
  <p class="eyebrow">CAPYBUDGET</p>
  <h1>{t('onboardingTitle')}</h1>
  <p class="muted">{t('onboardingIntro')}</p>
  {#if loading}
    <p role="status">{authUi.locale === 'id' ? 'Memuat…' : 'Loading…'}</p>
  {:else}
    <p class="step-label" role="status" aria-live="polite" aria-atomic="true">{authUi.locale === 'id' ? `Langkah ${STEPS.indexOf(step) + 1} dari ${STEPS.length}` : `Step ${STEPS.indexOf(step) + 1} of ${STEPS.length}`}</p>
    <ol class="progress" style={`--progress:${stepIndex / (STEPS.length - 1)}`} aria-label={authUi.locale === 'id' ? 'Kemajuan' : 'Progress'}>
      {#each STEPS as s, i (s)}
        <li class:done={STEPS.indexOf(step) > i} class:current={step === s} aria-current={step === s ? 'step' : undefined} aria-label={`${i + 1}. ${t(({usage:'stepUsage',details:'stepDetails',account:'stepAccount',goal:'stepGoal'} as const)[s])}`}>
          {#if stepIndex > i}<Check size={18} aria-hidden="true" />{:else}{i + 1}{/if}
        </li>
      {/each}
    </ol>
    <Card.Root class="onboarding-card">
      <Card.Content>
        {#key step}
        <section class="step-panel" style={`--step-direction:${direction}`} aria-labelledby="onboarding-step-title" aria-busy={busy}>
        {#if step === 'usage'}
          <h2 id="onboarding-step-title" tabindex="-1">{t('stepUsage')}</h2>
          <ToggleGroup.Root type="single" value={usageType} onValueChange={(value) => { usageType = value as typeof usageType; }} disabled={busy} spacing={2} class="choices" aria-label={t('stepUsage')}>
            {#each [{ v: 'personal', title: t('usagePersonal'), hint: t('usagePersonalHint') }, { v: 'business', title: t('usageBusiness'), hint: t('usageBusinessHint') }, { v: 'both', title: t('usageBoth'), hint: t('usageBothHint') }] as item}
              <ToggleGroup.Item value={item.v}>
                <strong>{item.title}</strong><small>{item.hint}</small>
              </ToggleGroup.Item>
            {/each}
          </ToggleGroup.Root>
        {:else if step === 'details'}
          <h2 id="onboarding-step-title" tabindex="-1">{t('stepDetails')}</h2>
          <Field.FieldGroup>
            {#if usageType !== 'personal'}
              <Field.Field>
                <Field.FieldLabel for="ob-business">{t('businessName')}</Field.FieldLabel>
                <Input id="ob-business" bind:value={businessName} maxlength={100} placeholder={t('businessNamePlaceholder')} />
              </Field.Field>
            {/if}
            <Field.Field>
              <Field.FieldLabel for="ob-currency">{t('currency')}</Field.FieldLabel>
              <CurrencySelect id="ob-currency" bind:value={currency} bind:ready={currencyReady} disabled={busy} />
            </Field.Field>
            <Field.Field>
              <Field.FieldLabel for="ob-language">{t('language')}</Field.FieldLabel>
              <ChoiceSelect id="ob-language" bind:value={language} items={[{value: "en", label: "English"}, {value: "id", label: "Bahasa Indonesia"}]} />
            </Field.Field>
          </Field.FieldGroup>
          <p class="summary" role="note">
            {#if usageType === 'personal'}{authUi.locale === 'id' ? `Lanjut akan membuat ruang kerja Pribadi (${currency.trim().toUpperCase() || 'IDR'}).` : `Continue will create a Personal workspace (${currency.trim().toUpperCase() || 'IDR'}).`}
            {:else if usageType === 'business'}{authUi.locale === 'id' ? `Lanjut akan membuat ruang kerja bisnis “${businessName.trim() || t('businessNamePlaceholder')}” (${currency.trim().toUpperCase() || 'IDR'}).` : `Continue will create the “${businessName.trim() || t('businessNamePlaceholder')}” business workspace (${currency.trim().toUpperCase() || 'IDR'}).`}
            {:else}{authUi.locale === 'id' ? `Lanjut akan membuat ruang kerja Pribadi dan bisnis (${currency.trim().toUpperCase() || 'IDR'}).` : `Continue will create Personal and business workspaces (${currency.trim().toUpperCase() || 'IDR'}).`}{/if}
          </p>
        {:else if step === 'account'}
          <h2 id="onboarding-step-title" tabindex="-1">{t('stepAccount')}</h2>
          <Field.FieldGroup>
            <Field.Field>
              <Field.FieldLabel for="ob-account">{t('accountName')}</Field.FieldLabel>
              <Input id="ob-account" bind:value={accountName} maxlength={100} placeholder={t('accountNamePlaceholder')} />
            </Field.Field>
            <Field.Field>
              <Field.FieldLabel for="ob-kind">{t('accountType')}</Field.FieldLabel>
              <ChoiceSelect id="ob-kind" bind:value={accountKind} items={[{value: "cash", label: String(trackingText(authUi.locale,'kindCash'))}, {value: "bank", label: String(trackingText(authUi.locale,'kindBank'))}, {value: "e_wallet", label: String(trackingText(authUi.locale,'kindEWallet'))}, {value: "credit_card", label: String(trackingText(authUi.locale,'kindCard'))}, {value: "savings", label: String(trackingText(authUi.locale,'kindSavings'))}, {value: "investment", label: String(trackingText(authUi.locale,'kindInvest'))}]} />
            </Field.Field>
            <Field.Field>
              <Field.FieldLabel for="ob-balance">{t('openingBalance')}</Field.FieldLabel>
              <AmountInput {currency} id="ob-balance" bind:value={openingBalance} inputmode="decimal" placeholder="0" />
              <Field.FieldDescription>{t('openingHint')}</Field.FieldDescription>
            </Field.Field>
          </Field.FieldGroup>
        {:else}
          <h2 id="onboarding-step-title" tabindex="-1">{t('stepGoal')}</h2>
          <ToggleGroup.Root type="single" value={goalChoice} onValueChange={(value) => { if (value) goalChoice = value as typeof goalChoice; }} spacing={2} class="choices three" aria-label={t('stepGoal')}>
            {#each [{ v: 'budget', label: t('goalChoiceBudget') }, { v: 'goal', label: t('goalChoiceGoal') }, { v: 'skip', label: t('goalChoiceSkip') }] as item}
              <ToggleGroup.Item value={item.v}>
                <strong>{item.label}</strong>
              </ToggleGroup.Item>
            {/each}
          </ToggleGroup.Root>
          {#key goalChoice}
          <div class="option-panel">
          {#if goalChoice === 'budget'}
            <Field.FieldGroup>
              <Field.Field>
                <Field.FieldLabel for="ob-budget-cat">{t('budgetCategory')}</Field.FieldLabel>
                <ChoiceSelect id="ob-budget-cat" bind:value={budgetCategoryId} items={[...(categories.filter((c) => c.type === 'expense')).flatMap((category) => [{value: category.id, label: String(category.name)}])]} />
              </Field.Field>
              <Field.Field>
                <Field.FieldLabel for="ob-budget-amount">{t('budgetAmount')}</Field.FieldLabel>
                <AmountInput {currency} id="ob-budget-amount" bind:value={budgetAmount} inputmode="decimal" placeholder="0.00" />
              </Field.Field>
            </Field.FieldGroup>
          {:else if goalChoice === 'goal'}
            <Field.FieldGroup>
              <Field.Field>
                <Field.FieldLabel for="ob-goal-name">{t('goalName')}</Field.FieldLabel>
                <Input id="ob-goal-name" bind:value={goalName} maxlength={100} placeholder={t('goalNamePlaceholder')} />
              </Field.Field>
              <Field.Field>
                <Field.FieldLabel for="ob-goal-target">{t('goalTarget')}</Field.FieldLabel>
                <AmountInput {currency} id="ob-goal-target" bind:value={goalTarget} inputmode="decimal" placeholder="0.00" />
              </Field.Field>
              <Field.Field>
                <Field.FieldLabel for="ob-goal-date">{t('goalDate')}</Field.FieldLabel>
                <DatePicker id="ob-goal-date" bind:value={goalDate} />
              </Field.Field>
            </Field.FieldGroup>
          {/if}
          </div>
          {/key}
        {/if}
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <div class="actions">
          {#if step !== 'usage'}<Button variant="outline" onclick={back} disabled={busy}>{t('back')}</Button>{/if}
          {#if step === 'usage'}<Button onclick={nextFromUsage} disabled={busy || !usageType}>{#if busy}<LoaderCircle class="busy-spinner" size={16} aria-hidden="true" />{/if}{busy ? t('saving') : t('next')}</Button>
          {:else if step === 'details'}<Button onclick={nextFromDetails} disabled={busy || !currencyReady}>{#if busy}<LoaderCircle class="busy-spinner" size={16} aria-hidden="true" />{/if}{busy ? t('saving') : t('next')}</Button>
          {:else if step === 'account'}<Button onclick={nextFromAccount} disabled={busy}>{#if busy}<LoaderCircle class="busy-spinner" size={16} aria-hidden="true" />{/if}{busy ? t('saving') : t('next')}</Button>
          {:else}<Button onclick={finish} disabled={busy}>{#if busy}<LoaderCircle class="busy-spinner" size={16} aria-hidden="true" />{/if}{busy ? t('saving') : t('finish')}</Button>{/if}
        </div>
        </section>
        {/key}
      </Card.Content>
    </Card.Root>
  {/if}
</div>

<style>
  .wrap{max-width:560px;margin:32px auto;padding:0 16px}
  .eyebrow{font-size:11px;letter-spacing:1px;font-weight:700;color:var(--muted-foreground);margin:0 0 4px}
  h1{font:500 30px var(--font-heading);margin:0}
  .muted{color:var(--muted-foreground);margin:8px 0 16px}
  h2{font:500 20px var(--font-heading);margin:4px 0 12px}
  .step-label{font-size:13px;font-weight:700;color:var(--muted-foreground);margin:0 0 8px}
  .summary{font-size:13px;color:var(--muted-foreground);background:var(--secondary);border-radius:var(--radius-input);padding:8px 12px;margin:12px 0 0}
  .progress{position:relative;display:flex;justify-content:space-between;gap:8px;list-style:none;padding:0;margin:0 0 24px}
  .progress::before,.progress::after{content:'';position:absolute;top:16px;left:16px;right:16px;height:2px;background:var(--secondary);transform-origin:left center}
  .progress::after{background:var(--income-ink);transform:scaleX(var(--progress));transition:transform 280ms var(--ease-spring)}
  .progress li{position:relative;z-index:1;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--secondary);color:var(--secondary-foreground);font-weight:700}
  .progress li.current{background:var(--primary);color:var(--primary-foreground);animation:step-current 280ms var(--ease-spring)}
  .progress li.done{background:var(--income-ink);color:var(--background)}
  .step-panel :global(.choices){display:grid;width:100%;gap:8px;margin-bottom:4px}
  .step-panel :global(.choices.three){grid-template-columns:repeat(3,minmax(0,1fr))}
  .step-panel :global(.choices) :global([data-slot="toggle-group-item"]){display:grid;gap:4px;text-align:left;min-height:64px;border:2px solid var(--input);border-radius:var(--radius-input);background:var(--background);color:var(--foreground);padding:12px 12px;font:inherit;cursor:pointer;transition:transform 180ms var(--ease-spring),background-color 180ms,border-color 180ms,box-shadow 180ms}
  .step-panel :global(.choices) :global([data-slot="toggle-group-item"] small){color:var(--muted-foreground);font-size:12px}
  .step-panel :global(.choices) :global([data-slot="toggle-group-item"][data-state="on"]){border-color:var(--primary);background:var(--secondary)}
  .actions{display:flex;justify-content:space-between;gap:12px;margin-top:16px}
  .error{color:var(--destructive);font-size:13px}
  .step-panel :global([data-slot="select-trigger"]){width:100%}
  @media(max-width:480px){.step-panel :global(.choices.three){grid-template-columns:1fr}}
  .wrap{width:100%;box-sizing:border-box;animation:welcome-arrive 250ms ease-out}
  .step-panel{min-width:0;animation:step-arrive 280ms var(--ease-spring)}
  .option-panel{animation:option-arrive 200ms ease-out}
  .step-panel :global([data-slot="field-group"] > [data-slot="field"]){animation:field-arrive 220ms ease-out backwards}
  .step-panel :global([data-slot="field-group"] > [data-slot="field"]:nth-child(2)){animation-delay:35ms}
  .step-panel :global([data-slot="field-group"] > [data-slot="field"]:nth-child(3)){animation-delay:70ms}
  .step-panel :global(.choices [data-slot="toggle-group-item"]){animation:field-arrive 220ms ease-out backwards}
  .step-panel :global(.choices [data-slot="toggle-group-item"]:nth-child(2)){animation-delay:35ms}
  .step-panel :global(.choices [data-slot="toggle-group-item"]:nth-child(3)){animation-delay:70ms}
  .step-panel :global(.choices [data-slot="toggle-group-item"]:active){transform:scale(.98)}
  .step-panel :global(.busy-spinner){animation:busy-turn 900ms linear infinite}
  .step-panel h2:focus-visible{outline:2px solid var(--ring);outline-offset:4px;border-radius:4px}
  @media(hover:hover){.step-panel :global(.choices [data-slot="toggle-group-item"]:hover){transform:translateY(-2px);box-shadow:var(--shadow-card)}}
  @keyframes welcome-arrive{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @keyframes step-arrive{from{opacity:0;transform:translateX(calc(16px * var(--step-direction)))}to{opacity:1;transform:none}}
  @keyframes option-arrive{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  @keyframes field-arrive{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
  @keyframes step-current{from{transform:scale(.88)}to{transform:scale(1)}}
  @keyframes busy-turn{to{transform:rotate(360deg)}}
  @media(prefers-reduced-motion:reduce){
    .wrap,.step-panel,.option-panel,.progress li.current,.step-panel :global([data-slot="field"]),.step-panel :global([data-slot="toggle-group-item"]),.step-panel :global(.busy-spinner){animation:none!important}
    .progress::after,.step-panel :global([data-slot="toggle-group-item"]){transition:none!important}
    .step-panel :global(.choices [data-slot="toggle-group-item"]:hover),.step-panel :global(.choices [data-slot="toggle-group-item"]:active){transform:none}
  }
</style>
