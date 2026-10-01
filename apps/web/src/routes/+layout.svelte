<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import { AUTH_UI_CONTEXT, getLocale, type AuthUiState } from '$lib/i18n/auth';
  import { applyThemeChoice, readThemeChoice } from '$lib/theme';
  import '../app.css';
  let { children } = $props();
  const authUi = $state<AuthUiState>({ locale: 'en', dark: false, theme: 'system' });
  setContext(AUTH_UI_CONTEXT, authUi);

  onMount(() => {
    try {
      authUi.locale = getLocale(localStorage.getItem('capybudget-locale'));
    } catch { /* Preferences stay in memory when browser storage is unavailable. */ }
    document.documentElement.lang = authUi.locale;
    authUi.theme = readThemeChoice();
    authUi.dark = applyThemeChoice(authUi.theme);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = () => {
      if (authUi.theme === 'system') authUi.dark = applyThemeChoice('system');
    };
    media.addEventListener('change', followSystem);
    return () => media.removeEventListener('change', followSystem);
  });
</script>

{@render children()}
