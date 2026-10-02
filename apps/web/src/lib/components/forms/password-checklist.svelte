<script lang="ts">
  import { getContext } from 'svelte';
  import Check from '@lucide/svelte/icons/check';
  import Circle from '@lucide/svelte/icons/circle';
  import { passwordRequirements } from '$lib/password-policy';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  let { password, id }: { password: string; id: string } = $props();
  const ui = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const labels = $derived(ui?.locale === 'id' ? { uppercase: 'Minimal 1 huruf besar', lowercase: 'Minimal 1 huruf kecil', number: 'Minimal 1 angka', symbol: 'Minimal 1 simbol', length: 'Minimal 12 karakter' } : { uppercase: 'At least 1 uppercase letter', lowercase: 'At least 1 lowercase letter', number: 'At least 1 number', symbol: 'At least 1 symbol', length: 'At least 12 characters' });
  const rules = $derived(passwordRequirements(password));
  const met = $derived(rules.filter(rule => rule.met).length);
</script>
<div {id} class="password-requirements">
  <ul aria-label={ui?.locale === 'id' ? 'Persyaratan kata sandi' : 'Password requirements'}>
    {#each rules as rule (rule.id)}<li class:met={rule.met}>
      {#if rule.met}<Check size={16} aria-hidden="true" />{:else}<Circle size={16} aria-hidden="true" />{/if}
      <span>{labels[rule.id]}</span><span class="sr-only"> — {rule.met ? (ui?.locale === 'id' ? 'terpenuhi' : 'met') : (ui?.locale === 'id' ? 'belum terpenuhi' : 'not met')}</span>
    </li>{/each}
  </ul>
  <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{ui?.locale === 'id' ? `${met} dari 5 persyaratan terpenuhi.` : `${met} of 5 requirements met.`}</span>
</div>
<style>
  .password-requirements{margin-top:4px}ul{list-style:none;padding:0;margin:0;display:grid;gap:8px}li{display:flex;align-items:center;gap:8px;color:var(--muted-foreground);font-size:13px;line-height:1.5;transition:color 150ms ease-out}li.met{color:var(--text-green)}li :global(svg){flex-shrink:0}
</style>
