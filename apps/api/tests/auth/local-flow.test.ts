import { afterAll, describe, expect, test } from 'bun:test';
import postgres from 'postgres';

const enabled = process.env.AUTH_INTEGRATION === '1';
const api = process.env.AUTH_TEST_API_URL ?? 'http://localhost:3000';
const mailpit = process.env.MAILPIT_API_URL ?? 'http://localhost:8025';
const origin = process.env.PUBLIC_APP_URL ?? 'http://localhost:5173';
const email = `auth-flow-${crypto.randomUUID()}@example.test`;
const oldPassword = 'Initial-passphrase-983!';
const newPassword = 'Updated-passphrase-482!';
const pg = enabled ? postgres(process.env.DATABASE_URL ?? 'postgres://capybudget:capybudget@localhost:5432/capybudget') : undefined;

async function post(path: string, body: unknown, cookie?: string) {
  return fetch(`${api}/api/auth${path}`, {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {})
    },
    body: JSON.stringify(body)
  });
}

async function waitForMail(subject: string): Promise<{ text: string; html: string }> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const listing = await fetch(`${mailpit}/api/v1/messages?limit=50`).then((r) => r.json());
    for (const message of listing.messages ?? []) {
      if (message.Subject !== subject || !JSON.stringify(message).includes(email)) continue;
      const detail = await fetch(`${mailpit}/api/v1/message/${message.ID}`).then((r) => r.json());
      return { text: detail.Text ?? '', html: detail.HTML ?? '' };
    }
    await Bun.sleep(250);
  }
  throw new Error(`Timed out waiting for local email: ${subject}`);
}

describe('local Better Auth and Mailpit flow', () => {
  test.skipIf(!enabled)('signup, OTP verification, login, password reset, and logout work end to end', async () => {
    try {
      const signup = await post('/sign-up/email', { name: 'Auth Test', email, password: oldPassword });
      expect(signup.ok).toBe(true);

      const verificationMail = await waitForMail('Your CapyBudget verification code');
      const otp = `${verificationMail.text}\n${verificationMail.html}`.match(/\b\d{6}\b/)?.[0];
      expect(otp).toBeDefined();

      const verification = await post('/email-otp/verify-email', { email, otp });
      expect(verification.ok).toBe(true);

      const login = await post('/sign-in/email', { email, password: oldPassword });
      expect(login.ok).toBe(true);
      const cookie = login.headers.getSetCookie().map((part) => part.split(';', 1)[0]).join('; ');
      expect(cookie).toContain('capybudget.session_token=');

      const resetRequest = await post('/request-password-reset', {
        email,
        redirectTo: `${origin}/reset-password`
      });
      expect(resetRequest.ok).toBe(true);
      const resetMail = await waitForMail('Reset your CapyBudget password');
      const resetUrl = `${resetMail.text}\n${resetMail.html}`.match(/https?:\/\/[^\s"<>]+/)?.[0];
      expect(resetUrl).toBeDefined();
      const token = new URL(resetUrl!).searchParams.get('token');
      expect(token).toBeTruthy();

      const reset = await post('/reset-password', { newPassword, token }, cookie);
      expect(reset.ok).toBe(true);
      const sessionAfterReset = await fetch(`${api}/api/auth/get-session`, { headers: { cookie } }).then((r) => r.json());
      expect(sessionAfterReset).toBeNull();

      const newLogin = await post('/sign-in/email', { email, password: newPassword });
      expect(newLogin.ok).toBe(true);
      const logoutCookie = newLogin.headers.getSetCookie().map((part) => part.split(';', 1)[0]).join('; ');
      const logout = await post('/sign-out', {}, logoutCookie);
      expect(logout.ok).toBe(true);
    } finally {
      await pg?.unsafe('DELETE FROM "user" WHERE email = $1', [email]);
    }
  }, 45_000);
});

afterAll(async () => { await pg?.end(); });
