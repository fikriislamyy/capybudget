<script lang="ts">
  import { getContext } from 'svelte';
  import CapyMascot from '$lib/components/shared/capy-mascot.svelte';
  let { children } = $props();
  import AuthPreferences from '$lib/components/auth/auth-preferences.svelte';
  import { AUTH_UI_CONTEXT, messages, type AuthUiState } from '$lib/i18n/auth';

  const authUi = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const t = $derived(messages[authUi.locale]);
</script>

<svelte:head><title>{t.brand} · Account</title><meta name="description" content={t.tagline} /></svelte:head>
<div class="auth-page">
  <header class="auth-top"><a class="brand" href="/" aria-label={t.brand}><span class="brand-mark"><CapyMascot size={46} /></span><span>Capy<span class="brand-light">Budget</span></span></a>
    <AuthPreferences />
  </header>
  <main class="auth-main"><div class="auth-intro"><span class="auth-icon"><CapyMascot size={104} steam /></span><p>{t.tagline}</p></div><div class="auth-content">{@render children?.()}</div></main>
  <footer class="auth-footer">© {new Date().getFullYear()} CapyBudget <span>·</span> {authUi.locale==='id'?'Untuk keuangan yang lebih jelas':'Made for a clearer financial life'}</footer>
</div>

<style>
  .auth-page{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;padding:24px clamp(16px,5vw,72px) calc(18px + env(safe-area-inset-bottom));background:radial-gradient(ellipse at 50% 38%,var(--secondary),transparent 60%),var(--background);color:var(--foreground)}
  .auth-top{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
  .brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--foreground);font:600 23px var(--font-heading);letter-spacing:-.5px}
  .brand-mark{display:grid;place-items:center;width:46px;height:44px}
  .brand-light{font-weight:400}
  .auth-main{width:min(100%,464px);margin:auto;display:flex;flex-direction:column;align-items:center;padding:40px 0}
  .auth-content{width:100%;min-width:0}
  .auth-intro{text-align:center;margin:0 0 24px}.auth-icon{display:inline-grid;place-items:center;width:108px;height:88px}
  .auth-intro p{font-size:14px;color:var(--muted-foreground);margin:12px 0 0}
  .auth-footer{text-align:center;color:var(--muted-foreground);font-size:14px;padding-top:20px}.auth-footer span{padding:0 7px}
  @media(max-width:540px){.auth-page{padding:16px}.auth-main{padding:32px 0}.auth-intro{margin-bottom:18px}}
</style>
