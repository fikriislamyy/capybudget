<script lang="ts">
  import { untrack } from 'svelte';
  import { loadingState } from '$lib/loading.svelte';
  let { active = false }: { active?: boolean } = $props();
  $effect(() => {
    if (!active) return;
    untrack(() => loadingState.scopes++);
    return () => untrack(() => { loadingState.scopes = Math.max(0, loadingState.scopes - 1); });
  });
</script>
