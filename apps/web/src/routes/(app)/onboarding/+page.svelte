<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Card from '$lib/components/ui/card';
  import * as Field from '$lib/components/ui/field';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { uxText } from '$lib/i18n/ux';

  type Category = { id: string; name: string; type: string };
  const authUi = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const t = (key: Parameters<typeof uxText>[1]) => uxText(authUi.locale, key);

  const STEPS = ['usage', 'details', 'account', 'goal'] as const;
  type Step = (typeof STEPS)[number];
  let step = $state<Step>('usage');
  let loading = $state(true);
  let busy = $state(false);
  let error = $state('');
  let usageType = $state<'personal' | 'business' | 'both'>('personal');
  let businessName = $state('');
  let currency = $state('IDR');
  let language = $state<'en' | 'id'>('en');
  let firstWorkspaceId = $state('');
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
      const response = await fetch('/api/onboarding');
      if (!response.ok) throw new Error('Unable to load onboarding.');
      const state = await response.json();
      if (state.completed) {
        await goto('/dashboard');
        return;
      }
      if (state.usageType) usageType = state.usageType;
      if (state.currency) currency = state.currency;
      if (state.language) {
        language = state.language;
        authUi.locale = state.language;
        document.documentElement.lang = state.language;
      }
      if (state.firstWorkspaceId) firstWorkspaceId = state.firstWorkspaceId;
      if (STEPS.includes(state.currentStep)) step = state.currentStep;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unable to load onboarding.';
    } finally {
      loading = false;
    }
  });

  async function saveProgress(currentStep: Step) {
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
    busy = true;
    error = '';
    try {
      await saveProgress('details');
      step = 'details';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unable to continue.';
    } finally {
      busy = false;
    }
  }

  async function nextFromDetails() {
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
      step = 'account';
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
      const cats = await fetch(`/api/workspaces/${firstWorkspaceId}/categories`).then((r) => r.json());
      categories = cats.items ?? [];
      budgetCategoryId = categories.find((c) => c.type === 'expense')?.id ?? '';
      await saveProgress('goal');
      step = 'goal';
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
    if (index > 0) step = STEPS[index - 1]!;
  }
</script>

