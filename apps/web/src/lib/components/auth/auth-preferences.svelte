<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { getContext } from 'svelte';
  import { Sun, Moon } from '@lucide/svelte';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { nextThemeChoice, persistPreferences, switchThemeChoice } from '$lib/theme';

  const authUi = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const themeAction = $derived(authUi.locale === 'id'
    ? (authUi.dark ? 'Beralih ke mode terang' : 'Beralih ke mode gelap Night Pond')
    : (authUi.dark ? 'Switch to light mode' : 'Switch to Night Pond dark mode'));
  const languageAction = $derived(authUi.locale === 'id'
    ? 'Bahasa aktif: Indonesia. Beralih ke bahasa Inggris.'
    : 'Current language: English. Switch to Indonesian.');

  function switchLocale() {
    authUi.locale = authUi.locale === 'en' ? 'id' : 'en';
    document.documentElement.lang = authUi.locale;
    try { localStorage.setItem('capybudget-locale', authUi.locale); } catch {}
    void persistPreferences(authUi.theme, authUi.locale);
  }

  function toggleTheme() {
    const next = nextThemeChoice(authUi.theme);
    authUi.theme = next;
    authUi.dark = switchThemeChoice(next);
    void persistPreferences(next, authUi.locale);
  }
</script>

<div class="tools">
  <Button variant="ghost" class="language-button" type="button" onclick={switchLocale} aria-label={languageAction} title={languageAction}>{authUi.locale === 'id' ? 'ID' : 'EN'}</Button>
  <Button variant="ghost" class="theme-button" type="button" onclick={toggleTheme} aria-label={themeAction} title={themeAction}>
    {#if authUi.dark}<Sun aria-hidden="true" size={20} />{:else}<Moon aria-hidden="true" size={20} />{/if}
  </Button>
</div>

<style>
  .tools{display:flex;align-items:center;gap:8px}
  .tools :global([data-slot="button"]){display:grid;place-items:center;min-width:44px;min-height:44px;border:1px solid transparent;border-radius:var(--radius-button);background:transparent;color:var(--foreground);padding:8px;font-family:var(--font-body);font-size:12px;font-weight:800;cursor:pointer;transition:background 150ms ease,transform 150ms var(--ease-spring)}
  .tools :global([data-slot="button"]:hover){background:var(--secondary)}
  .tools :global([data-slot="button"]:active){transform:scale(.96)}
  .tools :global([data-slot="button"]:focus-visible){outline:2px solid var(--ring);outline-offset:2px}
  .tools :global(.theme-button){width:44px;height:44px}
  @media (prefers-reduced-motion:reduce){:global([data-slot="button"]){transition:none}:global([data-slot="button"]:active){transform:none}}
</style>
