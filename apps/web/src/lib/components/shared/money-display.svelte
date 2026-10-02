<script lang="ts">
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { formatExactAmount } from '$lib/ux/amount';
  import { getContext } from 'svelte';
  import { concealed, PRIVACY_CONTEXT, type PrivacyState } from '$lib/privacy';

  const authUi = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const workspace = getContext<{items:{id:string;currency:string}[];selectedId:string}>('capybudget-workspaces');
  const privacy = getContext<PrivacyState>(PRIVACY_CONTEXT);

  let {
    amount,
    currency = '',
    type = null,
    size = 'md'
  }: {
    amount: string;
    currency?: string;
    type?: 'income' | 'expense' | 'transfer' | null;
    size?: 'md' | 'lg' | 'xl';
  } = $props();

  const displayCurrency = $derived(currency || workspace?.items.find(w => w.id === workspace.selectedId)?.currency || '');
  const displayAmount = $derived(formatExactAmount(amount, authUi.locale));
  const sign = $derived(type === 'expense' ? '−' : type === 'income' ? '+' : '');
</script>

<span class="money {type ?? 'plain'} {size}">{#if displayCurrency}<span class="ccy">{displayCurrency}</span>&nbsp;{/if}{sign}{concealed(displayAmount, privacy.hidden)}</span>

<style>
  .money{font-family:var(--font-body);letter-spacing:-.015em;font-variant-numeric:tabular-nums;font-weight:800;overflow-wrap:anywhere}
  .ccy{font-weight:400;font-size:0.82em;color:var(--muted-foreground)}
  .lg{font-size:1.35rem}
  .xl{font:800 clamp(28px,4vw,36px) var(--font-body)}
  .income{color:var(--income-ink)}
  .expense{color:var(--expense-ink)}
  .transfer{color:var(--transfer-ink)}
</style>
