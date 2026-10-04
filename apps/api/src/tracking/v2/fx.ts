import type { TransactionSql } from 'postgres';
import { Money, converted } from './money';
const q = (tx: TransactionSql, s: string, v: unknown[] = []) => tx.unsafe(s, v as never[]);
export type Rate = {id:string|null;rate:string;provider:string;date:string};
export async function rateFor(tx: TransactionSql, source: string, base: string, date: string, refresh=false): Promise<Rate> {
  if (source === base) return { rate: '1.000000000000', provider: 'identity', date, id: null };
  const [cached] = await q(tx, 'select id,rate::text,provider,rate_date::text as date from exchange_rates where source_currency=$1 and base_currency=$2 and rate_date=$3 order by fetched_at desc limit 1', [source, base, date]);
  if (cached&&!refresh) return cached as unknown as Rate;
  const key = process.env.CURRENCYFREAKS_API_KEY?.trim();
  if (!key) throw Object.assign(new Error('Automatic exchange rates are not configured. Configure CurrencyFreaks on the server.'), { status: 422, code: 'FX_RATE_REQUIRED' });
  // Today's rates are available on the free plan; historical access is paid.
  // Keep the provider's date check below: never substitute today's quote for an older posting.
  const today = new Date().toISOString().slice(0, 10);
  if (date > today) throw Object.assign(new Error('Exchange rates for this future date are not available yet. Record it when the dated rate is available.'), { status: 422, code: 'FX_DATE_UNAVAILABLE' });
  const historical = date < today;
  const url = new URL(`https://api.currencyfreaks.com/v2.0/rates/${historical ? 'historical' : 'latest'}`);
  url.searchParams.set('apikey', key);
  if (historical) url.searchParams.set('date', date);
  url.searchParams.set('symbols', [source, base].join(','));
  let response: Response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error' }); }
  catch { throw Object.assign(new Error('Exchange-rate service is unavailable. Please try again later.'), { status: 503, code: 'FX_PROVIDER_UNAVAILABLE' }); }
  // Do not expose provider response bodies or request URLs containing the API key.
  if (!response.ok) {
    const errors: Record<number, [number, string, string]> = {
      401: [422, 'FX_KEY_INVALID', 'CurrencyFreaks rejected the API key. Check that the server key is valid and active.'],
      402: [422, historical ? 'FX_HISTORICAL_PLAN_REQUIRED' : 'FX_PLAN_ACCESS_REQUIRED', historical ? 'Historical exchange rates require a CurrencyFreaks paid plan. This date has no cached rate. Use a plan with historical access to record this opening balance or transaction.' : 'Your CurrencyFreaks plan does not allow this rate request. Check the account subscription.'],
      403: [422, 'FX_ACCESS_DENIED', 'CurrencyFreaks denied access. Check the server API key and subscription permissions.'],
      404: [422, 'FX_RATE_NOT_FOUND', 'CurrencyFreaks has no exchange rate for the selected date or currency.'],
      429: [503, 'FX_QUOTA_EXCEEDED', 'The CurrencyFreaks request quota has been reached. Check your account quota or retry after it resets.'],
      400: [422, 'FX_REQUEST_REJECTED', 'CurrencyFreaks could not provide this currency and date combination. Check the currency and transaction date.'],
    };
    const [status, code, message] = errors[response.status] ?? [503, 'FX_PROVIDER_UNAVAILABLE', 'Exchange-rate service is unavailable. Please try again later.'];
    throw Object.assign(new Error(message), { status, code });
  }
  let data: any;
  try { data = await response.json(); }
  catch { throw Object.assign(new Error('CurrencyFreaks returned an unreadable response. Please try again later.'), { status: 502, code: 'FX_RESPONSE_INVALID' }); }
  const observed = String(data.date ?? '').slice(0, 10);
  if (observed !== date || data.base !== 'USD') throw Object.assign(new Error('CurrencyFreaks has no rate for this transaction date. Check the date and your historical-rate access, then try again.'), { status: 422, code: 'FX_DATE_UNAVAILABLE' });
  const from = source === 'USD' ? '1' : String(data.rates?.[source] ?? ''), to = base === 'USD' ? '1' : String(data.rates?.[base] ?? '');
  if(!/^(0|[1-9]\d{0,14})(\.\d{1,40})?$/.test(from)||!/^(0|[1-9]\d{0,14})(\.\d{1,40})?$/.test(to)||!new Money(from).gt(0)||!new Money(to).gt(0))throw Object.assign(new Error('CurrencyFreaks returned an invalid exchange rate. Please try again later.'),{status:502});
  const rate = new Money(to).div(from).toFixed(12);
  const [row] = await q(tx, 'insert into exchange_rates(source_currency,base_currency,rate_date,rate,provider) values($1,$2,$3,$4,\'currencyfreaks\') on conflict(source_currency,base_currency,rate_date,provider,rate) do nothing returning id,rate::text,provider,rate_date::text as date', [source, base, date, rate]);
  if(row)return row as unknown as Rate;
  const [existing]=await q(tx,"select id,rate::text,provider,rate_date::text as date from exchange_rates where source_currency=$1 and base_currency=$2 and rate_date=$3 and provider='currencyfreaks' and rate=$4",[source,base,date,rate]);return existing as unknown as Rate;
}
export async function valuation(tx: TransactionSql, currency: string, base: string, amount: string, date: string, frozen?: Rate) {
  const rate = frozen ?? await rateFor(tx, currency, base, date);
  const baseAmount = currency === base ? amount : converted(amount, String(rate.rate), base);
  if (!new Money(baseAmount).gt(0)) throw Object.assign(new Error('The converted amount is below the base currency precision.'), { status: 422 });
  return { ...rate, baseAmount };
}
