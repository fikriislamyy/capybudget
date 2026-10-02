export type TimezoneOption = { id: string };
type TimezoneCatalog = { items: TimezoneOption[]; source: 'timeapi' | 'cached' | 'fallback' };
const ENDPOINT = 'https://www.timeapi.io/api/TimeZone/AvailableTimeZones';
const DAY = 24 * 60 * 60 * 1000;
let cache: TimezoneCatalog | undefined;
let refreshAfter = 0;
let pending: Promise<TimezoneCatalog> | undefined;

function parseCatalog(value: unknown): TimezoneOption[] {
  if (!Array.isArray(value) || value.length > 2000) throw new Error('Invalid timezone catalog');
  const ids = new Set<string>();
  for (const id of value) {
    if (typeof id !== 'string' || id.length > 100 || !/^[A-Za-z0-9_+\-/]+$/.test(id)) continue;
    try { new Intl.DateTimeFormat('en', { timeZone: id }); ids.add(id); } catch { /* Ignore zones unavailable in our runtime. */ }
  }
  if (!ids.size) throw new Error('Empty timezone catalog');
  ids.add('UTC');
  return [...ids].sort().map(id => ({ id }));
}
function fallbackItems(): TimezoneOption[] {
  // ICU ships a complete timezone list; no small hardcoded list or API key is needed.
  return parseCatalog(['UTC', 'Asia/Jakarta', ...Intl.supportedValuesOf('timeZone')]);
}
export async function supportedTimezones(): Promise<TimezoneCatalog> {
  if (cache && Date.now() < refreshAfter) return cache;
  if (pending) return pending;
  pending = (async () => {
    try {
      // The public provider receives no user headers, cookies, or location data.
      const response = await fetch(ENDPOINT, {
        headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000), redirect: 'error',
      });
      if (!response.ok) throw new Error('Timezone provider unavailable');
      const text = await response.text();
      if (text.length > 200_000) throw new Error('Timezone catalog too large');
      cache = { items: parseCatalog(JSON.parse(text)), source: 'timeapi' };
      refreshAfter = Date.now() + DAY;
    } catch {
      cache = cache && cache.source !== 'fallback'
        ? { items: cache.items, source: 'cached' }
        : { items: fallbackItems(), source: 'fallback' };
      refreshAfter = Date.now() + 60_000;
    }
    return cache;
  })();
  try { return await pending; } finally { pending = undefined; }
}
