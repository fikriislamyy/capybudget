<script lang="ts">
  import { getContext } from 'svelte';
  import { AUTH_UI_CONTEXT, messages, type AuthUiState } from '$lib/i18n/auth';
  import { applyThemeChoice, nextThemeChoice, persistPreferences } from '$lib/theme';

  const authUi = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const t = $derived(messages[authUi.locale]);
  const themeLabel = $derived(authUi.theme === 'light' ? 'Light' : authUi.theme === 'dark' ? 'Dark' : 'System');

  function switchLocale() {
    authUi.locale = authUi.locale === 'en' ? 'id' : 'en';
    document.documentElement.lang = authUi.locale;
    try { localStorage.setItem('capybudget-locale', authUi.locale); } catch {}
    void persistPreferences(authUi.theme, authUi.locale);
  }

  function toggleTheme() {
    const next = nextThemeChoice(authUi.theme);
    const apply = () => {
      authUi.theme = next;
      authUi.dark = applyThemeChoice(next);
      void persistPreferences(next, authUi.locale);
    };

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && document.startViewTransition) document.startViewTransition(apply);
    else apply();
  }
</script>

<div class="tools">
  <button type="button" onclick={switchLocale} aria-label={t.language}>{authUi.locale === 'en' ? 'EN / ID' : 'ID / EN'}</button>
  <button type="button" onclick={toggleTheme} aria-label="Theme: {themeLabel}. Switch theme." title="Theme: {themeLabel}">{authUi.dark ? '☼' : '☾'} {themeLabel}</button>
</div>

<style>
  .tools{display:flex;align-items:center;gap:8px}
  button{min-height:44px;border:1px solid #e5e8e4;border-radius:10px;background:transparent;color:inherit;padding:8px 11px;font:600 12px inherit;cursor:pointer}
</style>
