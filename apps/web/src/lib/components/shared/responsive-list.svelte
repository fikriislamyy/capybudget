<script lang="ts">
  import type { Snippet } from 'svelte';

  let { label, children }: { label: string; children: Snippet } = $props();
</script>

<ul aria-label={label} class="rlist">{@render children()}</ul>

<style>
  .rlist{list-style:none;margin:0;padding:0;display:grid;min-width:0}
  .rlist > :global(li){padding:12px 2px;border-bottom:1px solid var(--border);min-width:0}
  .rlist > :global(li:last-child){border-bottom:0}
</style>
