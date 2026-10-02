<script lang="ts">
  import AmountInput from '$lib/components/forms/amount-input.svelte';
  import * as ToggleGroup from '$lib/components/ui/toggle-group';
  import LoadingScope from '$lib/components/shared/loading-scope.svelte';
  import { cn } from '$lib/utils';
  import ChoiceSelect from '$lib/components/forms/choice-select.svelte';
  import { getContext, tick, untrack, onDestroy } from 'svelte';
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { uxText } from '$lib/i18n/ux';

  import { parseLocalizedAmount } from '$lib/ux/amount';
  import { PRIVACY_CONTEXT, type PrivacyState } from '$lib/privacy';
  const privacy = getContext<PrivacyState>(PRIVACY_CONTEXT);

  type Account = { id: string; name: string; kind: string; currency: string };
  type Category = { id: string; name: string; type: string };

  let { open, workspaceId, onClose, onSaved = () => {} }: { open: boolean; workspaceId: string; onClose: () => void; onSaved?: () => void } = $props();
  const authUi = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const workspace=getContext<{optionsRevision:number}>('capybudget-workspaces');
  const t = (key: Parameters<typeof uxText>[1]) => uxText(authUi.locale, key);

  let internalOpen = $state(false);
  let txType = $state<'expense' | 'income' | 'transfer'>('expense');
  let amount = $state('');
  let accountId = $state('');
  let destinationAccountId = $state('');
  let categoryId = $state('');
  let note = $state('');
  let showOptions = $state(false);
  let accounts = $state<Account[]>([]);
  let categories = $state<Category[]>([]);
  let loadedFor = $state('');
  let loadedRevision=-1;
  let optionsLoading = $state(false);
  let optionsController: AbortController | undefined;
  let optionsSequence = 0;
  let draftWorkspace = '';
  let busy = $state(false);
  let error = $state('');
  let savedFlash = $state(false);
  let savedTimer: number | undefined;

  function clearSavedFeedback() {
    if(savedTimer !== undefined)window.clearTimeout(savedTimer);
    savedTimer=undefined;
    savedFlash=false;
  }
  let lastPayload = $state('');
  let lastKey = $state('');
  let amountInput: HTMLInputElement | null = $state(null);

  const visibleCategories = $derived(categories.filter((c) => c.type === txType));
  const sourceAccount = $derived(accounts.find((a) => a.id === accountId));
  const currency = $derived(sourceAccount?.currency ?? '');

  function lastUsedKey() {
    return `capybudget-last:${workspaceId}`;
  }

  function restoreLastUsed() {
    try {
      const raw = localStorage.getItem(lastUsedKey());
      if (!raw) return;
      const saved = JSON.parse(raw) as { accountId?: string; categoryId?: string; type?: string };
      if (saved.type === 'expense' || saved.type === 'income') txType = saved.type;
      if (saved.accountId && accounts.some((a) => a.id === saved.accountId)) accountId = saved.accountId;
      if (saved.categoryId && categories.some((c) => c.id === saved.categoryId)) categoryId = saved.categoryId;
    } catch { /* Start blank when no usable history exists. */ }
  }

  function rememberLastUsed() {
    try {
      localStorage.setItem(lastUsedKey(), JSON.stringify({ accountId, categoryId, type: txType }));
    } catch { /* History is a convenience, not a requirement. */ }
  }

  async function ensureOptions(id: string) {
    const revision=workspace?.optionsRevision??0;
    if (!id || (loadedFor === id && loadedRevision===revision)) return;
    optionsController?.abort();
    const controller = new AbortController();
    optionsController = controller;
    const sequence = ++optionsSequence;
    optionsLoading = true;
    error = '';
    try {
      const [aRes, cRes] = await Promise.all([
        fetch(`/api/workspaces/${id}/accounts`, { signal: controller.signal }),
        fetch(`/api/workspaces/${id}/categories`, { signal: controller.signal })
      ]);
      if (!aRes.ok || !cRes.ok) throw new Error('Unable to load options.');
      const [a, c] = await Promise.all([aRes.json(), cRes.json()]);
      if (sequence !== optionsSequence || id !== workspaceId) return;
      if (!Array.isArray(a.items) || !Array.isArray(c.items)) throw new Error('Unexpected response.');
      accounts = a.items;
      categories = c.items;
      loadedFor = id;loadedRevision=revision;
      if (!accounts.some(a => a.id === accountId)) accountId = accounts[0]?.id ?? '';
      restoreLastUsed();
      if (!visibleCategories.some(c => c.id === categoryId)) categoryId = '';
    } catch {
      if (sequence === optionsSequence && !controller.signal.aborted) error = authUi.locale === 'id' ? 'Tidak dapat memuat dompet.' : 'Unable to load wallets.';
    } finally {
      if (sequence === optionsSequence) optionsLoading = false;
    }
  }

  function retryOptions() {
    loadedFor = '';
    void ensureOptions(workspaceId);
  }

  $effect(() => { internalOpen = open; });
  $effect(() => {
    const id = workspaceId;
    untrack(() => {
      if (id !== draftWorkspace) {
        optionsController?.abort();
        optionsSequence++;
        draftWorkspace = id;
        loadedFor = '';
        optionsLoading = false;
        accounts = []; categories = [];
        accountId = ''; destinationAccountId = ''; categoryId = '';
        amount = ''; note = ''; lastPayload = ''; lastKey = ''; error = ''; savedFlash = false;
      }
    });
  });
  $effect(() => {
    const visible = internalOpen, id = workspaceId;
    untrack(clearSavedFeedback);
    if (visible && id) {
      untrack(() => void ensureOptions(id));
    }
  });
  onDestroy(() => { optionsController?.abort();clearSavedFeedback(); });

  function today(): string {
    return new Intl.DateTimeFormat('en-CA').format(new Date());
  }

  async function save() {
    if (busy || !workspaceId) return;
    clearSavedFeedback();
    error = '';
    const normalized = parseLocalizedAmount(amount, 'en');
    if (!normalized) {
      error = authUi.locale === 'id' ? 'Masukkan jumlah yang valid.' : 'Enter a valid amount.';
      amountInput?.focus();
      return;
    }
    if (!accountId) {
      error = authUi.locale === 'id' ? 'Pilih dompet sumber.' : 'Choose a source wallet.';
      return;
    }
    if (txType === 'transfer' && (!destinationAccountId || destinationAccountId === accountId)) {
      error = authUi.locale === 'id' ? 'Pilih dompet tujuan yang berbeda.' : 'Choose a different destination wallet.';
      return;
    }
    if (txType !== 'transfer' && !categoryId) {
      error = t('chooseCategory');
      return;
    }
    const submittingWorkspace = workspaceId;
    busy = true;
    try {
      const payload: Record<string, string> = { type: txType, accountId, amount: normalized, date: today() };
      if (txType === 'transfer') payload.destinationAccountId = destinationAccountId;
      else payload.categoryId = categoryId;
      if (note.trim()) payload.notes = note.trim().slice(0, 2000);
      const fingerprint = JSON.stringify(payload);
      if (fingerprint !== lastPayload) {
        lastPayload = fingerprint;
        lastKey = crypto.randomUUID();
      }
      const response = await fetch(`/api/workspaces/${submittingWorkspace}/transactions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': lastKey },
        body: fingerprint
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message ?? 'Unable to save transaction.');
      if (submittingWorkspace !== workspaceId) return;
      rememberLastUsed();
      amount = '';
      note = '';
      lastPayload = '';
      clearSavedFeedback();
      savedFlash = true;
      savedTimer=window.setTimeout(() => {savedFlash=false;savedTimer=undefined;}, 1800);
      onSaved();
      amountInput?.focus();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unable to save transaction.';
    } finally {
      busy = false;
    }
  }

  function switchType(next: 'expense' | 'income' | 'transfer') {
    txType = next;
    categoryId = '';
    destinationAccountId = '';
  }
</script>
<LoadingScope active={!!optionsLoading || !!busy} />

<Sheet.Root
  bind:open={internalOpen}
  onOpenChange={(v) => {
    if (!v) onClose();
  }}
>
  <Sheet.Content side="bottom" class="quickadd-sheet" aria-describedby={undefined} onOpenAutoFocus={(event)=>{event.preventDefault();void tick().then(()=>amountInput?.focus());}}>
    <Sheet.Header class="quickadd-head">
      <Sheet.Title>{t('quickAdd')}</Sheet.Title>
    </Sheet.Header>
    <div class="quickadd-body">
      <ToggleGroup.Root type="single" value={txType} onValueChange={(value) => { if (value) switchType(value as typeof txType); }} spacing={2} class="type-row" aria-label={t('typeLabel')}>
        {#each [{ v: 'expense', en: 'Expense', id: 'Pengeluaran' }, { v: 'income', en: 'Income', id: 'Pemasukan' }, { v: 'transfer', en: 'Transfer', id: 'Transfer' }] as item}
          <ToggleGroup.Item value={item.v}>
            {authUi.locale === 'id' ? item.id : item.en}
          </ToggleGroup.Item>
        {/each}
      </ToggleGroup.Root>
      <div class="source-row">
        <label for="quick-account">{t('account')}</label>
        <ChoiceSelect id="quick-account" bind:value={accountId} disabled={!accounts.length} items={[...(!accounts.length ? [{value: '', label: String(t('loading'))}] : []), ...(accounts).flatMap((account) => [{value: account.id, label: String(account.name) + " · " + String(account.currency)}])]} />
      </div>
      <label class="amount-label" for="quick-amount">{t('amount')}{currency ? ` (${currency})` : ''}</label>
      <AmountInput {currency}
        id="quick-amount"
        bind:ref={amountInput}
        bind:value={amount}
        inputmode="decimal"
        type={privacy.hidden ? 'password' : 'text'}
        placeholder={authUi.locale === 'id' ? '0,00' : '0.00'}
        autocomplete="off"
        aria-invalid={error ? true : undefined}
        onkeydown={(e) => {
          if (e.key === 'Enter') void save();
        }}
      />
      {#if txType === 'transfer'}
        <p class="chips-label" id="quick-dest-label">{t('account')} →</p>
        <div class="chips" role="group" aria-labelledby="quick-dest-label">
          {#each accounts.filter((a) => a.id !== accountId) as account (account.id)}
            <Button variant="ghost" type="button" class={cn('', {"active": destinationAccountId === account.id})} onclick={() => (destinationAccountId = account.id)} aria-pressed={destinationAccountId === account.id}>
              <span class="avatar" aria-hidden="true">{account.name.slice(0, 1).toUpperCase()}</span>{account.name}
            </Button>
          {/each}
        </div>
      {:else}
        <p class="chips-label" id="quick-cat-label">{t('category')}</p>
        <div class="chips" role="group" aria-labelledby="quick-cat-label">
          {#each visibleCategories as category (category.id)}
            <Button variant="ghost" type="button" class={cn('', {"active": categoryId === category.id})} onclick={() => (categoryId = category.id)} aria-pressed={categoryId === category.id}>
              <span class="avatar" aria-hidden="true">{category.name.slice(0, 1).toUpperCase()}</span>{category.name}
            </Button>
          {/each}
        </div>
      {/if}
      {#if optionsLoading}
        <p class="hint" role="status">{t('loading')}</p>
      {:else if !accounts.length && !error}
        <p class="hint">{authUi.locale === 'id' ? 'Belum ada dompet. Buat dulu di halaman Akun.' : 'No wallets yet. Create one on the Accounts page.'}</p>
        <div class="row-actions"><Button variant="outline" size="sm" href="/accounts" onclick={onClose}>{authUi.locale === 'id' ? 'Ke Akun' : 'Go to Accounts'}</Button><Button variant="ghost" size="sm" onclick={retryOptions}>{t('retry')}</Button></div>
      {/if}
      <Button variant="ghost" type="button" class="options-toggle" onclick={() => (showOptions = !showOptions)} aria-expanded={showOptions}>{t('moreOptions')} {showOptions ? '▴' : '▾'}</Button>
      {#if showOptions}
        <div class="options">
          <label for="quick-note">{t('note')}</label>
          <Input id="quick-note" bind:value={note} maxlength={200} />
        </div>
      {/if}
      {#if error}<p class="error" role="alert">{error}</p><Button variant="outline" onclick={retryOptions}>{t('retry')}</Button>{/if}
      {#if savedFlash}<p class="saved" role="status">{t('saved')}</p>{/if}
      <Button class="save" onclick={save} disabled={busy || optionsLoading || !accounts.length}>{busy ? t('saving') : t('save')}</Button>
      <a class="fullform" href="/transactions" onclick={onClose}>{authUi.locale === 'id' ? 'Buka formulir lengkap (tanggal, tag, lampiran)' : 'Open full form (date, tags, receipts)'}</a>
    </div>
  </Sheet.Content>
</Sheet.Root>

<style>
  :global(.quickadd-sheet){max-height:90dvh;border-radius:var(--radius-card) var(--radius-card) 0 0;max-width:560px;margin-inline:auto}
  :global(.quickadd-head){text-align:left}
  .quickadd-body{display:grid;gap:4px;overflow-y:auto;padding:0 16px calc(16px + env(safe-area-inset-bottom))}
  :global(.type-row){display:flex;gap:8px;margin:4px 0 8px}
  :global(.type-row) :global([data-slot="toggle-group-item"]){flex:1;min-height:44px;border:2px solid var(--input);border-radius:var(--radius-button);background:var(--background);color:var(--foreground);font:inherit;font-weight:600;cursor:pointer}
  :global(.type-row) :global([data-slot="toggle-group-item"][data-state="on"]){background:var(--primary);border-color:var(--primary);color:var(--primary-foreground)}
  .source-row{display:grid;gap:4px;margin-bottom:8px}
  .source-row label{font-size:13px;font-weight:700;color:var(--muted-foreground)}
  .amount-label{display:block;font-size:13px;font-weight:700;margin:4px 0 4px;color:var(--muted-foreground)}
  :global(#quick-amount){font-size:26px;font-variant-numeric:tabular-nums;min-height:56px}
  .chips-label{font-size:13px;font-weight:700;margin:12px 0 8px;color:var(--muted-foreground)}
  .chips{display:flex;flex-wrap:wrap;gap:8px}
  .chips :global([data-slot="button"]){display:flex;align-items:center;gap:8px;min-height:44px;border:2px solid var(--input);border-radius:var(--radius-button);background:var(--background);color:var(--foreground);padding:4px 12px 4px 4px;font:inherit;cursor:pointer}
  .chips :global([data-slot="button"].active){border-color:var(--primary);background:var(--secondary)}
  .avatar{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--secondary);color:var(--secondary-foreground);font-weight:700;flex-shrink:0}
  .chips :global([data-slot="button"].active .avatar){background:var(--primary);color:var(--primary-foreground)}
  :global(.options-toggle){margin-top:12px;border:0;background:none;color:var(--brand-ink);font:inherit;font-size:13px;cursor:pointer;padding:8px 0;justify-self:start}
  .options{display:grid;gap:4px;margin-top:4px}
  .options label{font-size:13px;font-weight:700;color:var(--muted-foreground)}
  .hint{font-size:13px;color:var(--muted-foreground)}
  .row-actions{display:flex;gap:8px;flex-wrap:wrap}
  .error{color:var(--destructive);font-size:13px}
  .saved{color:var(--income-ink);font-size:13px}
  :global(.save){width:100%;min-height:48px;margin-top:12px}
  .fullform{display:inline-flex;align-items:center;justify-content:center;min-height:44px;justify-self:center;font-size:13px;color:var(--brand-ink);margin-top:8px}
  @media (min-width:640px){:global(.quickadd-sheet){bottom:24px;border:1px solid var(--border);border-radius:var(--radius-card)}}
</style>
