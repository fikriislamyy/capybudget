<script lang="ts">
  import FilePenIcon from '@lucide/svelte/icons/file-pen';
  import FileCheckIcon from '@lucide/svelte/icons/file-check';
  import SendIcon from '@lucide/svelte/icons/send';
  import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
  import CircleDollarSignIcon from '@lucide/svelte/icons/circle-dollar-sign';
  import ClockAlertIcon from '@lucide/svelte/icons/clock-alert';
  import CircleMinusIcon from '@lucide/svelte/icons/circle-minus';
  import { businessText } from '$lib/i18n/business';
  import type { Locale } from '$lib/i18n/auth';

  let { status, locale }: { status: string; locale: Locale } = $props();
  const states = {
    draft: { icon: FilePenIcon, tone: 'neutral', label: 'draft', hint: 'draftStatusHint' },
    issued: { icon: FileCheckIcon, tone: 'info', label: 'issued', hint: 'issuedStatusHint' },
    sent: { icon: SendIcon, tone: 'info', label: 'sent', hint: 'sentStatusHint' },
    partially_paid: { icon: CircleDollarSignIcon, tone: 'info', label: 'partially_paid', hint: 'partialStatusHint' },
    paid: { icon: CircleCheckIcon, tone: 'income', label: 'paidStatus', hint: 'paidStatusHint' },
    overdue: { icon: ClockAlertIcon, tone: 'expense', label: 'overdue', hint: 'overdueStatusHint' },
    void: { icon: CircleMinusIcon, tone: 'neutral', label: 'void', hint: 'voidStatusHint' }
  } as const;
  const state = $derived(states[status as keyof typeof states]);
</script>

<div class="invoice-status" role="status" aria-live="polite" aria-atomic="true">
  <div class="status-row">
    <span class="caption">{businessText(locale, 'statusCol')}</span>
    <span class="status-chip" data-tone={state?.tone ?? 'neutral'}>
      {#if state}<state.icon size={20} strokeWidth={2} aria-hidden="true" />{/if}
      <strong>{state ? businessText(locale, state.label) : status}</strong>
    </span>
  </div>
  {#if state}<p>{businessText(locale, state.hint)}</p>{/if}
</div>

<style>
  .invoice-status{display:grid;gap:8px;max-width:48ch}
  .status-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
  .caption{color:var(--muted-foreground);font-size:13px;font-weight:600}
  .status-chip{display:inline-flex;align-items:center;gap:8px;min-height:44px;max-width:100%;padding:8px 16px;border:2px solid var(--border);border-radius:var(--radius-input);background:var(--secondary);color:var(--foreground);font-size:16px;line-height:1.5}
  .status-chip strong{font-weight:800;overflow-wrap:anywhere;min-width:0}
  .status-chip[data-tone='info'] strong{color:var(--foreground)}
  .status-chip :global(svg){flex-shrink:0}
  .status-chip[data-tone='info']{color:var(--text-blue);background:var(--pond-soft);border-color:color-mix(in srgb,var(--text-blue) 40%,var(--border))}
  .status-chip[data-tone='income']{color:var(--income-ink);background:var(--leaf-soft);border-color:color-mix(in srgb,var(--income-ink) 40%,var(--border))}
  .status-chip[data-tone='expense']{color:var(--text-coral);background:var(--coral-soft);border-color:color-mix(in srgb,var(--text-coral) 40%,var(--border))}
  p{margin:0;color:var(--muted-foreground);font-size:14px;line-height:1.5}
</style>
