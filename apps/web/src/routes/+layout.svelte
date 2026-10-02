<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import { AUTH_UI_CONTEXT, getLocale, type AuthUiState } from '$lib/i18n/auth';
  import { applyThemeChoice, readThemeChoice } from '$lib/theme';
  import '../app.css';
  import { installLoadingTracker } from '$lib/loading.svelte';
  import LoadingOverlay from '$lib/components/shared/loading-overlay.svelte';
  let { children } = $props();
  const authUi = $state<AuthUiState>({ locale: 'en', dark: false, theme: 'light' });
  setContext(AUTH_UI_CONTEXT, authUi);

  onMount(() => {
    try {
      authUi.locale = getLocale(localStorage.getItem('capybudget-locale'));
    } catch { /* Preferences stay in memory when browser storage is unavailable. */ }
    document.documentElement.lang = authUi.locale;
    authUi.theme = readThemeChoice();
    authUi.dark = applyThemeChoice(authUi.theme);
    return installLoadingTracker();

  });
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600&family=Nunito:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <meta name="theme-color" content={authUi.dark ? '#2A211B' : '#FFF8EC'} /></svelte:head>
{@render children()}
<LoadingOverlay />
