export type ThemeChoice = 'light' | 'dark';

const STORAGE_KEY = 'capybudget-theme';

/** Freeze older system preferences to an explicit choice, preserving their appearance. */
export function normalizeThemeChoice(value: unknown): ThemeChoice {
  if (value === 'dark') return 'dark';
  if (value === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

export function readThemeChoice(): ThemeChoice {
  try {
    return normalizeThemeChoice(localStorage.getItem(STORAGE_KEY));
  } catch { /* Use light mode when storage is unavailable. */ }
  return 'light';
}

export function resolveDark(choice: ThemeChoice): boolean {
  return choice === 'dark';
}

/** Apply theme without a flash: toggles the Tailwind `.dark` variant and DESIGN.md `data-theme`. */
export function applyThemeChoice(choice: ThemeChoice): boolean {
  const dark = resolveDark(choice);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch { /* Preferences stay in memory when storage is unavailable. */ }
  return dark;
}

export function nextThemeChoice(choice: ThemeChoice): ThemeChoice {
  return choice === 'dark' ? 'light' : 'dark';
}

let activeTransition: {skipTransition: () => void} | undefined;
export function cancelThemeTransition() { activeTransition?.skipTransition(); activeTransition=undefined; }

/** Single place that swaps themes: animated reveal when supported, instant otherwise. */
export function switchThemeChoice(choice: ThemeChoice): boolean {
  cancelThemeTransition();
  const apply = () => applyThemeChoice(choice);
  if (
    typeof document !== 'undefined' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    'startViewTransition' in document &&
    typeof (document as Document & { startViewTransition?: (cb: () => void) => void }).startViewTransition === 'function'
  ) {
    activeTransition = (document as Document & { startViewTransition: (cb: () => void) => {skipTransition: () => void} }).startViewTransition(apply);
    return resolveDark(choice);
  }
  return apply();
}

export async function persistPreferences(theme: ThemeChoice, locale: 'en' | 'id'): Promise<void> {
  try {
    await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme, locale })
    });
  } catch { /* Server sync is best-effort; local choice already applied. */ }
}
