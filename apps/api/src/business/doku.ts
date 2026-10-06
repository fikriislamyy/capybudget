import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** DOKU Checkout (non-SNAP). Supply credentials from the stored workspace connection. */
export type DokuCredentials = { clientId: string; secretKey: string; sandbox: boolean };
export type DokuStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'REFUNDED' | 'TIMEOUT' | 'REDIRECT';
export type DokuPaymentStatus = {
  invoiceNumber: string; amount: string; currency: 'IDR'; status: DokuStatus;
  transactionDate?: string; originalRequestId?: string; channel?: string;
};
export type DokuCheckout = {
  invoiceNumber: string; amount: string; currency: 'IDR'; tokenId: string;
  paymentUrl: string; expiresAtProvider: string; sandbox: boolean;
};
const maximumBodyBytes = 65536;
function invalid(message: string): never {
  throw Object.assign(new Error(message), { status: 502, code: 'INVALID_PAYMENT_PROVIDER_RESPONSE', providerErrors: [message] });
}
function invalidInput(message: string): never {
  throw Object.assign(new Error(message), { status: 422, code: 'INVALID_PAYMENT_PROVIDER_INPUT' });
}
function headerValue(value: string, max = 128) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && /^[A-Za-z0-9_.:-]+$/.test(value);
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
}
function amountString(value: unknown): string {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^[1-9]\d{0,11}(?:\.0{1,2})?$/.test(text)) invalid('DOKU returned an invalid rupiah amount.');
  return text.split('.')[0]!;
}
function invoiceIdentifier(value: string) {
  // Stay within credit-card limits too; callers persist a unique reference per payment request.
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,30}$/.test(value)) invalidInput('Use a DOKU invoice reference of up to 30 letters, digits, underscores or hyphens.');
  return encodeURIComponent(value);
}

/** Sign the exact POST bytes; GET signatures must omit Digest entirely. */
export function signDokuRequest(credentials: DokuCredentials, fields: {
  requestId: string; requestTimestamp: string; requestTarget: string; body?: string | Uint8Array;
}): string {
  if (!headerValue(credentials.clientId) || typeof credentials.secretKey !== 'string' || !credentials.secretKey || credentials.secretKey.length > 4096
    || !headerValue(fields.requestId) || !timestamp(fields.requestTimestamp)
    || !/^\/[A-Za-z0-9_./%-]+$/.test(fields.requestTarget)) invalidInput('Configure valid DOKU credentials and request metadata.');
  const parts = [`Client-Id:${credentials.clientId}`, `Request-Id:${fields.requestId}`,
    `Request-Timestamp:${fields.requestTimestamp}`, `Request-Target:${fields.requestTarget}`];
  if (fields.body !== undefined) parts.push('Digest:' + createHash('sha256').update(fields.body).digest('base64'));
  return 'HMACSHA256=' + createHmac('sha256', credentials.secretKey).update(parts.join('\n')).digest('base64');
}

/** Verify before parsing. Durable Request-Id deduplication belongs to the webhook inbox. */
export function verifyDokuNotification(credentials: DokuCredentials, headers: Headers, rawBody: Uint8Array, requestTarget: string): boolean {
  const clientId = headers.get('Client-Id'), requestId = headers.get('Request-Id');
  const requestTimestamp = headers.get('Request-Timestamp'), signature = headers.get('Signature');
  if (clientId !== credentials.clientId || !requestId || !headerValue(requestId)
    || !timestamp(requestTimestamp) || !signature || !/^HMACSHA256=[A-Za-z0-9+/]{43}=$/.test(signature)
    || rawBody.byteLength === 0 || rawBody.byteLength > maximumBodyBytes) return false;
  // Do not reject delayed legitimate retries solely by age; persist and deduplicate event IDs.
  try {
    const expected = signDokuRequest(credentials, { requestId, requestTimestamp, requestTarget, body: rawBody });
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch { return false; }
}

/** Unknown extra fields are ignored; raw provider records must not be exposed to clients. */
export function parseDokuPaymentStatus(value: unknown): DokuPaymentStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('DOKU returned an invalid transaction.');
  const row = value as Record<string, any>, order = row.order, transaction = row.transaction;
  if (!order || !transaction || typeof order.invoice_number !== 'string' || order.invoice_number.length > 64
    || !['PENDING','SUCCESS','FAILED','EXPIRED','REFUNDED','TIMEOUT','REDIRECT'].includes(transaction.status)
    || (order.currency !== undefined && order.currency !== 'IDR')) invalid('DOKU returned incomplete transaction details.');
  if (transaction.date !== undefined && !timestamp(transaction.date)) invalid('DOKU returned an invalid transaction timestamp.');
  if (transaction.original_request_id !== undefined && !headerValue(transaction.original_request_id)) invalid('DOKU returned an invalid original request ID.');
  return { invoiceNumber: order.invoice_number, amount: amountString(order.amount), currency: 'IDR', status: transaction.status,
    ...(transaction.date !== undefined ? { transactionDate: transaction.date } : {}),
    ...(transaction.original_request_id !== undefined ? { originalRequestId: transaction.original_request_id } : {}),
    ...(typeof row.channel?.id === 'string' && row.channel.id.length <= 100 ? { channel: row.channel.id } : {}) };
}

