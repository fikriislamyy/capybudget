<script lang="ts">
  import { getContext } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { uxText } from '$lib/i18n/ux';

  type Account = { id: string; name: string; kind: string; currency: string };
  type Category = { id: string; name: string; type: string };

  let { open, workspaceId, onClose, onSaved }: { open: boolean; workspaceId: string; onClose: () => void; onSaved: () => void } = $props();
  const authUi = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const t = (key: Parameters<typeof uxText>[1]) => uxText(authUi.locale, key);

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
  let busy = $state(false);
  let error = $state('');
  let savedFlash = $state(false);
  let amountInput: HTMLInputElement | null = $state(null);

  const visibleCategories = $derived(categories.filter((c) => c.type === txType));
  const currency = $derived(accounts.find((a) => a.id === accountId)?.currency ?? '');

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

  async function ensureOptions() {
    if (!workspaceId || loadedFor === workspaceId) return;
    error = '';
    try {
      const [a, c] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}/accounts`).then((r) => r.json()),
        fetch(`/api/workspaces/${workspaceId}/categories`).then((r) => r.json())
      ]);
      accounts = a.items ?? [];
      categories = c.items ?? [];
      loadedFor = workspaceId;
      if (!accountId && accounts.length) accountId = accounts[0].id;
      restoreLastUsed();
    } catch {
      error = authUi.locale === 'id' ? 'Tidak dapat memuat dompet.' : 'Unable to load wallets.';
    }
  }

  $effect(() => {
    if (open && workspaceId) {
      void ensureOptions();
      const timer = window.setTimeout(() => amountInput?.focus(), 60);
      return () => window.clearTimeout(timer);
    }
  });

  function validAmount(value: string): boolean {
    return /^(0|[1-9]\d{0,14})(\.\d{1,4})?$/.test(value) && Number(value) !== 0;
  }

  function today(): string {
    return new Intl.DateTimeFormat('en-CA').format(new Date());
  }

  async function save() {
    if (busy || !workspaceId) return;
    error = '';
    if (!validAmount(amount.trim())) {
      error = authUi.locale === 'id' ? 'Masukkan jumlah yang valid.' : 'Enter a valid amount.';
      amountInput?.focus();
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
    busy = true;
    try {
      const payload: Record<string, string> = { type: txType, accountId, amount: amount.trim(), date: today() };
      if (txType === 'transfer') payload.destinationAccountId = destinationAccountId;
      else payload.categoryId = categoryId;
      if (note.trim()) payload.notes = note.trim().slice(0, 2000);
      const response = await fetch(`/api/workspaces/${workspaceId}/transactions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message ?? 'Unable to save transaction.');
      rememberLastUsed();
      amount = '';
      note = '';
      savedFlash = true;
      window.setTimeout(() => (savedFlash = false), 1800);
      onSaved();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unable to save transaction.';
    } finally {
      busy = false;
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose();
  }

  function switchType(next: 'expense' | 'income' | 'transfer') {
    txType = next;
    categoryId = '';
    destinationAccountId = '';
  }
</script>

