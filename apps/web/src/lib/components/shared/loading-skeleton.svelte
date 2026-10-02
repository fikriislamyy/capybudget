<script lang="ts">
  import { Skeleton } from '$lib/components/ui/skeleton';

  let { rows = 3, label }: { rows?: number; label: string } = $props();
</script>

<div role="status" aria-label={label} class="stack">
  {#each Array(rows) as _, i (i)}<Skeleton class="h-12 w-full rounded-xl" />{/each}
</div>

<style>
  .stack{display:grid;gap:10px}
</style>
