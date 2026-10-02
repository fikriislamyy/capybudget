<script lang="ts">
  import { cn } from '$lib/utils';
  import { page } from '$app/state';
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import AuthPreferences from '$lib/components/auth/auth-preferences.svelte';
  import { NAV_GROUPS, isActiveRoute, labelFor } from './nav-config';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import MoreIcon from '@lucide/svelte/icons/ellipsis';
  import LogoutIcon from '@lucide/svelte/icons/log-out';
  import LockIcon from '@lucide/svelte/icons/lock';
  import DashboardIcon from '@lucide/svelte/icons/layout-dashboard';
  import TxIcon from '@lucide/svelte/icons/arrow-left-right';
  import AssistantIcon from '@lucide/svelte/icons/bot';

  let {
    locale,
    isBusiness,
    lockEnabled,
    signingOut,
    onQuickAdd,
    onLock,
    onSignOut
  }: {
    locale: 'en' | 'id';
    isBusiness: boolean;
    lockEnabled: boolean;
    signingOut: boolean;
    onQuickAdd: () => void;
    onLock: () => void;
    onSignOut: () => void;
  } = $props();

  let moreOpen = $state(false);
  const path = $derived(page.url.pathname);
  const tab = (href: string, label: string) => ({ href, label, active: isActiveRoute(path, href) });
  const tabs = $derived([
    { ...tab('/dashboard', locale === 'id' ? 'Dasbor' : 'Dashboard'), icon: DashboardIcon },
    { ...tab('/transactions', locale === 'id' ? 'Transaksi' : 'Transactions'), icon: TxIcon },
    { ...tab('/assistant', locale === 'id' ? 'Asisten' : 'Assistant'), icon: AssistantIcon }
  ]);
</script>