/** Call only on an authenticated notification or a server-fetched status for its stored connection. */
export function assertDokuPayment(status: DokuPaymentStatus, expected: { invoiceNumber: string; amount: string; currency: string }): boolean {
  if (!/^[1-9]\d{0,11}$/.test(expected.amount) || status.invoiceNumber !== expected.invoiceNumber
    || status.amount !== expected.amount || expected.currency !== 'IDR') {
    throw Object.assign(new Error('Payment details do not match the stored request.'), { status: 409, code: 'PAYMENT_RECONCILIATION_REQUIRED' });
  }
  // FAILED can describe one failed checkout attempt, not the entire hosted session.
  // REFUNDED requires a separate confirmed correction, never another income receipt.
  return status.status === 'SUCCESS';
}

function checkoutUrl(value: unknown, sandbox: boolean): string {
  if (typeof value !== 'string' || value.length > 2048) invalid('DOKU returned an invalid checkout URL.');
  let url: URL; try { url = new URL(value); } catch { invalid('DOKU returned an invalid checkout URL.'); }
  const hosts = sandbox ? ['sandbox.doku.com', 'staging.doku.com'] : ['jokul.doku.com','checkout.doku.com'];
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.username || url.password || url.port
    || !/^\/(?:checkout\/link|checkout-link-v2|v2)\/[A-Za-z0-9_-]+$/.test(url.pathname)
    || url.search || url.hash) {
    const reason = url.protocol !== 'https:' ? 'HTTPS required' : !hosts.includes(url.hostname) ? 'unrecognized host '+url.hostname.replace(/[^A-Za-z0-9.-]/g,'').slice(0,100) : url.username || url.password || url.port ? 'credentials or port present' : url.search || url.hash ? 'query or fragment present' : 'unrecognized checkout path';
    invalid('DOKU returned an unexpected checkout URL: '+reason+'.');
  }
  return url.href;
}

