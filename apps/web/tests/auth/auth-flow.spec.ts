import { expect, test, type Page } from '@playwright/test';

async function preference(page:Page, name:string|RegExp) {
  const mobile=(page.viewportSize()?.width??1280)<1024;
  if(mobile)await page.getByRole('button',{name:'More',exact:true}).or(page.getByRole('button',{name:'Menu lainnya',exact:true})).click();
  await page.getByRole('button',{name,exact:typeof name==='string'}).click();
  if(mobile)await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
}

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
    test.setTimeout(120_000);
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
    await page.waitForURL('**/onboarding');
    await page.getByRole('button',{name:'Continue',exact:true}).click();
    await page.getByRole('button',{name:'Continue',exact:true}).click();
    await page.locator('#ob-account').fill('First wallet');
    await page.getByRole('button',{name:'Continue',exact:true}).click();
    await page.getByRole('button',{name:'Take me to my dashboard',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Your money, at a glance'})).toBeVisible();

    const assistantSetup=await page.evaluate(async()=>{
      const workspaces=await fetch('/api/workspaces').then((response)=>response.json());
      const workspace=workspaces.items.find((item:{kind:string})=>item.kind==='personal');
      if(!workspace)return {workspaceStatus:404,accountStatus:0,settingsStatus:0,workspaceId:'',accountId:'',categoryId:''};
      const account=await fetch(`/api/workspaces/${workspace.id}/accounts`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Browser forecast wallet',kind:'bank',openingBalance:'3000000.00'})});
      const accountBody=(await account.json()).account;
      const settings=await fetch(`/api/workspaces/${workspace.id}/assistant/settings`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({version:1,accounts:[{id:accountBody.id,included:true,allowExternalAi:false,lowBalanceThreshold:'4000000.00',protectedAmount:'0'}]})});
      const categories=await fetch(`/api/workspaces/${workspace.id}/categories`).then((response)=>response.json());
      const secondWorkspace=await fetch('/api/workspaces',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Browser notification isolation',kind:'business',currency:'IDR',timezone:'Asia/Jakarta'})});
      const secondWorkspaceBody=secondWorkspace.ok?(await secondWorkspace.json()).workspace:null;
      return {workspaceStatus:200,accountStatus:account.status,settingsStatus:settings.status,secondWorkspaceStatus:secondWorkspace.status,workspaceId:workspace.id,secondWorkspaceId:secondWorkspaceBody?.id??'',accountId:accountBody.id,categoryId:categories.items.find((item:{type:string})=>item.type==='expense')?.id??''};
    });
    expect(assistantSetup).toMatchObject({workspaceStatus:200,accountStatus:201,settingsStatus:200,secondWorkspaceStatus:201});
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
    await preference(page,'Bahasa Indonesia');
    await expect(page.getByRole('heading',{name:'Asisten AI'})).toBeVisible();
    expect(assistantNavigations).toBe(navigationBaseline);
    await preference(page,/^(Theme:|Tema:)/);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await preference(page,'English');
    await expect(page.getByRole('heading',{name:'AI Assistant'})).toBeVisible();

    const notificationSource=await page.evaluate(async({workspaceId,accountId,categoryId})=>{
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),startsOn=today.slice(0,7)+'-01';
      const budget=await fetch(`/api/workspaces/${workspaceId}/budgets`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Browser notification budget',categoryId,amount:'100.00',cadence:'monthly',startsOn})});
      if(!budget.ok)return {budgetStatus:budget.status,transactionStatus:0};
      const transaction=await fetch(`/api/workspaces/${workspaceId}/transactions`,{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({type:'expense',accountId,categoryId,amount:'80.00',date:today,notes:'Browser notification fixture'})});
      return {budgetStatus:budget.status,transactionStatus:transaction.status};
    },assistantSetup);
    expect(notificationSource).toEqual({budgetStatus:201,transactionStatus:201});
    await expect.poll(async()=>page.evaluate(async(workspaceId)=>{
      const result=await fetch(`/api/workspaces/${workspaceId}/notifications?state=unread&type=budget-alert&limit=50`).then((response)=>response.json());
      return result.items.some((item:{messageKey:string;evidence:{spent:string}})=>item.messageKey==='budget.threshold'&&item.evidence.spent==='80.0000');
    },assistantSetup.workspaceId),{timeout:75_000,intervals:[1000,2000]}).toBe(true);
    await page.getByRole('button',{name:/Alerts/}).click();
    await expect(page.getByRole('region',{name:'Alerts'})).toBeVisible();
    await page.getByRole('link',{name:'View all notifications'}).click();
    await expect(page.getByRole('heading',{name:'Notifications'})).toBeVisible();
    let budgetNotice=page.getByRole('article').filter({hasText:'budget at 80%'});
    await expect(budgetNotice).toHaveCount(1);
    await budgetNotice.getByRole('link',{name:'Open source'}).click();
    await expect(page).toHaveURL(/\/budgets$/);
    let releasePendingInbox!:()=>void;
    let pendingInboxStarted=false;
    let heldInboxResponse=false;
    let markHeldInboxComplete!:()=>void;
    const heldInboxComplete=new Promise<void>(resolve=>{markHeldInboxComplete=resolve;});
    await page.route(`**/api/workspaces/${assistantSetup.workspaceId}/notifications?**`,async route=>{
      if(heldInboxResponse){await route.continue();return;}
      heldInboxResponse=true;
      const response=await route.fetch();
      pendingInboxStarted=true;
      await new Promise<void>(resolve=>{releasePendingInbox=resolve;});
      await route.fulfill({response});
      markHeldInboxComplete();
    });
    await page.goto('/notifications');
    await expect.poll(()=>pendingInboxStarted).toBe(true);
    await page.locator('#workspace-switcher').selectOption(assistantSetup.secondWorkspaceId);
    await expect(page.getByText('No notifications here yet.')).toBeVisible();
    releasePendingInbox();
    await heldInboxComplete;
    await page.unroute(`**/api/workspaces/${assistantSetup.workspaceId}/notifications?**`);
    await expect(page.getByText('budget at 80%')).toHaveCount(0);
    await page.locator('#workspace-switcher').selectOption(assistantSetup.workspaceId);
    budgetNotice=page.getByRole('article').filter({hasText:'budget at 80%'});
    await expect(budgetNotice).toHaveCount(1);
    await expect(budgetNotice).toHaveAccessibleName(/budget at 80%/);
    await expect(page.getByRole('navigation',{name:'Filters'})).toBeVisible();
    await page.evaluate(()=>{(window as any).__themeTransitions=0;const original=document.startViewTransition?.bind(document);if(original)document.startViewTransition=((update:any)=>{(window as any).__themeTransitions++;return original(update);}) as typeof document.startViewTransition;});
    const initialDark=await page.locator('html').evaluate(el=>el.classList.contains('dark'));
    for(let i=0;i<3;i++){
      await preference(page,/^(Theme:|Tema:)/);
      const expectedDark=await page.evaluate(()=>{const choice=localStorage.getItem('capybudget-theme');return choice==='dark'||choice==='system'&&matchMedia('(prefers-color-scheme: dark)').matches;});
      await expect.poll(()=>page.locator('html').evaluate(el=>el.classList.contains('dark'))).toBe(expectedDark);
    }
    await expect.poll(()=>page.locator('html').evaluate(el=>el.classList.contains('dark'))).toBe(initialDark);
    expect(await page.evaluate(()=>(window as any).__themeTransitions)).toBe(0);
    let notificationNavigations=0;
    page.on('framenavigated',frame=>{if(frame===page.mainFrame())notificationNavigations++;});
    const notificationNavigationBaseline=notificationNavigations;
    await preference(page,'Bahasa Indonesia');
    await expect(page.getByRole('heading',{name:'Pemberitahuan'})).toBeVisible();
    await expect(page.getByRole('article').filter({hasText:'terpakai 80%'}).getByRole('link',{name:'Buka sumber'})).toBeVisible();
    expect(notificationNavigations).toBe(notificationNavigationBaseline);
    await preference(page,'English');
    await expect(page.getByRole('heading',{name:'Notifications'})).toBeVisible();
    await expect(budgetNotice.getByRole('link',{name:'Open source'})).toBeVisible();
    await expect(budgetNotice).toContainText('100.0000');
    await page.getByRole('button',{name:'Hide amounts'}).click();
    await expect(budgetNotice).toContainText('Financial details are hidden.');
    await expect(budgetNotice).not.toContainText('100.0000');
    await page.getByRole('button',{name:/Alerts/}).click();
    await expect(page.getByRole('region',{name:'Alerts'})).toBeVisible();
    await expect(page.getByRole('region',{name:'Alerts'}).getByText('Financial details are hidden.').last()).toBeVisible();
    await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button',{name:'Show amounts'}).click();
    await expect(budgetNotice).toContainText('100.0000');
    await page.getByRole('button',{name:/Alerts/}).click();
    const alertPanel=page.getByRole('region',{name:'Alerts'});
    await expect(alertPanel.getByRole('article').filter({hasText:'budget at 80%'})).toContainText('100.0000');
    await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    const readNotice=budgetNotice.getByRole('button',{name:'Mark read'});
    await readNotice.focus();
    await expect(readNotice).toBeFocused();
    const readResponse=page.waitForResponse(response=>response.url().endsWith('/read')&&response.request().method()==='PATCH');
    await page.keyboard.press('Enter');
    expect((await readResponse).status()).toBe(200);
    const snoozeNotice=budgetNotice.getByRole('button',{name:'Snooze 1 hour'});
    await expect(snoozeNotice).toBeVisible();
    await snoozeNotice.focus();
    const snoozeResponse=page.waitForResponse(response=>response.url().endsWith('/snooze')&&response.request().method()==='PATCH');
    await page.keyboard.press('Enter');
    expect((await snoozeResponse).status()).toBe(200);
    await expect.poll(()=>page.evaluate(async(workspaceId)=>{
      const pageData=await fetch(`/api/workspaces/${workspaceId}/notifications?state=all&type=budget-alert&limit=50`).then(response=>response.json());
      return pageData.items.some((item:{messageKey:string;evidence:{spent:string};snoozedUntil:string|null})=>item.messageKey==='budget.threshold'&&item.evidence.spent==='80.0000'&&item.snoozedUntil!==null);
    },assistantSetup.workspaceId)).toBe(true);
    const dismissResponse=page.waitForResponse((response)=>response.url().includes('/notifications/')&&response.url().endsWith('/dismiss')&&response.request().method()==='PATCH');
    const dismissNotice=budgetNotice.getByRole('button',{name:'Dismiss'});
    await expect(dismissNotice).toBeVisible();
    await dismissNotice.focus();
    await page.keyboard.press('Enter');
    expect((await dismissResponse).status()).toBe(200);
    const noticeActions=await page.evaluate(async(workspaceId)=>{
      const pageData=await fetch(`/api/workspaces/${workspaceId}/notifications?state=all&type=budget-alert&limit=50`).then((response)=>response.json());
      return pageData.items.find((item:{messageKey:string;evidence:{spent:string}})=>item.messageKey==='budget.threshold'&&item.evidence.spent==='80.0000');
    },assistantSetup.workspaceId);
    expect(noticeActions).toMatchObject({readAt:expect.any(String),dismissedAt:expect.any(String),snoozedUntil:expect.any(String)});

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
