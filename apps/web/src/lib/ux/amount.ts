/** Normalize explicitly localized input to the API's exact decimal string. */
export function parseLocalizedAmount(raw: string, locale: 'en' | 'id'): string | null {
  const value = raw.trim();
  const pattern = locale === 'id' ? /^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,4})?$/ : /^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,4})?$/;
  if (!pattern.test(value)) return null;
  const normalized = locale === 'id' ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '');
  if (!/^(0|[1-9]\d{0,14})(\.\d{1,4})?$/.test(normalized) || /^0(?:\.0+)?$/.test(normalized)) return null;
  return normalized;
}
/** Format decimal strings without converting money to IEEE floating point. */
export function formatExactAmount(value: string, locale: 'en' | 'id'): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return value;
  const [, sign, whole, decimals = ''] = match;
  const fraction = decimals.replace(/0+$/, '');
  const group = locale === 'id' ? '.' : ',';
  const decimal = locale === 'id' ? ',' : '.';
  return sign + whole.replace(/\B(?=(\d{3})+(?!\d))/g, group) + (fraction ? decimal + fraction : '');
}
