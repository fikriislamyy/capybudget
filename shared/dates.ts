/** Format calendar dates without timezone conversion. Stored/API dates remain ISO. */
export function formatDate(value: unknown, empty = '—'): string {
  if (value === null || value === undefined || value === '') return empty;
  const raw = String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T| )/.exec(raw);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : raw;
}

/** Convert a complete displayed date to its ISO form; validation stays with the picker. */
export function dateInputToISO(value: string): string {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

/** Timestamps keep their local time, with a consistent dd-mm-yyyy date portion. */
export function formatDateTime(value: unknown, locale = 'en'): string {
  if (value === null || value === undefined || value === '') return '—';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.valueOf())) return String(value);
  const parts = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  const time = new Intl.DateTimeFormat(locale.startsWith('id') ? 'id-ID' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date);
  return `${get('day')}-${get('month')}-${get('year')}, ${time}`;
}

/** Human-readable export cells, including dates inside summary objects. */
export function formatExportDates(value: unknown): unknown {
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : /^\d{4}-\d{2}-\d{2}T/.test(value) ? `${formatDate(value)}${value.slice(10)}` : value;
  if (value instanceof Date) return formatExportDates(value.toISOString());
  if (Array.isArray(value)) return value.map(formatExportDates);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, formatExportDates(item)]));
  return value;
}

/** Format ISO calendar dates embedded in notification and assistant copy. */
export function formatDatesInText(value: string): string {
  return value.replace(/\b\d{4}-\d{2}-\d{2}\b/g, date => formatDate(date));
}
