<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import { AUTH_UI_CONTEXT, getLocale, type AuthUiState } from '$lib/i18n/auth';
  import '../app.css';
  let { children } = $props();
  const authUi = $state<AuthUiState>({ locale: 'en', dark: false });
  setContext(AUTH_UI_CONTEXT, authUi);

  onMount(() => {
    authUi.locale = getLocale(localStorage.getItem('capybudget-locale'));
    authUi.dark = localStorage.getItem('capybudget-theme') === 'dark';
    document.documentElement.classList.toggle('dark', authUi.dark);
  });
</script>

{@render children()}
