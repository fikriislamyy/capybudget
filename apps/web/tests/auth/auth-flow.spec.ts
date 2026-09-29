import { expect, test } from '@playwright/test';

const databaseUrl=process.env.DATABASE_URL??'postgres://capybudget:capybudget@localhost:5432/capybudget';
if(!new URL(databaseUrl).pathname.endsWith('_test'))throw new Error('Browser integration requires DATABASE_URL pointing to a disposable database ending in _test.');
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
    await page.addInitScript(() => {
      localStorage.setItem('capybudget-locale', 'en');
      localStorage.setItem('capybudget-theme', 'light');
    });
    await page.goto('/sign-up');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Name').fill('Browser Auth Test');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password',{exact:true}).fill(initialPassword);
    await page.getByLabel('Confirm password',{exact:true}).fill(initialPassword);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('Check your inbox',{exact:true})).toBeVisible();
    const verificationMail = await waitForMail('Your CapyBudget verification code');
    const otp = `${verificationMail.Text}\n${verificationMail.HTML}`.match(/\b\d{6}\b/)?.[0];
    expect(otp).toBeTruthy();
    await page.getByLabel('Email address').fill(email);
    await page.locator('input[autocomplete="one-time-code"]').fill(otp!);
    await page.getByRole('button', { name: 'Verify email' }).click();
    await expect(page.getByText('Welcome back',{exact:true})).toBeVisible();

    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password',{exact:true}).fill(initialPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading',{name:'Your money, at a glance'})).toBeVisible();

    const assistantSetup=await page.evaluate(async()=>{
      const workspaces=await fetch('/api/workspaces').then((response)=>response.json());
      const workspace=workspaces.items.find((item:{kind:string})=>item.kind==='personal');
      if(!workspace)return {workspaceStatus:404,accountStatus:0,settingsStatus:0};
      const account=await fetch(`/api/workspaces/${workspace.id}/accounts`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Browser forecast wallet',kind:'bank',openingBalance:'3000000.00'})});
      const accountBody=(await account.json()).account;
      const settings=await fetch(`/api/workspaces/${workspace.id}/assistant/settings`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({version:1,accounts:[{id:accountBody.id,included:true,allowExternalAi:false,lowBalanceThreshold:'4000000.00',protectedAmount:'0'}]})});
      return {workspaceStatus:200,accountStatus:account.status,settingsStatus:settings.status};
    });
    expect(assistantSetup).toEqual({workspaceStatus:200,accountStatus:201,settingsStatus:200});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.setViewportSize({width:360,height:800});
    await page.goto('/assistant');
    await expect(page.getByRole('heading',{name:'AI Assistant'})).toBeVisible();
    await expect(page.getByRole('img',{name:/Over 30 days/})).toBeVisible();
    const lowBalanceSuggestions=page.getByRole('article').filter({hasText:'Low balance'});
    await expect(lowBalanceSuggestions).toHaveCount(2);
    const lowBalanceSuggestion=lowBalanceSuggestions.first();
    await expect(lowBalanceSuggestion).toBeVisible();
    await lowBalanceSuggestion.getByRole('button',{name:/^Snooze/}).click();
    await expect(lowBalanceSuggestions).toHaveCount(1);
    await page.getByText('View daily forecast values').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('table',{name:/Workspace cash forecast/})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    let assistantNavigations=0;
    page.on('framenavigated',(frame)=>{if(frame===page.mainFrame())assistantNavigations++;});
    const navigationBaseline=assistantNavigations;
    await page.getByRole('button',{name:'Bahasa Indonesia'}).click();
    await expect(page.getByRole('heading',{name:'Asisten AI'})).toBeVisible();
    expect(assistantNavigations).toBe(navigationBaseline);
    await page.getByRole('button',{name:'Toggle dark mode'}).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('button',{name:'English'}).click();
    await expect(page.getByRole('heading',{name:'AI Assistant'})).toBeVisible();

    await page.setViewportSize({width:1280,height:800});
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByText('Welcome back',{exact:true})).toBeVisible();

    await page.goto('/forgot-password');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText('If an account matches that email');
    const resetMail = await waitForMail('Reset your CapyBudget password');
    const resetLink = `${resetMail.Text}\n${resetMail.HTML}`.match(/https?:\/\/[^\s"<>]+/)?.[0];
    expect(resetLink).toBeTruthy();
    const token = new URL(resetLink!).searchParams.get('token');
    expect(token).toBeTruthy();

    await page.goto(`/reset-password?token=${encodeURIComponent(token!)}`);
    await page.waitForLoadState('networkidle');
    await page.locator('input[autocomplete="new-password"]').nth(0).fill(updatedPassword);
    await page.getByLabel('Confirm password',{exact:true}).fill(updatedPassword);
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByText('Welcome back',{exact:true})).toBeVisible();

    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password',{exact:true}).fill(updatedPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading',{name:'Your money, at a glance'})).toBeVisible();
});
