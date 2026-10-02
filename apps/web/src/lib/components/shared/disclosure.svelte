<script lang="ts">
  import { Collapsible } from 'bits-ui';
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import { Button } from '$lib/components/ui/button';
  import type { Snippet } from 'svelte';
  let { open = $bindable(false), title, children, class: className }: { open?: boolean; title: Snippet; children: Snippet; class?: string } = $props();
</script>
<Collapsible.Root bind:open class={className} data-slot="disclosure">
  <Collapsible.Trigger>
    {#snippet child({ props })}<Button {...props} type="button" variant="ghost" class="disclosure-trigger" aria-expanded={open}><span>{@render title()}</span><ChevronDownIcon data-icon="inline-end" /></Button>{/snippet}
  </Collapsible.Trigger>
  <Collapsible.Content data-slot="disclosure-content">{@render children()}</Collapsible.Content>
</Collapsible.Root>
<style>
  :global(.disclosure-trigger){width:100%;justify-content:space-between;text-align:left;white-space:normal;gap:12px;padding:8px 0;font-size:14px}
  :global(.disclosure-trigger[aria-expanded='true'] svg){transform:rotate(180deg)}
  :global([data-slot='disclosure-content']){display:flex;flex-direction:column;gap:16px;padding-top:12px}
</style>
