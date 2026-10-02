import { FALLBACK_CURRENCIES } from './currencies-fallback';

export type CurrencyOption = { code: string; name: string };
type CurrencyCatalog = {
  items: CurrencyOption[];
  source: 'currencyfreaks' | 'cached' | 'fallback';
};
const ENDPOINT = 'https://api.currencyfreaks.com/v2.1/supported-currencies';
const DAY = 24 * 60 * 60 * 1000;
const RETRY_DELAY = 60 * 1000;
let cache: CurrencyCatalog | undefined;
let refreshAfter = 0;
let pending: Promise<CurrencyCatalog> | undefined;

function parseCatalog(value: unknown): CurrencyOption[] {
  if (!value || typeof value !== 'object') throw new Error('Invalid currency catalog');
  const map = (value as Record<string, unknown>).supportedCurrenciesMap;
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('Invalid currency catalog');
  const items: CurrencyOption[] = [];
  for (const [code, raw] of Object.entries(map)) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    // Crypto/metals and incomplete provider records are not workspace fiat currencies.
    if (!/^[A-Z]{3}$/.test(code) || item.currencyCode !== code || item.status !== 'AVAILABLE' ||
      typeof item.countryCode !== 'string' || !item.countryCode || ['Crypto', 'Metal'].includes(item.countryCode) ||
      typeof item.currencyName !== 'string' || !item.currencyName.trim()) continue;
    items.push({ code, name: item.currencyName.trim() });
  }
  if (!items.length) throw new Error('Empty currency catalog');
  return items.sort((a, b) => a.code.localeCompare(b.code));
}

export async function supportedCurrencies(): Promise<CurrencyCatalog> {
  if (cache && Date.now() < refreshAfter) return cache;
  if (pending) return pending;
  pending = (async () => {
    try {
      // This public endpoint needs no API key. Never forward user headers/cookies.
      const response = await fetch(ENDPOINT, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5000), redirect: 'error',
      });
      if (!response.ok) throw new Error('Currency provider unavailable');
      const text = await response.text();
      if (text.length > 1_000_000) throw new Error('Currency catalog too large');
      cache = { items: parseCatalog(JSON.parse(text)), source: 'currencyfreaks' };
      refreshAfter = Date.now() + DAY;
    } catch {
      cache = cache && cache.source !== 'fallback'
        ? { items: cache.items, source: 'cached' }
        : { items: FALLBACK_CURRENCIES, source: 'fallback' };
      refreshAfter = Date.now() + RETRY_DELAY;
    }
    return cache;
  })();
  try { return await pending; }
  finally { pending = undefined; }
}
