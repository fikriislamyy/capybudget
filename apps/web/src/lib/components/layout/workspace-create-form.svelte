<script lang="ts">
  import LoadingScope from '$lib/components/shared/loading-scope.svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import CurrencySelect from '$lib/components/forms/currency-select.svelte';
  import TimezoneSelect from '$lib/components/forms/timezone-select.svelte';

  export type CreatedWorkspace = { id: string; name: string; kind: 'personal' | 'business'; currency: string; timezone: string };

  let { locale, onCreated, open=$bindable(false), onCloseFocus }: { locale: 'en' | 'id'; onCreated: (w: CreatedWorkspace) => void; open?:boolean;onCloseFocus?:()=>void } = $props();
  let name = $state('');
  let currency = $state('IDR');
  let timezone = $state('Asia/Jakarta');
  let busy = $state(false);
  let currencyReady = $state(false), timezoneReady = $state(false);
  let error = $state('');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy || !name.trim() || !currencyReady || !timezoneReady) return;
    busy = true;
    error = '';
    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), kind: 'business', currency: currency.trim().toUpperCase() || 'IDR', timezone: timezone.trim() || 'Asia/Jakarta' })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? 'Unable to create workspace.');
      onCreated(body.workspace);
      name = '';
      open = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unable to create workspace.';
    } finally {
      busy = false;
    }
  }
</script>
<LoadingScope active={!!busy} />

<Dialog.Root bind:open onOpenChange={(next)=>{if(next)error='';}}>
  <Dialog.Content class="workspace-create-dialog" onCloseAutoFocus={(event)=>{if(onCloseFocus){event.preventDefault();onCloseFocus();}}} showCloseButton={!busy} onEscapeKeydown={(event)=>{if(busy)event.preventDefault();}} onInteractOutside={(event)=>{if(busy)event.preventDefault();}}>
    <Dialog.Header><Dialog.Title>{locale==='id'?'Tambah bisnis':'Add business'}</Dialog.Title><Dialog.Description>{locale==='id'?'Pisahkan keuangan bisnis dalam ruang kerja baru.':'Keep this business’s finances in its own workspace.'}</Dialog.Description></Dialog.Header>
    <form onsubmit={submit}>
      <label for="ws-name">{locale === 'id' ? 'Nama bisnis' : 'Business name'}</label>
      <Input id="ws-name" bind:value={name} disabled={busy} maxlength={100} required placeholder={locale === 'id' ? 'Studio atau toko' : 'Studio or shop'} />
      <div class="pair">
        <div><label for="ws-currency">{locale === 'id' ? 'Mata uang' : 'Currency'}</label><CurrencySelect id="ws-currency" bind:value={currency} bind:ready={currencyReady} disabled={busy} /></div>
        <div><label for="ws-tz">{locale === 'id' ? 'Zona waktu' : 'Timezone'}</label><TimezoneSelect id="ws-tz" bind:value={timezone} bind:ready={timezoneReady} disabled={busy} /></div>
      </div>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <Dialog.Footer class="workspace-create-footer"><Button type="button" variant="outline" disabled={busy} onclick={()=>open=false}>{locale==='id'?'Batal':'Cancel'}</Button><Button type="submit" disabled={busy || !currencyReady || !timezoneReady}>{busy?'…':locale==='id'?'Buat bisnis':'Create business'}</Button></Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<style>
  :global(.workspace-create-dialog){width:480px;max-width:calc(100vw - 32px);padding:24px;max-height:calc(100dvh - 32px);overflow-y:auto}
  :global(.workspace-create-footer){margin-top:16px}
  :global(.workspace-create-dialog [data-slot="dialog-header"]){padding-right:24px;text-align:left}

  form{display:grid;gap:12px;font-size:13px}
  .pair{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
  .pair>div{display:grid;gap:4px}
  form label{font-weight:600}
  .error{color:var(--destructive);font-size:12px;margin:0}
  @media(max-width:480px){:global(.workspace-create-dialog){padding:16px}.pair{grid-template-columns:1fr}}
</style>
