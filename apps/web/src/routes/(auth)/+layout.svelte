<script lang="ts">
  import { getContext } from 'svelte';
  let { children } = $props();
  import AuthPreferences from '$lib/components/auth/auth-preferences.svelte';
  import { AUTH_UI_CONTEXT, messages, type AuthUiState } from '$lib/i18n/auth';

  const authUi = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const t = $derived(messages[authUi.locale]);
</script>

<svelte:head><title>{t.brand} · Account</title><meta name="description" content={t.tagline} /></svelte:head>
<div class="auth-page">
  <header class="auth-top"><a class="brand" href="/" aria-label={t.brand}><span class="brand-mark">c</span><span>capy<span class="brand-light">budget</span></span></a>
    <AuthPreferences />
  </header>
  <main class="auth-main"><div class="auth-intro"><span class="auth-icon">✳</span><p>{t.tagline}</p></div><div class="auth-content">{@render children?.()}</div></main>
  <footer class="auth-footer">© 2026 CapyBudget <span>·</span> Made for a clearer financial life</footer>
</div>

<style>
  :global(body){min-width:320px;background:#f8f7f3;color:#28342e;font-family:'Nunito Sans Variable',ui-sans-serif,system-ui,sans-serif;transition:background-color .35s ease,color .35s ease}
  :global(.dark body){background:#171c19;color:#e7eee8}
  .auth-page{min-height:100svh;display:flex;flex-direction:column;padding:24px clamp(18px,5vw,72px) 18px;background:radial-gradient(ellipse at 50% 42%,#fff 0,#f8f7f3 66%)}
  :global(.dark) .auth-page{background:radial-gradient(ellipse at 50% 42%,#202923 0,#171c19 68%)}
  .auth-top{display:flex;justify-content:space-between;align-items:center}.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:inherit;font-family:'Fredoka Variable',sans-serif;font-size:23px;font-weight:600;letter-spacing:-.5px}.brand-mark{display:grid;place-items:center;background:#4d8966;color:#fff;border-radius:11px;width:34px;height:34px;font-size:22px}.brand-light{font-weight:400;color:#6e9e7f}.auth-main{width:min(100%,440px);margin:auto;display:flex;flex-direction:column;align-items:center;padding:44px 0}.auth-content{width:100%}.auth-intro{text-align:center;margin:0 0 24px}.auth-icon{display:inline-grid;place-items:center;width:46px;height:46px;border-radius:15px;background:#e8f1e9;color:#4a805c;font-size:25px}.auth-intro p{font-size:14px;color:#879188;margin:12px 0 0}.auth-footer{text-align:center;color:#9aa39c;font-size:12px;padding-top:20px}.auth-footer span{padding:0 7px}
  @media(max-width:540px){.auth-page{padding:18px}.auth-main{padding:36px 0}.auth-intro{margin-bottom:18px}}
</style>
