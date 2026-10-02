<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Badge } from '$lib/components/ui/badge';

  let {
    tone = 'neutral',
    children
  }: {
    tone?: 'income' | 'expense' | 'transfer' | 'warning' | 'info' | 'neutral';
    children: Snippet;
  } = $props();

  const variant = $derived(tone === 'expense' ? 'destructive' : tone === 'neutral' ? 'secondary' : 'outline');
</script>

<Badge {variant} class="status-{tone}">{@render children()}</Badge>

<style>
  :global([data-slot=badge]){border-radius:var(--radius-input)}
  :global(.status-expense){color:var(--text-coral);border-color:var(--expense);background:var(--coral-soft)}
  :global(.status-income){color:var(--income-ink);border-color:var(--income);background:color-mix(in srgb,var(--income) 12%,transparent)}
  :global(.status-transfer){color:var(--transfer-ink);border-color:var(--transfer);background:color-mix(in srgb,var(--transfer) 12%,transparent)}
  :global(.status-warning){color:var(--warning-ink);border-color:var(--accent);background:color-mix(in srgb,var(--accent) 16%,transparent)}
  :global(.status-info){color:var(--ring);border-color:var(--ring);background:color-mix(in srgb,var(--ring) 10%,transparent)}
</style>
