<script lang="ts">
  import { getContext } from 'svelte';
  import * as Card from '$lib/components/ui/card';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { uxText } from '$lib/i18n/ux';
  import { applyThemeChoice, persistPreferences, type ThemeChoice } from '$lib/theme';

  const authUi = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const t = (key: Parameters<typeof uxText>[1]) => uxText(authUi.locale, key);

  function chooseTheme(theme: ThemeChoice) {
    authUi.theme = theme;
    authUi.dark = applyThemeChoice(theme);
    void persistPreferences(theme, authUi.locale);
  }

  function chooseLocale(locale: 'en' | 'id') {
    authUi.locale = locale;
    document.documentElement.lang = locale;
    try {
      localStorage.setItem('capybudget-locale', locale);
    } catch {}
    void persistPreferences(authUi.theme, locale);
  }
</script>

<svelte:head><title>{t('appearance')} · CapyBudget</title></svelte:head>
<div class="heading"><p class="eyebrow">CAPYBUDGET</p><h1>{t('appearance')}</h1><p class="muted">{t('appearanceIntro')}</p></div>
<Card.Root>
  <Card.Content>
    <h2>{t('theme')}</h2>
    <div class="choices" role="radiogroup" aria-label={t('theme')}>
      {#each [{ v: 'light', label: t('themeLight') }, { v: 'dark', label: t('themeDark') }, { v: 'system', label: t('themeSystem') }] as item}
        <button type="button" role="radio" aria-checked={authUi.theme === item.v} class:active={authUi.theme === item.v} onclick={() => chooseTheme(item.v as ThemeChoice)}>
          {item.label}
        </button>
      {/each}
    </div>
    <h2>{t('language')}</h2>
    <div class="choices" role="radiogroup" aria-label={t('language')}>
      <button type="button" role="radio" aria-checked={authUi.locale === 'en'} class:active={authUi.locale === 'en'} onclick={() => chooseLocale('en')}>English</button>
      <button type="button" role="radio" aria-checked={authUi.locale === 'id'} class:active={authUi.locale === 'id'} onclick={() => chooseLocale('id')}>Bahasa Indonesia</button>
    </div>
  </Card.Content>
</Card.Root>

<style>
  .heading{margin-bottom:24px}.eyebrow{font-size:11px;letter-spacing:1px;font-weight:700;color:var(--muted-foreground);margin:0 0 6px}
  h1{font:500 30px 'Fredoka Variable',sans-serif;margin:0}.muted{color:var(--muted-foreground);margin:7px 0 0}
  h2{font:500 18px 'Fredoka Variable',sans-serif;margin:14px 0 10px}
  .choices{display:flex;flex-wrap:wrap;gap:8px}
  .choices button{min-height:44px;border:2px solid var(--input);border-radius:99px;background:var(--background);color:var(--foreground);padding:8px 18px;font:inherit;font-weight:600;cursor:pointer}
  .choices button.active{border-color:var(--primary);background:var(--secondary)}
</style>
