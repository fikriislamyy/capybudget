import {test,expect} from '@playwright/test';

test('security settings, PIN API boundary, platform WebAuthn, session list, and privacy presentation',async({page,context,browser})=>{
 test.setTimeout(90_000);page.setDefaultTimeout(10_000);page.on('pageerror',e=>console.error('Browser error:',e.message));
 const email='security-browser-'+crypto.randomUUID()+'@example.test',password='Security-browser-password!42';
 const signup=await context.request.post('/api/auth/sign-up/email',{data:{name:'Security Browser',email,password},headers:{origin:new URL(page.url()==='about:blank'?(process.env.TEST_WEB_PORT?'http://localhost:'+process.env.TEST_WEB_PORT:'http://localhost:5174'):page.url()).origin}});
 expect(signup.ok()).toBeTruthy();
 let otp='';for(let attempt=0;attempt<60&&!otp;attempt++){
  const listing=await fetch('http://localhost:8025/api/v1/messages?limit=100').then(r=>r.json());
  for(const message of listing.messages??[]){if(!(message.To??[]).some((to:{Address:string})=>to.Address===email))continue;const body=await fetch('http://localhost:8025/api/v1/message/'+message.ID).then(r=>r.json());otp=(body.Text??'').match(/\b\d{6}\b/)?.[0]??'';if(otp)break;}
  if(!otp)await page.waitForTimeout(250);
 }
 expect(otp).toHaveLength(6);
 expect((await context.request.post('/api/auth/email-otp/verify-email',{data:{email,otp}})).ok()).toBeTruthy();
 await page.goto('/login');await page.getByLabel('Email address',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/onboarding');
 expect((await context.request.post('/api/onboarding/provision',{data:{usageType:'personal',currency:'IDR',language:'en'}})).ok()).toBeTruthy();
 expect((await context.request.post('/api/onboarding/finish',{data:{}})).ok()).toBeTruthy();
 await page.goto('/dashboard');
 const workspaces=await context.request.get('/api/workspaces');const workspace=(await workspaces.json()).items[0];expect((await context.request.post('/api/workspaces/'+workspace.id+'/accounts',{data:{name:'Privacy wallet',kind:'cash',openingBalance:'123456'}})).ok()).toBeTruthy();
 const second=await browser.newContext({baseURL:new URL(page.url()).origin});
 expect((await second.request.post('/api/auth/sign-in/email',{data:{email,password},headers:{origin:new URL(page.url()).origin}})).ok()).toBeTruthy();
 const otherPage=await second.newPage();await otherPage.goto('/accounts');await expect(otherPage.getByText('Privacy wallet',{exact:true})).toBeVisible();
 expect((await context.request.post('/api/workspaces/'+workspace.id+'/accounts',{data:{name:'Synced wallet',kind:'cash',openingBalance:'25'}})).ok()).toBeTruthy();
 await otherPage.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(otherPage.getByText('Synced wallet',{exact:true})).toBeVisible();
 await second.setOffline(true);await expect(otherPage.getByText('You are offline. Changes cannot be saved.',{exact:true})).toBeVisible();await second.setOffline(false);
 await otherPage.addInitScript(()=>{Object.defineProperty(Storage.prototype,'getItem',{value(){throw new DOMException('Storage blocked','SecurityError');}});Object.defineProperty(Storage.prototype,'setItem',{value(){throw new DOMException('Storage blocked','SecurityError');}});});
 await otherPage.reload();await expect(otherPage.locator('.money').first()).toContainText('••••••');
 await second.close();
 await page.getByRole('link',{name:'Security',exact:true}).click();await expect(page.getByRole('heading',{name:'Security and devices'})).toBeVisible();
 await page.getByLabel('Password',{exact:true}).fill(password);await page.getByLabel('New PIN (6–8 digits)').fill('654321');await page.getByRole('button',{name:'Set PIN',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Security settings updated.');
 const locked=await context.request.post('/api/security/lock',{data:{}});expect(locked.ok()).toBeTruthy();
 expect((await context.request.get('/api/workspaces')).status()).toBe(423);
 await page.goto('/dashboard');await page.waitForURL('**/unlock');await page.getByLabel('PIN',{exact:true}).fill('654321');await page.getByRole('button',{name:'Unlock',exact:true}).click();await page.waitForURL('**/dashboard');
 const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
 await page.getByRole('link',{name:'Security',exact:true}).click();await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Register device security'}).click();await expect(page.getByRole('status')).toHaveText('Security settings updated.');
 await context.request.post('/api/security/lock',{data:{}});await page.goto('/dashboard');await page.waitForURL('**/unlock');await page.getByRole('button',{name:'Use device security',exact:true}).click();await page.waitForURL('**/dashboard');
 const listing=await context.request.get('/api/security/sessions');const sessions=(await listing.json()).items;expect(sessions.every((s:Record<string,unknown>)=>!('token' in s))).toBeTruthy();
 await page.getByRole('button',{name:'Hide amounts',exact:true}).click();await page.getByRole('link',{name:'Accounts',exact:true}).click();await expect(page.locator('.money').first()).toContainText('••••••');
 await page.setViewportSize({width:360,height:800});await page.getByRole('button',{name:'More',exact:true}).click();await page.getByRole('dialog').getByRole('link',{name:'Security',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.evaluate(()=>{(window as any).__securityLocaleMarker='kept';});await page.getByRole('button',{name:'More',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Bahasa Indonesia'}).click();await page.keyboard.press('Escape');await expect(page.getByRole('heading',{name:'Keamanan dan perangkat'})).toBeVisible();expect(await page.evaluate(()=>(window as any).__securityLocaleMarker)).toBe('kept');await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Menu lainnya',exact:true}).click();for(let i=0;i<3&&!await page.locator('html').evaluate(e=>e.classList.contains('dark'));i++)await page.getByRole('dialog').getByRole('button',{name:/^Tema:/}).click();await page.keyboard.press('Escape');await expect(page.locator('html')).toHaveClass(/dark/);
 await cdp.detach();
});
