<script lang="ts">
  import { getContext, onMount, tick } from 'svelte';
  import { Command } from 'bits-ui';
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import LoadingScope from '$lib/components/shared/loading-scope.svelte';
  import Check from '@lucide/svelte/icons/check';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import Search from '@lucide/svelte/icons/search';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';

  type Timezone = { id: string };
  let { value = $bindable('Asia/Jakarta'), ready = $bindable(false), id, disabled = false }: {
    value?: string; ready?: boolean; id: string; disabled?: boolean;
  } = $props();
  const ui = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const isId = $derived(ui.locale === 'id');
  let items: Timezone[] = $state([]);
  let loading = $state(false), error = $state(false), open = $state(false), search = $state('');
  let source = $state<'timeapi' | 'cached' | 'fallback'>('timeapi');
  let controller: AbortController | undefined;
  let searchInput = $state<HTMLInputElement | null>(null);
  const options = $derived(items.map(item => ({ ...item, label: item.id.replaceAll('_', ' ') })));
  const selected = $derived(options.find(item => item.id === value));
  $effect(() => { ready = !loading && !error && !!selected; });

  function normalizeSearch(text: string) {
    return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
  }
  function matchTimezone(code: string, query: string, keywords: string[] = []) {
    const search = normalizeSearch(query);
    if (!search) return 1;
    const normalizedCode = normalizeSearch(code);
    if (normalizedCode === search) return 1;
    if (normalizedCode.startsWith(search)) return 0.95;
    const text = [normalizedCode, ...keywords.map(normalizeSearch)].join(' ');
    return search.split(/\s+/).every(word => text.includes(word)) ? 0.7 : 0;
  }

  async function load() {
    if (loading) return;
    controller = new AbortController();
    const signal = controller.signal;
    loading = true;
    error = false;
    try {
      const response = await fetch('/api/timezones', {
        credentials: 'same-origin', signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) throw new Error('Unable to load timezones');
      const body = await response.json();
      if (!Array.isArray(body.items)) throw new Error('Invalid timezones');
      const parsed = body.items.filter((item: Timezone) => item && typeof item.id === 'string' && /^[A-Za-z0-9_+\-/]{1,100}$/.test(item.id));
      if (!parsed.length) throw new Error('Empty timezones');
      if (signal.aborted) return;
      items = parsed;
      source = body.source === 'fallback' || body.source === 'cached' ? body.source : 'timeapi';
    } catch {
      if (!signal.aborted) error = true;
    } finally {
      if (!signal.aborted) loading = false;
    }
  }
  onMount(() => {
    void load();
    return () => controller?.abort();
  });
  async function focusSearch(event: Event) {
    event.preventDefault();
    await tick();
    searchInput?.focus();
  }
</script>

<LoadingScope active={loading} />
<div class="timezone-select">
  <Popover.Root bind:open onOpenChange={() => { search = ''; }}>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button {...props} {id} type="button" variant="outline" class="timezone-trigger" disabled={disabled || loading || error} aria-describedby={`${id}-hint`} aria-label={`${isId ? 'Zona waktu' : 'Timezone'}: ${selected ? selected.label : (isId ? 'Pilih zona waktu' : 'Choose a timezone')}`}>
          <span class="selection">{#if loading}{isId ? 'Memuat zona waktu…' : 'Loading timezones…'}{:else if selected}<span>{selected.label}</span>{:else}{isId ? 'Pilih zona waktu' : 'Choose a timezone'}{/if}</span>
          <ChevronsUpDown size={16} aria-hidden="true" />
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content align="start" class="timezone-menu" onOpenAutoFocus={focusSearch}>
      <Command.Root label={isId ? 'Pilih zona waktu' : 'Choose a timezone'} filter={matchTimezone} loop>
        <div class="search-row"><Search size={18} aria-hidden="true" /><Command.Input bind:ref={searchInput} bind:value={search} placeholder={isId ? 'Cari kota atau wilayah…' : 'Search city or region…'} aria-label={isId ? 'Cari zona waktu' : 'Search timezones'} /></div>
        <Command.List class="timezone-list">
          <Command.Empty class="no-results">{isId ? 'Tidak ada zona waktu yang cocok.' : 'No matching timezones.'}</Command.Empty>
          {#each options as item (item.id)}
            <Command.Item class="timezone-option" value={item.id} keywords={[item.label]} onSelect={() => { value = item.id; open = false; }}>
              <span>{item.label}</span><span class="check">{#if value === item.id}<Check size={18} aria-hidden="true" /><span class="sr-only">{isId ? 'Dipilih' : 'Selected'}</span>{/if}</span>
            </Command.Item>
          {/each}
        </Command.List>
      </Command.Root>
    </Popover.Content>
  </Popover.Root>
  <div id={`${id}-hint`} class="hint" role="status" aria-live="polite">
    {#if error}<span>{isId ? 'Zona waktu belum dapat dimuat.' : 'Timezones could not be loaded.'}</span><Button type="button" variant="ghost" size="sm" onclick={load}>{isId ? 'Coba lagi' : 'Try again'}</Button>
    {:else if loading}<span>{isId ? 'Menyiapkan pilihan zona waktu Anda.' : 'Getting your timezone options ready.'}</span>
    {:else if source !== 'timeapi'}<span>{isId ? 'Menggunakan daftar tersimpan. Pilihan Anda tetap dapat disimpan.' : 'Using a saved list. You can still save your choice.'}</span>
    {:else}<span>{isId ? 'Pilih zona waktu untuk ruang kerja ini.' : 'Choose the timezone for this workspace.'}</span>{/if}
  </div>
</div>

<style>
  .timezone-select{min-width:0}
  :global(.timezone-trigger){width:100%;min-height:44px;justify-content:space-between;border-radius:var(--radius-input);font-weight:600;padding:12px;background:var(--background)}
  .selection{display:flex;gap:8px;min-width:0;text-align:left}.selection>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  :global(.timezone-menu){width:var(--bits-popover-anchor-width);max-width:calc(100vw - 32px);padding:8px;border:2px solid var(--border);border-radius:var(--radius-input);box-shadow:var(--shadow-raised)}
  .search-row{display:flex;align-items:center;gap:8px;padding:0 8px;border-bottom:1px solid var(--border);color:var(--muted-foreground)}
  .search-row :global(input){min-height:44px;min-width:0;width:100%;border:0;background:transparent;color:var(--foreground);font:inherit;outline:none}
  .search-row:focus-within{outline:2px solid var(--ring);outline-offset:-2px;border-radius:var(--radius-input)}
  :global(.timezone-list){max-height:min(320px,50dvh);overflow-y:auto;overscroll-behavior:contain;padding-top:8px}
  :global(.timezone-option){display:flex;align-items:center;gap:12px;min-height:44px;padding:8px 12px;border-radius:var(--radius-input);cursor:pointer;color:var(--foreground);font-size:14px;transition:background-color 150ms}
  :global(.timezone-option[data-selected=true]){background:var(--secondary);color:var(--foreground)}
  :global(.timezone-option>span:not(.check)){flex:1;min-width:0;overflow-wrap:anywhere}.check{width:18px;flex-shrink:0;color:var(--text-green)}
  :global(.no-results){padding:16px 12px;color:var(--muted-foreground);font-size:14px}
  .hint{display:flex;align-items:center;gap:8px;color:var(--muted-foreground);font-size:14px;line-height:1.5;margin-top:8px}
  @media(prefers-reduced-motion:reduce){:global(.timezone-option){transition:none}}
</style>
