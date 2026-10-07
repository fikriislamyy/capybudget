<script lang="ts">
  import ChatLoading from './chat-loading.svelte';
  import {getContext, untrack, type Component} from 'svelte';
  import {AUTH_UI_CONTEXT,type AuthUiState} from '$lib/i18n/auth';
  import {Button} from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import CapyMascot from '$lib/components/shared/capy-mascot.svelte';
  let {workspaceId,workspaceName,currency}:{workspaceId:string;workspaceName:string;currency:string}=$props();
  const ui=getContext<AuthUiState>(AUTH_UI_CONTEXT);
  let open=$state(false),loading=$state(false),error=$state(false);
  let ChatRoom=$state<Component<{workspaceId:string;workspaceName:string;currency:string;onNavigate:()=>void}>|null>(null);
  async function load(){if(ChatRoom||loading)return;loading=true;error=false;try{ChatRoom=(await import('./chat-room.svelte')).default;}catch{error=true;}finally{loading=false;}}
  $effect(()=>{if(open)untrack(()=>void load());});
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger>
    {#snippet child({props})}
      <Button {...props} class="capy-chat-launcher" variant="outline" aria-label={ui.locale==='id'?'Buka percakapan Capy':'Open Capy chat'}>
        <CapyMascot size={40}/><span>{ui.locale==='id'?'Tanya Capy':'Ask Capy'}</span>
      </Button>
    {/snippet}
  </Dialog.Trigger>
  <Dialog.Content class="capy-chat-dialog" showCloseButton={true}>
    <Dialog.Header class="capy-chat-header">
      <div class="title-row"><CapyMascot size={48}/><div><Dialog.Title>{ui.locale==='id'?'Tanya Capy':'Ask Capy'}</Dialog.Title><Dialog.Description>{ui.locale==='id'?'Sedikit kejelasan tentang uangmu.':'A little clarity about your money.'}</Dialog.Description></div></div>
    </Dialog.Header>
    {#if ChatRoom && open}<ChatRoom {workspaceId} {workspaceName} {currency} onNavigate={()=>open=false}/>
    {:else if error}<div class="widget-status" role="alert"><p>{ui.locale==='id'?'Percakapan belum dapat dibuka.':'The chat could not open.'}</p><Button onclick={load}>{ui.locale==='id'?'Coba lagi':'Retry'}</Button></div>
    {:else}<ChatLoading phase="opening"/>{/if}
  </Dialog.Content>
</Dialog.Root>

<style>
  :global(.capy-chat-launcher){position:fixed;right:24px;bottom:96px;z-index:var(--z-fab,30);min-height:52px;gap:8px;padding:8px 16px;background:var(--card);color:var(--brand-ink);border:2px solid var(--border);box-shadow:var(--shadow-raised);font-size:14px;transition:transform 180ms ease-out}
  :global(.capy-chat-launcher:active){transform:scale(.96)}
  :global(.capy-chat-dialog){top:auto!important;left:auto!important;right:24px;bottom:24px;transform:none!important;translate:none!important;width:min(460px,calc(100vw - 32px));max-width:none!important;height:min(720px,calc(100dvh - 48px));max-height:calc(100dvh - 48px);display:flex!important;flex-direction:column;gap:0!important;padding:0!important;border:2px solid var(--border);border-radius:var(--radius-card);background:var(--background);box-shadow:var(--shadow-raised);overflow:hidden}
  :global(.capy-chat-header){padding:20px 56px 16px 20px!important;border-bottom:2px solid var(--border);background:var(--card);text-align:left!important;flex-shrink:0}
  :global(.capy-chat-dialog [data-slot="dialog-close"]){min-width:44px;min-height:44px}
  .title-row{display:flex;align-items:center;gap:12px}.widget-status{padding:24px;display:grid;gap:16px;color:var(--muted-foreground)}
  @media(max-width:1023px){:global(.capy-chat-launcher){right:16px;bottom:calc(96px + env(safe-area-inset-bottom))}}
  @media(max-width:600px){:global(.capy-chat-dialog){right:8px;bottom:calc(8px + env(safe-area-inset-bottom));width:calc(100vw - 16px);height:calc(100dvh - 24px - env(safe-area-inset-bottom));max-height:calc(100dvh - 24px - env(safe-area-inset-bottom))}}
  @media(prefers-reduced-motion:reduce){:global(.capy-chat-launcher){transition:none}:global(.capy-chat-dialog){animation:none!important}}
</style>
