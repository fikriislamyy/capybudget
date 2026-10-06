<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  onMount(() => { void goto('/join' + window.location.hash,{replaceState:true}); });
</script>
<p role="status">Opening your invitation…</p>
