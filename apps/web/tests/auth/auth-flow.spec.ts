import { expect, test } from '@playwright/test';
import postgres from 'postgres';

const mailpit = 'http://localhost:8025';
const email = `auth-browser-${crypto.randomUUID()}@example.test`;
const initialPassword = 'Browser-passphrase-923!';
const updatedPassword = 'Browser-updated-passphrase-248!';

async function waitForMail(subject: string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const listing = await fetch(`${mailpit}/api/v1/messages?limit=50`).then((r) => r.json());
    for (const message of listing.messages ?? []) {
      if (message.Subject !== subject || !JSON.stringify(message).includes(email)) continue;
      return fetch(`${mailpit}/api/v1/message/${message.ID}`).then((r) => r.json()) as Promise<{ Text: string; HTML: string }>;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for local email: ${subject}`);
}

test('signup, OTP verification, login, password reset, and logout', async ({ page }) => {
  try {
    await page.goto('/sign-up');
    await page.getByLabel('Name').fill('Browser Auth Test');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill(initialPassword);
    await page.getByLabel('Confirm password').fill(initialPassword);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    const verificationMail = await waitForMail('Your CapyBudget verification code');
    const otp = `${verificationMail.Text}\n${verificationMail.HTML}`.match(/\b\d{6}\b/)?.[0];
    expect(otp).toBeTruthy();
    await page.getByLabel('Email address').fill(email);
    await page.locator('input[autocomplete="one-time-code"]').fill(otp!);
    await page.getByRole('button', { name: 'Verify email' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill(initialPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: /Your account is ready/ })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

    await page.goto('/forgot-password');
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText('If an account matches that email');
    const resetMail = await waitForMail('Reset your CapyBudget password');
    const resetLink = `${resetMail.Text}\n${resetMail.HTML}`.match(/https?:\/\/[^\s"<>]+/)?.[0];
    expect(resetLink).toBeTruthy();
    const token = new URL(resetLink!).searchParams.get('token');
    expect(token).toBeTruthy();

    await page.goto(`/reset-password?token=${encodeURIComponent(token!)}`);
    await page.locator('input[autocomplete="new-password"]').nth(0).fill(updatedPassword);
    await page.getByLabel('Confirm password').fill(updatedPassword);
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill(updatedPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: /Your account is ready/ })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  } finally {
    const sql = postgres(process.env.DATABASE_URL ?? 'postgres://capybudget:capybudget@localhost:5432/capybudget');
    try { await sql.unsafe('DELETE FROM "user" WHERE email = $1', [email]); }
    finally { await sql.end(); }
  }
});
