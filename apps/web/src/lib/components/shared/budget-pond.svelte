<script lang="ts">
  import { getContext } from 'svelte';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { PRIVACY_CONTEXT, type PrivacyState } from '$lib/privacy';
  let { name, usedPercent, compact = false, note }: { name: string; usedPercent: number | null; compact?: boolean; note?: string } = $props();
  const ui = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const privacy = getContext<PrivacyState | undefined>(PRIVACY_CONTEXT);
  const hidden = $derived(privacy?.hidden ?? false);
  const isId = $derived(ui?.locale === 'id');
  const known = $derived(usedPercent !== null && Number.isFinite(usedPercent));
  const fill = $derived(hidden || !known ? 0 : Math.max(0, Math.min(100, usedPercent!)));
  const color = $derived(hidden || !known ? 'var(--secondary)' : usedPercent! >= 100 ? 'var(--berry-coral)' : usedPercent! >= 80 ? 'var(--yuzu-yellow)' : 'var(--pond-blue)');
  const status = $derived(hidden ? '••••' : !known ? '—' : `${usedPercent!.toFixed(usedPercent! % 1 ? 1 : 0)}% ${isId ? 'terpakai' : 'used'}`);
  const message = $derived(hidden ? (isId ? 'Progres disembunyikan dalam mode privasi.' : 'Progress is hidden in privacy mode.') : !known ? (isId ? 'Progres belum tersedia.' : 'Progress is not available yet.') : note ?? (usedPercent! >= 100 ? (isId ? 'Pengeluaran sudah mencapai rencana.' : 'Spending has reached your plan.') : usedPercent! >= 80 ? (isId ? 'Mulai terasa hangat. Mari beri sedikit ruang.' : 'Running a little warm. Let’s leave some room.') : (isId ? 'Masih ada ruang untuk hal yang menyenangkan.' : 'A little space left for the good stuff.')));
</script>
<div class="pond-card" class:compact>
  <div class="pond-heading"><strong>{name}</strong><span>{status}</span></div>
  <div class="pond-water" role="progressbar" aria-label={hidden ? `${name}: ${isId ? 'progres disembunyikan' : 'progress hidden'}` : name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={hidden || !known ? undefined : fill} aria-valuetext={hidden || !known ? undefined : status}>
    <svg viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true" style={`width:${fill}%;color:${color}`}><path d="M0 12Q50 0 100 12T200 12T300 12T400 12V40H0Z" fill="currentColor" opacity=".55" /><path d="M0 19Q50 30 100 19T200 19T300 19T400 19V40H0Z" fill="currentColor" /></svg>
  </div>
  <p>{message}</p>
</div>
<style>
  .pond-card{border-radius:14px;background:var(--pond-soft);padding:14px;min-width:0}
  .pond-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}.pond-heading strong{font-size:14px;overflow-wrap:anywhere}.pond-heading span{font-size:13px;font-weight:800;white-space:nowrap}
  .pond-water{height:28px;border-radius:8px;background:color-mix(in srgb,var(--pond-blue) 14%,var(--card));overflow:hidden;margin-top:12px;width:100%}
  .pond-water svg{height:100%;display:block;transition:width 250ms var(--ease-spring),color 180ms ease-out}
  p{font-size:13px;margin:7px 0 0;color:var(--muted-foreground);line-height:1.5}
  .compact{margin-top:15px}.compact strong{font-size:.72rem}.compact .pond-heading span,.compact p{font-size:.62rem}
  @media(prefers-reduced-motion:reduce){.pond-water svg{transition:none}}
</style>
