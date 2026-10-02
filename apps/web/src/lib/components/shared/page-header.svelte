<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    eyebrow = '',
    title,
    description = '',
    actions,
    metadata
  }: { eyebrow?: string; title: string; description?: string; actions?: Snippet; metadata?: Snippet } = $props();
</script>

<div class="page-header">
  <div class="titles">
    {#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
    <h1>{title}</h1>
    {#if description}<p class="muted">{description}</p>{/if}
    {#if metadata}<div class="metadata">{@render metadata()}</div>{/if}
  </div>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</div>

<style>
  .page-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:24px}
  .titles{min-width:0}
  .eyebrow{font-size:11px;letter-spacing:1.5px;font-weight:800;color:var(--muted-foreground);margin:0 0 6px}
  h1{font:500 clamp(26px,3vw,32px) var(--font-heading);margin:0;text-wrap:balance;color:var(--brand-ink);line-height:1.18}
  .muted{color:var(--muted-foreground);margin:8px 0 0;line-height:1.65;max-width:64ch}
  .metadata{margin-top:12px}
  .actions{display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap}
  @media(max-width:600px){.page-header{flex-direction:column}.actions{width:100%}}
</style>
