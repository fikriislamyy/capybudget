<script lang="ts">
  import { getContext } from 'svelte';
  import * as Card from '$lib/components/ui/card';
  import * as Field from '$lib/components/ui/field';
  import * as RadioGroup from '$lib/components/ui/radio-group';
  import { Label } from '$lib/components/ui/label';
  import PageHeader from '$lib/components/shared/page-header.svelte';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { uxText } from '$lib/i18n/ux';
  import { persistPreferences, switchThemeChoice, type ThemeChoice } from '$lib/theme';

  const authUi = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const t = (key: Parameters<typeof uxText>[1]) => uxText(authUi.locale, key);

  function chooseTheme(value: string) {
    if (value !== 'light' && value !== 'dark') return;
    const theme = value as ThemeChoice;
    authUi.theme = theme;
    authUi.dark = switchThemeChoice(theme);
    void persistPreferences(theme, authUi.locale);
  }

  function chooseLocale(value: string) {
    if (value !== 'en' && value !== 'id') return;
    const locale = value as 'en' | 'id';
    authUi.locale = locale;
    document.documentElement.lang = locale;
    try {
      localStorage.setItem('capybudget-locale', locale);
    } catch {}
    void persistPreferences(authUi.theme, locale);
  }
</script>

<svelte:head><title>{t('appearance')} · CapyBudget</title></svelte:head>
<PageHeader eyebrow="CAPYBUDGET" title={t('appearance')} description={t('appearanceIntro')} />
<Card.Root>
  <Card.Content>
    <Field.FieldSet>
      <Field.FieldLegend>{t('theme')}</Field.FieldLegend>
      <RadioGroup.Root value={authUi.theme} onValueChange={chooseTheme} aria-label={t('theme')} class="choices">
        {#each [{ v: 'light', label: t('themeLight') }, { v: 'dark', label: t('themeDark') }] as item}
          <div class="choice">
            <RadioGroup.Item value={item.v} id="theme-{item.v}" />
            <Label for="theme-{item.v}">{item.label}</Label>
          </div>
        {/each}
      </RadioGroup.Root>
    </Field.FieldSet>
    <Field.FieldSet>
      <Field.FieldLegend>{t('language')}</Field.FieldLegend>
      <RadioGroup.Root value={authUi.locale} onValueChange={chooseLocale} aria-label={t('language')} class="choices">
        <div class="choice">
          <RadioGroup.Item value="en" id="locale-en" />
          <Label for="locale-en">English</Label>
        </div>
        <div class="choice">
          <RadioGroup.Item value="id" id="locale-id" />
          <Label for="locale-id">Bahasa Indonesia</Label>
        </div>
      </RadioGroup.Root>
    </Field.FieldSet>
  </Card.Content>
</Card.Root>

<style>
  :global(.choices){display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
  .choice{display:flex;align-items:center;gap:8px;min-height:44px;border:2px solid var(--input);border-radius:99px;padding:8px 16px 8px 12px;cursor:pointer}
  :global(.choice:has([data-state='checked'])){border-color:var(--primary);background:var(--secondary)}
</style>
