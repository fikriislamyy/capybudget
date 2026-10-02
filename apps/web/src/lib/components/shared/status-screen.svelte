<script lang="ts">
  import type { Snippet } from 'svelte';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import { Spinner } from '$lib/components/ui/spinner';
  import CapyMascot from './capy-mascot.svelte';
  let { title, description, code, checking = false, security = false, actions }: {
    title: string; description: string; code?: number; checking?: boolean; security?: boolean; actions?: Snippet;
  } = $props();
</script>
<section class="status-screen" aria-labelledby="status-heading" aria-busy={checking}>
  <div class="status-card">
    <a class="status-brand" href="/">CapyBudget</a>
    <div class="status-illustration"><CapyMascot size={128} state={checking ? 'thinking' : 'relaxed'} steam={false} />{#if security}<span class="security-icon"><ShieldCheck size={28} aria-hidden="true" /></span>{/if}</div>
    {#if code}<span class="status-code">{code}</span>{/if}
    <h1 id="status-heading">{title}</h1>
    <p role={checking ? 'status' : undefined}>{description}</p>
    {#if checking}<Spinner class="status-spinner" aria-hidden="true" />{/if}
    {#if actions}<div class="status-actions">{@render actions()}</div>{/if}
  </div>
</section>
<style>
  .status-screen{min-height:100svh;display:grid;place-items:center;padding:24px 16px;background:var(--background)}
  .status-card{width:100%;max-width:480px;padding:32px 24px;display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center;border:2px solid var(--border);border-radius:var(--radius-card);background:var(--card);box-shadow:var(--shadow-card);animation:status-arrive 220ms ease-out}
  .status-brand{font-family:var(--font-heading);font-size:20px;color:var(--brand-ink);text-decoration:none;min-height:44px;display:flex;align-items:center}
  .status-illustration{position:relative}.security-icon{position:absolute;right:0;bottom:12px;color:var(--text-green)}
  .status-code{font-variant-numeric:tabular-nums;font-family:var(--font-heading);color:var(--brand-ink);font-size:32px}
  h1{font-size:clamp(24px,5vw,32px);line-height:1.2;margin:0}p{font-size:16px;line-height:1.7;color:var(--muted-foreground);margin:0;max-width:36ch}.status-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;width:100%}
  @keyframes status-arrive{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @media(prefers-reduced-motion:reduce){.status-card{animation:none}}
</style>
