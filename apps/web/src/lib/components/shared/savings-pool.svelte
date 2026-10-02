<script lang="ts">
  import { getContext } from 'svelte';
  import Sprout from '@lucide/svelte/icons/sprout';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { PRIVACY_CONTEXT, type PrivacyState } from '$lib/privacy';
  let { name, percent, compact = false }: { name: string; percent: number | null; compact?: boolean } = $props();
  const ui = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const privacy = getContext<PrivacyState | undefined>(PRIVACY_CONTEXT);
  const hidden = $derived(privacy?.hidden ?? false);
  const known = $derived(percent !== null && Number.isFinite(percent));
  const fill = $derived(hidden || !known ? 0 : Math.max(0, Math.min(100, percent!)));
  const status = $derived(hidden ? '••••' : !known ? '—' : `${percent!.toFixed(percent! % 1 ? 1 : 0)}%`);
</script>
<div class="mock-goal" class:compact>
  <span class="goal-icon"><Sprout size={21} aria-hidden="true" /></span>
  <div class="grow"><div class="goal-heading"><strong>{name}</strong><span>{status}</span></div>
    <div class="goal-track" role="progressbar" aria-label={hidden ? `${name}: ${ui?.locale === 'id' ? 'progres disembunyikan' : 'progress hidden'}` : name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={hidden || !known ? undefined : fill} aria-valuetext={hidden || !known ? undefined : status}><span style={`width:${fill}%`}></span></div>
  </div>
</div>
<style>
  .mock-goal{display:flex;align-items:center;gap:12px;min-width:0}.grow{flex:1;min-width:0}.goal-heading{display:flex;justify-content:space-between;gap:12px}.goal-heading strong{font-size:14px;overflow-wrap:anywhere}.goal-heading>span{font-size:13px;white-space:nowrap}
  .goal-icon{width:34px;height:34px;background:var(--leaf-soft);border-radius:12px;display:grid;place-items:center;color:var(--text-green);flex-shrink:0}
  .goal-track{margin-top:7px;height:6px;background:var(--secondary);border-radius:8px;overflow:hidden}.goal-track>span{display:block;height:100%;background:var(--leaf-green);border-radius:8px;transition:width 250ms var(--ease-spring)}
  .compact{margin-top:16px}.compact strong,.compact .goal-heading>span{font-size:.66rem}
  @media(prefers-reduced-motion:reduce){.goal-track>span{transition:none}}
</style>