export class DokuClient {
  constructor(private readonly credentials: DokuCredentials) {
    if (typeof credentials.sandbox !== 'boolean') invalidInput('Select the DOKU sandbox or production environment explicitly.');
  }
  private async request(path: string, requestId: string, body?: Record<string, unknown>): Promise<unknown> {
    const json = body === undefined ? undefined : JSON.stringify(body);
    const requestTimestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const signature = signDokuRequest(this.credentials, { requestId, requestTimestamp, requestTarget: path, body: json });
    let response: Response;
    try {
      response = await fetch((this.credentials.sandbox ? 'https://api-sandbox.doku.com' : 'https://api.doku.com') + path, {
        method: json === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'Client-Id': this.credentials.clientId, 'Request-Id': requestId,
          'Request-Timestamp': requestTimestamp, Signature: signature, ...(json === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(json === undefined ? {} : { body: json }),
      });
    } catch {
      throw Object.assign(new Error('DOKU could not be reached. Reconcile the stored payment request before creating another checkout.'), { status: 503, code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
    }
    const reader = response.body?.getReader(); if (!reader) invalid('DOKU returned an empty response.');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
        if (size > maximumBodyBytes) { await reader.cancel(); invalid('DOKU returned an oversized response.'); }
        chunks.push(value);
      }
    } catch (error) {
      if ((error as {code?:string}).code === 'INVALID_PAYMENT_PROVIDER_RESPONSE') throw error;
      throw Object.assign(new Error('DOKU response could not be read. Reconcile before retrying payment creation.'), { status: 503, code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
    } finally { reader.releaseLock(); }
    let result: unknown;
    try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { if (response.ok) invalid('DOKU returned invalid JSON.'); }
    if (!response.ok) {
      const body = result as Record<string, any> | undefined;
      const entries = body?.error_messages ?? body?.message ?? body?.error?.message;
      const errors = (Array.isArray(entries) ? entries : [entries]).filter((entry): entry is string => typeof entry === 'string').slice(0, 6).map(entry => {
        let safe = entry;
        for (const credential of [this.credentials.secretKey, this.credentials.clientId]) safe = safe.split(credential).join('[redacted]');
        return safe.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/https?:\/\/\S+/gi, '[URL]').replace(/['"][^'"]*['"]/g, '[value]').replace(/\b[A-Za-z0-9_+/=-]{32,}\b/g, '[value]').slice(0, 240);
      });
      throw Object.assign(new Error(response.status === 429 ? 'DOKU is busy. Wait before retrying.' : 'DOKU could not complete this request.'), {
        status: response.status === 429 ? 429 : 502,
        code: response.status === 429 ? 'PAYMENT_PROVIDER_RATE_LIMITED' : 'PAYMENT_PROVIDER_HTTP_' + response.status,
        providerErrors: errors,
      });
    }
    return result;
  }

  async create(input: { invoiceNumber: string; amount: string; requestId: string; qrisOnly?: boolean; dueMinutes?: number }): Promise<DokuCheckout> {
    invoiceIdentifier(input.invoiceNumber);
    if (typeof input.amount !== 'string' || !/^[1-9]\d{0,11}$/.test(input.amount)) {
      throw Object.assign(new Error('DOKU Checkout requires a positive whole-rupiah amount of up to 12 digits.'), { status: 422, code: 'INVALID_PAYMENT_AMOUNT' });
    }
    const dueMinutes = input.dueMinutes ?? 60;
    if (!Number.isInteger(dueMinutes) || dueMinutes < 1 || dueMinutes > 999999
      || (input.qrisOnly !== undefined && typeof input.qrisOnly !== 'boolean')) invalidInput('Choose valid DOKU checkout expiry and payment channel settings.');
    const body = { order: { amount: Number(input.amount), invoice_number: input.invoiceNumber, currency: 'IDR' },
      payment: { payment_due_date: dueMinutes, ...(input.qrisOnly ? { payment_method_types: ['QRIS'] } : {}) } };
    const value = await this.request('/checkout/v1/payment', input.requestId, body) as Record<string, any> | null;
    const order = value?.response?.order, payment = value?.response?.payment;
    if (!order || typeof order !== 'object') invalid('DOKU checkout response is missing response.order.');
    if (!payment || typeof payment !== 'object') invalid('DOKU checkout response is missing response.payment.');
    if (order.invoice_number !== input.invoiceNumber) invalid('DOKU checkout invoice reference does not match the saved payment request.');
    if (amountString(order.amount) !== input.amount) invalid('DOKU checkout amount does not match the saved payment request.');
    if (order.currency !== undefined && order.currency !== 'IDR') invalid('DOKU checkout currency does not match IDR.');
    if (typeof payment.token_id !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(payment.token_id)) invalid('DOKU checkout response.payment.token_id is missing or has an unsupported format.');
    if (typeof payment.expired_date !== 'string' || !/^\d{14}$/.test(payment.expired_date)) invalid('DOKU checkout response.payment.expired_date must be a 14-digit yyyyMMddHHmmss string; received '+typeof payment.expired_date+'.');
    if (input.qrisOnly && (!Array.isArray(payment.payment_method_types)
      || payment.payment_method_types.length !== 1 || payment.payment_method_types[0] !== 'QRIS')) {
      invalid('DOKU did not confirm a QRIS-only checkout. Check the merchant channel activation.');
    }
    return { invoiceNumber: order.invoice_number, amount: input.amount, currency: 'IDR', tokenId: payment.token_id,
      paymentUrl: checkoutUrl(payment.url, this.credentials.sandbox), expiresAtProvider: payment.expired_date, sandbox: this.credentials.sandbox };
  }
  async status(invoiceNumber: string, requestId: string): Promise<DokuPaymentStatus> {
    const result = parseDokuPaymentStatus(await this.request('/orders/v1/status/' + invoiceIdentifier(invoiceNumber), requestId));
    if (result.invoiceNumber !== invoiceNumber) invalid('DOKU returned a different invoice reference.');
    return result;
  }
}
