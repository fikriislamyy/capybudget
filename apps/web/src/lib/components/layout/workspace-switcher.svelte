<script lang="ts">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { selectTriggerStyles } from '$lib/components/ui/select/select-trigger-styles';
  import { cn } from '$lib/utils';
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import PlusIcon from '@lucide/svelte/icons/plus';
  let { value, items, locale, disabled=false, onValueChange, onAddBusiness, triggerRef=$bindable(null) }: {
    value:string;items:{id:string;name:string;kind:string}[];locale:'en'|'id';disabled?:boolean;
    onValueChange:(id:string)=>void;onAddBusiness:()=>void;triggerRef?:HTMLButtonElement|null;
  }=$props();
  let launchingBusiness=$state(false);
  const selected=$derived(items.find(item=>item.id===value));
  const kindLabel=(kind:string)=>kind==='business'?(locale==='id'?'Bisnis':'Business'):(locale==='id'?'Pribadi':'Personal');
</script>
<DropdownMenu.Root onOpenChange={(open)=>{if(open)launchingBusiness=false;}}>
  <DropdownMenu.Trigger>
    {#snippet child({props})}
      <button {...props} bind:this={triggerRef} type="button" id="workspace-switcher" data-slot="select-trigger" data-size="default" {disabled} class={cn(selectTriggerStyles, "workspace-switcher-trigger")} aria-label={locale==='id'?'Pilih ruang kerja':'Choose workspace'}>
        <span data-slot="select-value" class="workspace-label">{selected?`${selected.name} · ${kindLabel(selected.kind)}`:'—'}</span><ChevronDownIcon class="text-muted-foreground size-4 pointer-events-none" aria-hidden="true" />
      </button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="start" class="workspace-switcher-menu" onCloseAutoFocus={(event)=>{if(launchingBusiness)event.preventDefault();}}>
    <DropdownMenu.RadioGroup {value} onValueChange={onValueChange} aria-label={locale==='id'?'Ruang kerja':'Workspaces'}>
      {#each items as item (item.id)}<DropdownMenu.RadioItem value={item.id} closeOnSelect={true}>{item.name} · {kindLabel(item.kind)}</DropdownMenu.RadioItem>{/each}
    </DropdownMenu.RadioGroup>
    <DropdownMenu.Separator />
    <DropdownMenu.Item onclick={()=>{launchingBusiness=true;onAddBusiness();}}><PlusIcon aria-hidden="true" />{locale==='id'?'Tambah bisnis':'Add business'}</DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
<style>
  .workspace-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  :global(.workspace-switcher-menu){min-width:var(--bits-dropdown-menu-anchor-width);max-width:calc(100vw - 32px)}
  :global(.workspace-switcher-menu [role='menuitemradio']),:global(.workspace-switcher-menu [role='menuitem']){overflow-wrap:anywhere}
</style>
