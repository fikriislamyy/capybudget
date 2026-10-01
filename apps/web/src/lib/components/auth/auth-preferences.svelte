<script lang="ts">
  import { getContext } from 'svelte';
  import { AUTH_UI_CONTEXT, messages, type AuthUiState } from '$lib/i18n/auth';

  const authUi = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const t = $derived(messages[authUi.locale]);

  function switchLocale() {
    authUi.locale = authUi.locale === 'en' ? 'id' : 'en';
    try { localStorage.setItem('capybudget-locale', authUi.locale); } catch {}
  }

  function toggleTheme() {
    const next = !authUi.dark;
    const apply = () => {
      authUi.dark = next;
      document.documentElement.classList.toggle('dark', next);
      try { localStorage.setItem('capybudget-theme', next ? 'dark' : 'light'); } catch {}
    };

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && document.startViewTransition) document.startViewTransition(apply);
    else apply();
  }
</script>

<div class="tools">
  <button type="button" onclick={switchLocale} aria-label={t.language}>{authUi.locale === 'en' ? 'EN / ID' : 'ID / EN'}</button>
  <button type="button" onclick={toggleTheme} aria-label="Toggle dark mode" title="Toggle dark mode">{authUi.dark ? '☼' : '☾'}</button>
</div>

<style>
  .tools{display:flex;align-items:center;gap:8px}
  button{min-height:44px;border:1px solid #e5e8e4;border-radius:10px;background:transparent;color:inherit;padding:8px 11px;font:600 12px inherit;cursor:pointer}
</style>