<nav class="bottombar" aria-label={locale === 'id' ? 'Navigasi utama' : 'Primary'}>
  {#each tabs.slice(0, 2) as item (item.href)}
    <a href={item.href} class:active={item.active} aria-current={item.active ? 'page' : undefined}>
      <item.icon aria-hidden="true" /><span>{item.label}</span>
    </a>
  {/each}
  <Button variant="ghost" type="button" class="add" onclick={onQuickAdd} aria-label={locale === 'id' ? 'Tambah cepat' : 'Quick add'}>
    <PlusIcon aria-hidden="true" /><span>{locale === 'id' ? 'Tambah' : 'Add'}</span>
  </Button>
  {#each tabs.slice(2) as item (item.href)}
    <a href={item.href} class:active={item.active} aria-current={item.active ? 'page' : undefined}>
      <item.icon aria-hidden="true" /><span>{item.label}</span>
    </a>
  {/each}
  <Button variant="ghost" type="button" class={cn('', {"active": !tabs.some(item => item.active)})} aria-expanded={moreOpen} onclick={() => (moreOpen = true)} aria-label={locale === 'id' ? 'Menu lainnya' : 'More'} aria-haspopup="dialog">
    <MoreIcon aria-hidden="true" /><span>{locale === 'id' ? 'Lainnya' : 'More'}</span>
  </Button>
</nav>

<Button variant="ghost" class="tablet-add" type="button" onclick={onQuickAdd} aria-label={locale === 'id' ? 'Tambah cepat' : 'Quick add'}><PlusIcon aria-hidden="true" /></Button>
<Button variant="ghost" class="tablet-menu" type="button" onclick={() => moreOpen = true} aria-haspopup="dialog" aria-expanded={moreOpen} aria-label={locale === 'id' ? 'Buka menu' : 'Open menu'}><MoreIcon aria-hidden="true" /></Button>
<Sheet.Root bind:open={moreOpen}>
  <Sheet.Content side="bottom" class="more-sheet">
    <Sheet.Header>
      <Sheet.Title>{locale === 'id' ? 'Menu' : 'Menu'}</Sheet.Title>
    </Sheet.Header>
    <div class="more-body">
      {#each NAV_GROUPS as group (group.en)}
        {@const entries = group.entries.filter((e) => !e.businessOnly || isBusiness)}
        {#if entries.length}
          <section aria-label={labelFor(group, locale)}>
            <h3>{labelFor(group, locale)}</h3>
            {#each entries as entry (entry.href)}
              {@const active = isActiveRoute(path, entry.href)}
              <a href={entry.href} class:active onclick={() => (moreOpen = false)} aria-current={active ? 'page' : undefined}>
                <entry.icon aria-hidden="true" />{labelFor(entry, locale)}
              </a>
            {/each}
          </section>
        {/if}
      {/each}
      <section class="row" aria-label={locale === 'id' ? 'Akun' : 'Account'}>
        {#if lockEnabled}<Button variant="outline" onclick={() => { moreOpen = false; onLock(); }}><LockIcon data-icon="inline-start" />{locale === 'id' ? 'Kunci' : 'Lock'}</Button>{/if}
        <Button variant="ghost" onclick={onSignOut} disabled={signingOut}><LogoutIcon data-icon="inline-start" />{signingOut ? '…' : locale === 'id' ? 'Keluar' : 'Sign out'}</Button>
      </section>
      <AuthPreferences />
    </div>
  </Sheet.Content>
</Sheet.Root>

<style>
  :global(.tablet-menu),:global(.tablet-add){display:none}
  .bottombar{position:fixed;left:0;right:0;bottom:0;z-index:var(--z-bottombar);display:grid;grid-template-columns:repeat(5,minmax(0,1fr));background:var(--card);border-top:2px solid var(--border);box-shadow:0 -4px 24px rgb(138 95 58 / .04);padding:4px 4px calc(4px + env(safe-area-inset-bottom))}
  .bottombar a,.bottombar :global([data-slot="button"]){display:flex;flex-direction:column;align-items:center;gap:2px;min-height:52px;justify-content:center;color:var(--muted-foreground);text-decoration:none;font-size:11px;font-weight:800;border:0;background:none;cursor:pointer;border-radius:var(--radius-input)}
  .bottombar a.active,.bottombar :global([data-slot="button"].active){color:var(--brand-ink);background:var(--secondary)}
  .bottombar :global(.add){color:var(--primary-foreground)}
  .bottombar :global(.add svg){background:var(--primary);border-radius:50%;padding:4px;width:34px;height:34px}
  .bottombar :global(.add span){color:var(--brand-ink);font-weight:700}
  :global(.more-sheet){max-height:86dvh;border-radius:20px 20px 0 0}
  .more-body{display:grid;gap:16px;overflow-y:auto;padding-bottom:calc(12px + env(safe-area-inset-bottom))}
  .more-body section{display:grid;gap:2px}
  .more-body h3{font-size:12px;letter-spacing:0.5px;text-transform:uppercase;color:var(--muted-foreground);margin:0 0 4px}
  .more-body section a{display:flex;align-items:center;gap:12px;min-height:44px;padding:4px 8px;border-radius:var(--radius-input);color:var(--foreground);text-decoration:none;font-weight:600}
  .more-body section a.active{background:var(--secondary)}
  .more-body .row{display:flex;gap:8px;flex-wrap:wrap}
  @media (min-width:768px) and (max-width:1023px){.bottombar{display:none}:global(.tablet-menu),:global(.tablet-add){display:grid;place-items:center;position:fixed;top:10px;left:16px;z-index:31;width:44px;height:44px;border:1px solid var(--border);border-radius:var(--radius-input);background:var(--background);color:var(--foreground)}:global(.tablet-add){top:auto;left:auto;right:24px;bottom:24px;background:var(--primary);color:var(--primary-foreground);border-radius:50%;width:56px;height:56px}}
  @media(max-width:360px){.bottombar a,.bottombar :global([data-slot="button"]){font-size:10px}}
  @media(min-width:1024px){.bottombar{display:none}}
</style>