<svelte:head><title>{t('onboardingTitle')} · CapyBudget</title></svelte:head>
<div class="wrap">
  <p class="eyebrow">CAPYBUDGET</p>
  <h1>{t('onboardingTitle')}</h1>
  <p class="muted">{t('onboardingIntro')}</p>
  {#if loading}
    <p role="status">{authUi.locale === 'id' ? 'Memuat…' : 'Loading…'}</p>
  {:else}
    <ol class="progress" aria-label="Progress">
      {#each STEPS as s, i (s)}
        <li class:done={STEPS.indexOf(step) > i} class:current={step === s} aria-current={step === s ? 'step' : undefined}>{i + 1}</li>
      {/each}
    </ol>
    <Card.Root>
      <Card.Content>
        {#if step === 'usage'}
          <h2>{t('stepUsage')}</h2>
          <div class="choices">
            {#each [{ v: 'personal', title: t('usagePersonal'), hint: t('usagePersonalHint') }, { v: 'business', title: t('usageBusiness'), hint: t('usageBusinessHint') }, { v: 'both', title: t('usageBoth'), hint: t('usageBothHint') }] as item}
              <button type="button" class:active={usageType === item.v} onclick={() => (usageType = item.v as typeof usageType)} aria-pressed={usageType === item.v}>
                <strong>{item.title}</strong><small>{item.hint}</small>
              </button>
            {/each}
          </div>
        {:else if step === 'details'}
          <h2>{t('stepDetails')}</h2>
          <Field.FieldGroup>
            {#if usageType !== 'personal'}
              <Field.Field>
                <Field.FieldLabel for="ob-business">{t('businessName')}</Field.FieldLabel>
                <Input id="ob-business" bind:value={businessName} maxlength={100} placeholder={t('businessNamePlaceholder')} />
              </Field.Field>
            {/if}
            <Field.Field>
              <Field.FieldLabel for="ob-currency">{t('currency')}</Field.FieldLabel>
              <Input id="ob-currency" bind:value={currency} maxlength={3} />
              <Field.FieldDescription>{t('currencyHint')}</Field.FieldDescription>
            </Field.Field>
            <Field.Field>
              <Field.FieldLabel for="ob-language">{t('language')}</Field.FieldLabel>
              <select id="ob-language" bind:value={language}>
                <option value="en">English</option>
                <option value="id">Bahasa Indonesia</option>
              </select>
            </Field.Field>
          </Field.FieldGroup>
        {:else if step === 'account'}
          <h2>{t('stepAccount')}</h2>
          <Field.FieldGroup>
            <Field.Field>
              <Field.FieldLabel for="ob-account">{t('accountName')}</Field.FieldLabel>
              <Input id="ob-account" bind:value={accountName} maxlength={100} placeholder={t('accountNamePlaceholder')} />
            </Field.Field>
            <Field.Field>
              <Field.FieldLabel for="ob-kind">{t('accountType')}</Field.FieldLabel>
              <select id="ob-kind" bind:value={accountKind}>
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="e_wallet">E-Wallet</option>
                <option value="credit_card">Credit Card</option>
                <option value="savings">Savings</option>
                <option value="investment">Investment</option>
              </select>
            </Field.Field>
            <Field.Field>
              <Field.FieldLabel for="ob-balance">{t('openingBalance')}</Field.FieldLabel>
              <Input id="ob-balance" bind:value={openingBalance} inputmode="decimal" placeholder="0" />
              <Field.FieldDescription>{t('openingHint')}</Field.FieldDescription>
            </Field.Field>
          </Field.FieldGroup>
        {:else}
          <h2>{t('stepGoal')}</h2>
          <div class="choices three">
            {#each [{ v: 'budget', label: t('goalChoiceBudget') }, { v: 'goal', label: t('goalChoiceGoal') }, { v: 'skip', label: t('goalChoiceSkip') }] as item}
              <button type="button" class:active={goalChoice === item.v} onclick={() => (goalChoice = item.v as typeof goalChoice)} aria-pressed={goalChoice === item.v}>
                <strong>{item.label}</strong>
              </button>
            {/each}
          </div>
          {#if goalChoice === 'budget'}
            <Field.FieldGroup>
              <Field.Field>
                <Field.FieldLabel for="ob-budget-cat">{t('budgetCategory')}</Field.FieldLabel>
                <select id="ob-budget-cat" bind:value={budgetCategoryId}>
                  {#each categories.filter((c) => c.type === 'expense') as category (category.id)}<option value={category.id}>{category.name}</option>{/each}
                </select>
              </Field.Field>
              <Field.Field>
                <Field.FieldLabel for="ob-budget-amount">{t('budgetAmount')}</Field.FieldLabel>
                <Input id="ob-budget-amount" bind:value={budgetAmount} inputmode="decimal" placeholder="0.00" />
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
                <Input id="ob-goal-target" bind:value={goalTarget} inputmode="decimal" placeholder="0.00" />
              </Field.Field>
              <Field.Field>
                <Field.FieldLabel for="ob-goal-date">{t('goalDate')}</Field.FieldLabel>
                <Input id="ob-goal-date" type="date" bind:value={goalDate} />
              </Field.Field>
            </Field.FieldGroup>
          {/if}
        {/if}
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <div class="actions">
          {#if step !== 'usage'}<Button variant="outline" onclick={back} disabled={busy}>{t('back')}</Button>{/if}
          {#if step === 'usage'}<Button onclick={nextFromUsage} disabled={busy}>{busy ? t('saving') : t('next')}</Button>
          {:else if step === 'details'}<Button onclick={nextFromDetails} disabled={busy}>{busy ? t('saving') : t('next')}</Button>
          {:else if step === 'account'}<Button onclick={nextFromAccount} disabled={busy}>{busy ? t('saving') : t('next')}</Button>
          {:else}<Button onclick={finish} disabled={busy}>{busy ? t('saving') : t('finish')}</Button>{/if}
        </div>
      </Card.Content>
    </Card.Root>
  {/if}
</div>

<style>
  .wrap{max-width:560px;margin:32px auto;padding:0 16px}
  .eyebrow{font-size:11px;letter-spacing:1px;font-weight:700;color:var(--muted-foreground);margin:0 0 6px}
  h1{font:500 30px 'Fredoka Variable',sans-serif;margin:0}
  .muted{color:var(--muted-foreground);margin:7px 0 18px}
  h2{font:500 20px 'Fredoka Variable',sans-serif;margin:6px 0 14px}
  .progress{display:flex;gap:8px;list-style:none;padding:0;margin:0 0 16px}
  .progress li{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--secondary);color:var(--secondary-foreground);font-weight:700}
  .progress li.current{background:var(--primary);color:var(--primary-foreground)}
  .progress li.done{background:#2F7A2A;color:#fff}
  .choices{display:grid;gap:10px;margin-bottom:6px}
  .choices.three{grid-template-columns:repeat(3,minmax(0,1fr))}
  .choices button{display:grid;gap:4px;text-align:left;min-height:64px;border:2px solid var(--input);border-radius:14px;background:var(--background);color:var(--foreground);padding:12px 14px;font:inherit;cursor:pointer}
  .choices button small{color:var(--muted-foreground);font-size:12px}
  .choices button.active{border-color:var(--primary);background:var(--secondary)}
  .actions{display:flex;justify-content:space-between;gap:12px;margin-top:18px}
  .error{color:var(--destructive);font-size:13px}
  select{width:100%;min-height:44px;border:1px solid var(--input);border-radius:var(--radius);background:var(--background);color:var(--foreground);padding:8px 10px}
  @media(max-width:480px){.choices.three{grid-template-columns:1fr}}
</style>
