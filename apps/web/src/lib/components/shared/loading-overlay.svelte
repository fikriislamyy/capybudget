<script lang="ts">
  import { getContext } from 'svelte';
  import { navigating } from '$app/state';
  import { Spinner } from '$lib/components/ui/spinner';
  import { Button } from '$lib/components/ui/button';
  import CapyMascot from './capy-mascot.svelte';
  import { loadingState } from '$lib/loading.svelte';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  const ui = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const active = $derived(loadingState.requests > 0 || loadingState.scopes > 0 || !!navigating.to);
  let visible = $state(false);
  let slow = $state(false);
  let dismissed = $state(false);
  $effect(() => {
    if (!active) { visible = false; slow = false; dismissed = false; return; }
    const reveal = setTimeout(() => visible = true, 250);
    const recovery = setTimeout(() => slow = true, 10_000);
    return () => { clearTimeout(reveal); clearTimeout(recovery); };
  });
  const isId = $derived(ui?.locale === 'id');
</script>

{#if visible && !dismissed}
  <div class="loading-feedback" aria-busy="true">
    <div class="loading-card" role="status" aria-live="polite" aria-atomic="true">
      <CapyMascot size={48} state="thinking" steam={false} />
      <div><strong>{isId ? 'Sebentar ya…' : 'One calm moment…'}</strong><p>{slow ? (isId ? 'Memuat lebih lama dari biasanya. Anda tetap dapat menggunakan halaman ini.' : 'This is taking longer than usual. You can still use this page.') : (isId ? 'Sedang menyiapkan data Anda.' : 'Getting things ready for you.')}</p></div>
      <Spinner aria-hidden="true" />
      {#if slow}<Button variant="secondary" size="sm" onclick={() => dismissed = true}>{isId ? 'Sembunyikan indikator' : 'Hide indicator'}</Button>{/if}
    </div>
  </div>
{/if}

<style>
  .loading-feedback{position:fixed;inset:auto 16px calc(88px + env(safe-area-inset-bottom)) 16px;z-index:100;display:flex;justify-content:center;pointer-events:none}
  .loading-card{display:flex;align-items:center;flex-wrap:wrap;gap:12px;max-width:480px;padding:16px;background:var(--card);color:var(--foreground);border:2px solid var(--border);border-radius:var(--radius-card);box-shadow:var(--shadow-raised);pointer-events:auto;animation:feedback-arrive 180ms ease-out}
  .loading-card>div{flex:1;min-width:120px}.loading-card strong{font-family:var(--font-heading);color:var(--brand-ink);font-size:18px;font-weight:500}.loading-card p{margin:4px 0 0;font-size:14px;line-height:1.5;color:var(--muted-foreground)}
  @keyframes feedback-arrive{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @media(min-width:1024px){.loading-feedback{bottom:24px;left:auto;right:24px}}
  @media(prefers-reduced-motion:reduce){.loading-card{animation:none}}
</style>
