/** A disconnected SMTP session may already have accepted DATA. Never resend it automatically. */
export function classifySmtpError(error: unknown) {
  const failure = error as { code?: string; responseCode?: number } | undefined;
  const code = String(failure?.code ?? 'SMTP_ERROR').replace(/[^A-Z0-9_]/gi, '').slice(0, 40);
  const rejected = Number(failure?.responseCode) >= 400;
  const uncertain = !rejected && ['ETIMEDOUT', 'ECONNRESET', 'ESOCKET', 'ECONNECTION'].includes(code);
  const permanent = code === 'SMTP_CONFIG' || code === 'EAUTH' || Number(failure?.responseCode) >= 500;
  return { code, uncertain, permanent };
}
