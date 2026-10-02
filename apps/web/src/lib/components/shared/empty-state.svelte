<script lang="ts">
  import CapyMascot from './capy-mascot.svelte';
  import { Button } from '$lib/components/ui/button';

  let {
    title,
    body,
    actionLabel = '',
    actionHref = '',
    onAction
  }: {
    title: string;
    body: string;
    actionLabel?: string;
    actionHref?: string;
    onAction?: () => void;
  } = $props();
</script>

<div class="empty">
  <CapyMascot size={80} state="sleeping" />
  <strong>{title}</strong>
  <p>{body}</p>
  {#if actionLabel && actionHref}<Button variant="outline" href={actionHref}>{actionLabel}</Button>
  {:else if actionLabel && onAction}<Button variant="outline" onclick={onAction}>{actionLabel}</Button>{/if}
</div>

<style>
  .empty{text-align:center;padding:32px 16px;display:grid;gap:8px;justify-items:center;color:var(--muted-foreground)}
  .empty strong{color:var(--brand-ink);font:500 20px var(--font-heading)}
  .empty p{margin:0 0 8px;max-width:36ch;line-height:1.8}
</style>
