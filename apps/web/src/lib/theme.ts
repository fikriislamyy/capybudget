export type ThemeChoice = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'capybudget-theme';
const ORDER: ThemeChoice[] = ['light', 'dark', 'system'];

export function readThemeChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch { /* fall through to system default */ }
  return 'system';
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveDark(choice: ThemeChoice): boolean {
  return choice === 'dark' || (choice === 'system' && systemPrefersDark());
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
  return ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]!;
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
