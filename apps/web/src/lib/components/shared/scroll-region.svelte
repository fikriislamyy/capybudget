<script lang="ts">
  import type { Snippet } from 'svelte';
  let {label,maxHeight='420px',children}:{label:string;maxHeight?:string;children:Snippet}=$props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to focus this labeled region to scroll the table.) -->
<div class="scroll-region" role="region" tabindex="0" aria-label={label} style:max-height={maxHeight}>
  {@render children()}
</div>

<style>
  .scroll-region{min-width:0;overflow:auto;border:1px solid var(--border);border-radius:var(--radius-input)}
</style>