{#if open}
  <div class="backdrop" onclick={onClose} aria-hidden="true"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label={t('quickAdd')} tabindex="-1" onkeydown={onKeydown}>
    <div class="grabber" aria-hidden="true"></div>
    <header>
      <h2>{t('quickAdd')}</h2>
      <Button variant="ghost" size="sm" onclick={onClose} aria-label={authUi.locale === 'id' ? 'Tutup' : 'Close'}>×</Button>
    </header>
    <div class="type-row" role="group" aria-label="Type">
      {#each [{ v: 'expense', en: 'Expense', id: 'Pengeluaran' }, { v: 'income', en: 'Income', id: 'Pemasukan' }, { v: 'transfer', en: 'Transfer', id: 'Transfer' }] as item}
        <button type="button" class:active={txType === item.v} onclick={() => switchType(item.v as typeof txType)} aria-pressed={txType === item.v}>
          {authUi.locale === 'id' ? item.id : item.en}
        </button>
      {/each}
    </div>
    <label class="amount-label" for="quick-amount">{t('amount')}{currency ? ` (${currency})` : ''}</label>
    <Input id="quick-amount" bind:ref={amountInput} bind:value={amount} inputmode="decimal" placeholder="0.00" autocomplete="off" onkeydown={(e) => e.key === 'Enter' && void save()} />
    {#if txType === 'transfer'}
      <p class="chips-label">{t('account')} →</p>
      <div class="chips">
        {#each accounts.filter((a) => a.id !== accountId) as account (account.id)}
          <button type="button" class:active={destinationAccountId === account.id} onclick={() => (destinationAccountId = account.id)} aria-pressed={destinationAccountId === account.id}>
            <span class="avatar" aria-hidden="true">{account.name.slice(0, 1).toUpperCase()}</span>{account.name}
          </button>
        {/each}
      </div>
    {:else}
      <p class="chips-label">{t('category')}</p>
      <div class="chips">
        {#each visibleCategories as category (category.id)}
          <button type="button" class:active={categoryId === category.id} onclick={() => (categoryId = category.id)} aria-pressed={categoryId === category.id}>
            <span class="avatar" aria-hidden="true">{category.name.slice(0, 1).toUpperCase()}</span>{category.name}
          </button>
        {/each}
      </div>
    {/if}
    <button type="button" class="options-toggle" onclick={() => (showOptions = !showOptions)} aria-expanded={showOptions}>{t('moreOptions')} {showOptions ? '▴' : '▾'}</button>
    {#if showOptions}
      <div class="options">
        <label for="quick-account">{t('account')}</label>
        <select id="quick-account" bind:value={accountId}>
          {#each accounts as account (account.id)}<option value={account.id}>{account.name}</option>{/each}
        </select>
        <label for="quick-note">{t('note')}</label>
        <Input id="quick-note" bind:value={note} maxlength={200} />
      </div>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if savedFlash}<p class="saved" role="status">{t('saved')}</p>{/if}
    <Button class="save" onclick={save} disabled={busy || !accounts.length}>{busy ? t('saving') : t('save')}</Button>
  </div>
{/if}

<style>
  .backdrop{position:fixed;inset:0;background:#24190e55;z-index:40}
  .sheet{position:fixed;left:50%;transform:translateX(-50%);bottom:0;z-index:41;width:min(520px,100%);max-height:88svh;overflow:auto;background:var(--card);color:var(--card-foreground);border:1px solid var(--border);border-bottom:0;border-radius:20px 20px 0 0;padding:10px 20px 24px;animation:rise 250ms cubic-bezier(0.34,1.3,0.64,1)}
  .grabber{width:44px;height:5px;border-radius:99px;background:var(--border);margin:2px auto 12px}
  header{display:flex;align-items:center;justify-content:space-between}
  h2{font:500 21px 'Fredoka Variable',sans-serif;margin:0}
  .type-row{display:flex;gap:8px;margin:12px 0}
  .type-row button{flex:1;min-height:44px;border:1px solid var(--input);border-radius:99px;background:var(--background);color:var(--foreground);font:inherit;font-weight:600;cursor:pointer}
  .type-row button.active{background:var(--primary);border-color:var(--primary);color:var(--primary-foreground)}
  .amount-label{display:block;font-size:13px;font-weight:700;margin:4px 0 6px;color:var(--muted-foreground)}
  :global(#quick-amount){font-size:26px;font-variant-numeric:tabular-nums;min-height:56px}
  .chips-label{font-size:13px;font-weight:700;margin:14px 0 8px;color:var(--muted-foreground)}
  .chips{display:flex;flex-wrap:wrap;gap:8px}
  .chips button{display:flex;align-items:center;gap:8px;min-height:44px;border:1px solid var(--input);border-radius:99px;background:var(--background);color:var(--foreground);padding:6px 14px 6px 6px;font:inherit;cursor:pointer}
  .chips button.active{border-color:var(--primary);background:var(--secondary)}
  .avatar{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--secondary);color:var(--secondary-foreground);font-weight:700}
  .chips button.active .avatar{background:var(--primary);color:var(--primary-foreground)}
  .options-toggle{margin-top:14px;border:0;background:none;color:var(--primary);font:inherit;font-size:13px;cursor:pointer;padding:8px 0}
  .options{display:grid;gap:6px;margin-top:4px}
  .options label{font-size:13px;font-weight:700;color:var(--muted-foreground)}
  .options select{min-height:44px;border:1px solid var(--input);border-radius:var(--radius);background:var(--background);color:var(--foreground);padding:8px 10px}
  .error{color:var(--destructive);font-size:13px}
  .saved{color:#2F7A2A;font-size:13px}
  :global(.save){width:100%;min-height:48px;margin-top:12px}
  @keyframes rise{from{transform:translate(-50%,24px);opacity:0.6}to{transform:translate(-50%,0);opacity:1}}
  @media (prefers-reduced-motion: reduce){.sheet{animation:none}}
  @media (min-width:640px){.sheet{bottom:24px;border-bottom:1px solid var(--border);border-radius:20px}}
</style>
