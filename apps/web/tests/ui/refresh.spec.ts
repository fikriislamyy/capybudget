import { test as base, request as localRequest, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// API requests stay on the client host when browsers run in Docker.
const test=base.extend<{api:APIRequestContext}>({
  api:async({},use)=>{
    const api=await localRequest.newContext({baseURL:`http://localhost:${process.env.TEST_WEB_PORT??5174}`,storageState:storage});
    try{await use(api);}finally{await api.dispose();}
  }
});
test.describe.configure({mode:'serial'});
const password = 'UI-synthetic-password!42';
let storage: Awaited<ReturnType<BrowserContext['storageState']>>;
let userId = '';
let personal = '', business = '', account = '', category = '', invoice = '';
const artifacts = join(process.cwd(), '../../docs/ui-ux/screenshots',process.env.UI_BROWSER??'');
const metrics: Record<string, unknown>[] = [];
const pages = ['/dashboard','/transactions','/accounts','/categories','/recurring','/budgets','/goals','/bills','/assistant','/reports','/notifications','/settings/appearance','/settings/security','/settings/privacy','/settings/notifications','/invoices','/invoices/new','/business/settings'];

async function checked(response: Awaited<ReturnType<BrowserContext['request']['post']>>): Promise<any> {
  expect(response.ok(), `${response.url()}: ${await response.text()}`).toBeTruthy();
  return response.json();
}
async function ready(page: Page) {
  await expect(page.locator('main')).toBeVisible({timeout:30_000});
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect(page.getByRole('status',{name:/^(Loading|Memuat)/})).toHaveCount(0);
  await expect(page.locator('[role="status"]').filter({hasText:/^(Loading|Memuat)/})).toHaveCount(0);
}
async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({width:innerWidth, actual:document.documentElement.scrollWidth}));
  expect(overflow.actual, `${page.url()} overflow at ${overflow.width}px`).toBeLessThanOrEqual(overflow.width+1);
  expect(await page.locator('button button').count(), 'nested interactive buttons').toBe(0);
}
async function navigate(page: Page, path: string) {
  if (page.url()==='about:blank') {await page.goto(path);return;}
  if (new URL(page.url()).pathname===path) return;
  await page.evaluate(path=>{const link=document.createElement('a');link.href=path;link.textContent='UI test destination';document.body.append(link);link.click();link.remove();},path);
  await page.waitForURL(url=>url.pathname===path);
}
async function chooseWorkspace(page: Page, id: string) {
  await page.locator('#workspace-switcher').selectOption(id);
  await expect(page.locator('#workspace-switcher')).toHaveValue(id);
}

test.beforeAll(async () => {
  test.setTimeout(90_000);
  mkdirSync(artifacts,{recursive:true});
  const email=`ui-refresh-${crypto.randomUUID()}@example.test`;
  const base=`http://localhost:${process.env.TEST_WEB_PORT??5174}`;
  const api=await localRequest.newContext({baseURL:base});
  await checked(await api.post(`${base}/api/auth/sign-up/email`,{data:{email,password,name:'UI Review'},headers:{origin:base}}));
  let otp='';
  await expect.poll(async()=>{
    const listing=await fetch('http://localhost:8025/api/v1/messages?limit=100').then(r=>r.json());
    for(const message of listing.messages??[]){
      if(!(message.To??[]).some((to:{Address:string})=>to.Address===email))continue;
      const mail=await fetch(`http://localhost:8025/api/v1/message/${message.ID}`).then(r=>r.json());
      otp=mail.Text.match(/\b\d{6}\b/)?.[0]??'';
      if(otp)break;
    }
    return otp.length;
  },{timeout:30_000}).toBe(6);
  await checked(await api.post(`${base}/api/auth/email-otp/verify-email`,{data:{email,otp}}));
  userId=(await checked(await api.post(`${base}/api/auth/sign-in/email`,{data:{email,password},headers:{origin:base}}))).user.id;
  await checked(await api.post(`${base}/api/onboarding/provision`,{data:{usageType:'both',currency:'IDR',language:'en',businessName:'Studio UI'}}));
  const workspaces=await checked(await api.get(`${base}/api/workspaces`));
  personal=workspaces.items.find((w:any)=>w.kind==='personal').id;
  business=workspaces.items.find((w:any)=>w.kind==='business').id;
  for(const id of [personal,business]){
    const a=await checked(await api.post(`${base}/api/workspaces/${id}/accounts`,{data:{name:'Main wallet',kind:'cash',openingBalance:'1234567890.1234'}}));
    await checked(await api.patch(`${base}/api/workspaces/${id}/assistant/settings`,{data:{version:1,localForecastEnabled:true}}));
    const cats=await checked(await api.get(`${base}/api/workspaces/${id}/categories`));
    const c=cats.items.find((c:any)=>c.type==='expense').id;
    if(id===personal){account=a.account.id;category=c;}
    await checked(await api.post(`${base}/api/workspaces/${id}/transactions`,{data:{type:'expense',accountId:a.account.id,categoryId:c,amount:'45000',date:'2026-10-01',notes:'Lunch with a long descriptive merchant name'},headers:{'idempotency-key':crypto.randomUUID()}}));
    await checked(await api.post(`${base}/api/workspaces/${id}/budgets`,{data:{name:'Food budget',categoryId:c,amount:'500000',cadence:'monthly'}}));
    await checked(await api.post(`${base}/api/workspaces/${id}/goals`,{data:{name:'Emergency fund',targetAmount:'9000000'}}));
    await checked(await api.post(`${base}/api/workspaces/${id}/bills`,{data:{name:'Internet bill',amount:'350000',dueOn:'2026-10-05',frequency:'month'}}));
  }
  const inv=await checked(await api.post(`${base}/api/workspaces/${business}/invoices`,{data:{recipient:{name:'Synthetic Customer',email:'client@example.test'},issueDate:'2026-10-01',dueDate:'2026-10-15',lines:[{description:'Design service',quantity:'1',unitPrice:'750000'}]}}));
  invoice=inv.invoice.id;
  await checked(await api.post(`${base}/api/onboarding/finish`,{data:{}}));
  await checked(await api.put(`${base}/api/preferences`,{data:{theme:'light',locale:'en'}}));
  storage=await api.storageState({path:'/tmp/capybudget-ui-storage.json'});
  writeFileSync('/tmp/capybudget-ui-fixture.json',JSON.stringify({userId,personal,business,account,category,invoice}));
  await api.dispose();
});

test.beforeEach(async({context})=>{
  await context.addCookies(storage.cookies);
  await context.addInitScript(id=>{try{localStorage.setItem('capybudget-theme','light');localStorage.setItem('capybudget-locale','en');if(!localStorage.getItem('capybudget-workspace:'+id.user))localStorage.setItem('capybudget-workspace:'+id.user,id.workspace);}catch{}}, {user:userId,workspace:personal});
});

test('all page families reflow on mobile, tablet and desktop without runtime errors',async({page,context,api})=>{
  test.setTimeout(300_000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await api.put('/api/preferences',{data:{theme:'light',locale:'en'}});
  for(const width of [390,820,1440]){
    await page.setViewportSize({width,height:900});
    for(const route of [...pages,`/invoices/${invoice}`]){
      const wanted=route.startsWith('/invoices')||route.startsWith('/business')?business:personal;
      if(await page.locator('#workspace-switcher').count() && await page.locator('#workspace-switcher').inputValue()!==wanted)await chooseWorkspace(page,wanted);
      await navigate(page,route);
      await ready(page);
      await noOverflow(page);
      if(route==='/recurring'){let count=0;const listener=(request:any)=>{if(request.url().endsWith('/recurring-occurrences/materialize'))count++;};page.on('request',listener);await page.waitForTimeout(600);page.off('request',listener);expect(count).toBe(0);}
      if(route==='/dashboard'||route==='/reports')await page.screenshot({path:join(artifacts,`${route.slice(1)}-${width}-light-en.png`),fullPage:true});
    }
  }
  expect(errors).toEqual([]);
});

test('theme, locale, privacy, keyboard overlays and amount retries',async({page,context,api})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/transactions');await ready(page);await chooseWorkspace(page,personal);
  await page.getByRole('button',{name:'New transaction',exact:true}).click();
  const form=page.getByRole('dialog');
  await form.getByLabel(/^Amount/).fill('55555');
  await form.locator('#category').selectOption(category);
  let failOnce=true;const keys:string[]=[];
  await page.route('**/api/workspaces/*/transactions',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    keys.push(route.request().headers()['idempotency-key']);
    if(failOnce){failOnce=false;await api.fetch(route.request().url(),{method:'POST',headers:route.request().headers(),data:route.request().postData()??undefined});return route.abort('failed');}
    return route.continue();
  });
  await form.getByRole('button',{name:'Save transaction',exact:true}).click();
  await expect(form.locator('[role="alert"]')).toBeVisible();
  await form.getByRole('button',{name:'Save transaction',exact:true}).click();
  await expect(form.getByRole('status')).toHaveText('Transaction saved.');
  expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);
  const rows=await checked(await api.get(`/api/workspaces/${personal}/transactions?minAmount=55555&maxAmount=55555`));
  expect(rows.items).toHaveLength(1);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:/^Filters/}).click();
  await page.getByRole('dialog').locator('#minimum').fill('12345');
  await page.getByRole('dialog').getByRole('button',{name:'Apply',exact:true}).click();
  await page.getByRole('button',{name:'Hide amounts',exact:true}).click();
  await expect(page.locator('.chips')).not.toContainText('12345');
  await page.getByRole('button',{name:'Quick add',exact:true}).click();
  await expect(page.getByRole('dialog').getByLabel(/^Amount/)).toBeFocused();
  for(let i=0;i<15;i++){await page.keyboard.press('Tab');expect(await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]'))).toBeTruthy();}
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Quick add',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Quick add',exact:true}).click();
  const quick=page.getByRole('dialog');await quick.getByLabel(/^Amount/).fill('66,666.1250');
  await quick.getByRole('group',{name:'Category',exact:true}).getByRole('button').first().click();
  failOnce=true;keys.length=0;
  await quick.getByRole('button',{name:'Save',exact:true}).click();await expect(quick.getByRole('alert')).toBeVisible();
  await quick.getByRole('button',{name:'Save',exact:true}).click();await expect(quick.getByRole('status')).toHaveText('Saved.');
  expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);
  expect((await checked(await api.get(`/api/workspaces/${personal}/transactions?minAmount=66666.1250&maxAmount=66666.1250`))).items).toHaveLength(1);
  await page.keyboard.press('Escape');await expect(quick).toHaveCount(0);
  await page.goto('/settings/appearance');await ready(page);
  await page.evaluate(()=>{(window as any).__uiMarker='kept';});
  await page.getByRole('radio',{name:'Bahasa Indonesia'}).check();
  await expect(page.getByRole('heading',{name:'Tampilan',exact:true})).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('radio',{name:'Gelap',exact:true}).check();
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(await page.evaluate(()=>(window as any).__uiMarker)).toBe('kept');
  for(const route of ['/dashboard','/transactions','/reports','/settings/security','/settings/privacy']){
    await navigate(page,route);await ready(page);await noOverflow(page);
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),route).toEqual([]);
  }
  await page.screenshot({path:join(artifacts,'privacy-390-dark-id.png'),fullPage:true});
});

test('quick-add empty recovery, workspace changes and visible opening latency',async({page,context,api})=>{
  test.setTimeout(90_000);
  await api.put('/api/preferences',{data:{theme:'light',locale:'en'}});
  await page.setViewportSize({width:360,height:800});await page.goto('/dashboard');await ready(page);await chooseWorkspace(page,personal);
  await page.route(`**/api/workspaces/${personal}/accounts`,route=>route.fulfill({json:{items:[]}}));
  await page.getByRole('button',{name:'Quick add',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('link',{name:'Go to Accounts'})).toBeVisible();
  await page.keyboard.press('Escape');await page.unroute(`**/api/workspaces/${personal}/accounts`);
  await chooseWorkspace(page,business);
  const start=performance.now();await page.getByRole('button',{name:'Quick add',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  metrics.push({metric:'quickAddVisible',ms:Math.round(performance.now()-start),viewport:360});
  await expect(page.locator('#quick-account')).toContainText('Main wallet');
  const option=await page.locator('#quick-account').inputValue();expect(option).not.toBe(account);
  await page.keyboard.press('Escape');
  writeFileSync(join(process.cwd(),'../../docs/ui-ux/'+(process.env.UI_BROWSER?process.env.UI_BROWSER+'-':'')+'browser-metrics.json'),JSON.stringify(metrics,null,2)+'\n');
});

test('dark Indonesian pages, narrow widths, landscape and keyboard navigation',async({page,context,api})=>{
  test.setTimeout(300_000);
  await api.put('/api/preferences',{data:{theme:'dark',locale:'id'}});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:390,height:844});
  for(const route of [...pages,`/invoices/${invoice}`]){
    const wanted=route.startsWith('/invoices')||route.startsWith('/business')?business:personal;
    if(await page.locator('#workspace-switcher').count()&&await page.locator('#workspace-switcher').inputValue()!==wanted)await chooseWorkspace(page,wanted);
    await navigate(page,route);await ready(page);await noOverflow(page);
    await expect(page.locator('html')).toHaveAttribute('lang','id');
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),route).toEqual([]);
    if(['/dashboard','/transactions','/invoices','/reports'].includes(route))await page.screenshot({path:join(artifacts,`${route.slice(1)}-390-dark-id.png`),fullPage:true});
  }
  await chooseWorkspace(page,personal);
  for(const width of [320,360,430,768,1024]){
    await page.setViewportSize({width,height:800});
    for(const route of ['/dashboard','/transactions','/reports','/settings/appearance']){await navigate(page,route);await ready(page);await noOverflow(page);}
    await page.getByRole('radio',{name:'Gelap',exact:true}).focus();await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio',{name:'Ikuti perangkat',exact:true})).toBeChecked();
    await page.getByRole('radio',{name:'Gelap',exact:true}).check();
    const quick=page.getByRole('button',{name:'Tambah cepat',exact:true});
    await quick.click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
    await expect(quick).toBeFocused();
  }
  await page.setViewportSize({width:844,height:390});await navigate(page,'/dashboard');await ready(page);
  await page.getByRole('button',{name:'Tambah cepat',exact:true}).click();
  await page.getByRole('dialog').getByLabel(/^Jumlah/).fill('45.000');
  await page.getByRole('dialog').getByRole('button',{name:'Simpan',exact:true}).scrollIntoViewIfNeeded();
  await expect(page.getByRole('dialog').getByRole('button',{name:'Simpan',exact:true})).toBeInViewport();
  await noOverflow(page);await page.keyboard.press('Escape');
});

test('security checks recover independently and the notification sheet traps focus',async({page,context,api})=>{
  await api.put('/api/preferences',{data:{theme:'light',locale:'en'}});
  await page.goto('/dashboard');await ready(page);
  await page.route('**/api/security/status',r=>r.fulfill({json:{locked:false,lockEnabled:true,privacyDefault:false}}));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await ready(page);
  await page.route('**/api/security/status',r=>r.abort('failed'));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.locator('main')).toHaveCount(0);
  await page.unroute('**/api/security/status');
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await ready(page);
  await page.getByRole('button',{name:/^Alerts/}).click();
  await expect(page.getByRole('dialog',{name:'Alerts',exact:true})).toBeVisible();
  for(let i=0;i<8;i++){await page.keyboard.press('Tab');expect(await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]'))).toBe(true);}
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:/^Alerts/})).toBeFocused();
});

test('production mobile profile: warm dashboard and ten quick-add journeys',async({page,context,browserName,api})=>{
  test.skip(browserName!=='chromium'||process.env.UI_PRODUCTION!=='1','Performance evidence requires a production build.');
  test.setTimeout(180_000);
  await api.put('/api/preferences',{data:{theme:'light',locale:'en'}});
  await page.setViewportSize({width:390,height:844});
  let optionReads=0;
  page.on('request',request=>{const path=new URL(request.url()).pathname;if(request.method()==='GET'&&[ `/api/workspaces/${personal}/accounts`, `/api/workspaces/${personal}/categories` ].includes(path))optionReads++;});
  const cdp=await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions',{offline:false,downloadThroughput:1_600_000/8,uploadThroughput:750_000/8,latency:40});
  await page.addInitScript(()=>{
    (window as any).__lab={cls:0,lcp:0,longTasks:0};
    for(const type of ['layout-shift','largest-contentful-paint','longtask'])try{
      new PerformanceObserver(list=>{for(const e of list.getEntries() as any[]){const m=(window as any).__lab;if(type==='layout-shift'&&!e.hadRecentInput)m.cls+=e.value;if(type==='largest-contentful-paint')m.lcp=e.startTime;if(type==='longtask')m.longTasks++;}}).observe({type,buffered:true});
    }catch{}
  });
  await page.goto('/dashboard');await ready(page);await chooseWorkspace(page,personal);
  const dashboard:number[]=[],opening:number[]=[],entry:number[]=[];
  for(let i=0;i<5;i++){const start=performance.now();await page.reload();await ready(page);dashboard.push(Math.round(performance.now()-start));}
  let baselineDashboard:number[]=[];
  if(process.env.UI_BASELINE_URL){
    const before=await context.newPage(),beforeCdp=await context.newCDPSession(before);
    await beforeCdp.send('Emulation.setCPUThrottlingRate',{rate:4});await beforeCdp.send('Network.enable');
    await beforeCdp.send('Network.emulateNetworkConditions',{offline:false,downloadThroughput:1_600_000/8,uploadThroughput:750_000/8,latency:40});
    await before.goto(process.env.UI_BASELINE_URL+'/dashboard');await expect(before.locator('.summary .value').first().or(before.locator('.stats .value').first())).toBeVisible().catch(()=>{});
    await before.waitForFunction(()=>!document.querySelector('main')?.textContent?.includes('Loading…'));
    for(let i=0;i<5;i++){const start=performance.now();await before.reload();await expect(before.locator('main h1')).toBeVisible();await before.waitForFunction(()=>!document.querySelector('main')?.textContent?.includes('Loading…'));baselineDashboard.push(Math.round(performance.now()-start));}
    for(const width of [390,820,1440]){await before.setViewportSize({width,height:900});await before.screenshot({path:join(artifacts,`before-dashboard-${width}-light-en.png`),fullPage:true});}
    await beforeCdp.detach();await before.close();
  }
  await page.bringToFront();await ready(page);
  const vitals=await page.evaluate(()=>(window as any).__lab);
  for(let i=0;i<10;i++){
    const start=performance.now();await page.getByRole('button',{name:'Quick add',exact:true}).click();
    const sheet=page.getByRole('dialog');await expect(sheet).toBeVisible();opening.push(Math.round(performance.now()-start));
    await sheet.getByLabel(/^Amount/).fill(String(70000+i));
    await sheet.getByRole('group',{name:'Category',exact:true}).getByRole('button').first().click();
    await expect(sheet.getByRole('status')).toHaveCount(0);
    await sheet.getByRole('button',{name:'Save',exact:true}).click();
    await expect(sheet.getByRole('status')).toHaveText('Saved.');
    await expect(sheet.getByLabel(/^Amount/)).toHaveValue('');entry.push(Math.round(performance.now()-start));
    await page.keyboard.press('Escape');await expect(sheet).toHaveCount(0);
  }
  const measuredRows=await checked(await api.get(`/api/workspaces/${personal}/transactions?minAmount=70000&maxAmount=70009`));
  expect(measuredRows.items).toHaveLength(10);
  expect(optionReads).toBeLessThanOrEqual(4);
  const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};
  writeFileSync(join(process.cwd(),'../../docs/ui-ux/production-metrics.json'),JSON.stringify({profile:'Chromium headless, production, CPU 4x slowdown, 1.6 Mbps down / 750 Kbps up, 40ms latency, warm cache, 390×844',dataset:'Synthetic personal and business workspaces with wallets, budgets, goals, bills and a business invoice; ten measured quick-add entries',optionReads,baselineDashboardMs:baselineDashboard,dashboardMs:dashboard,quickAddVisibleMs:opening,automatedEntryMs:entry,median:{dashboard:median(dashboard),quickAddVisible:median(opening),automatedEntry:median(entry)},labVitals:vitals,fieldVitals:'Unmeasured; lab results do not establish field INP or a human entry-time median'},null,2)+'\n');
  expect(median(dashboard)).toBeLessThan(2000);expect(median(opening)).toBeLessThan(300);expect(median(entry)).toBeLessThan(5000);
  await cdp.detach();
});

test('dismissed transaction draft survives seamless locale change',async({page,context,api})=>{
  await api.put('/api/preferences',{data:{theme:'light',locale:'en'}});
  await page.setViewportSize({width:390,height:844});await page.goto('/transactions');await ready(page);
  await page.getByRole('button',{name:'New transaction',exact:true}).click();
  await page.getByRole('dialog').locator('#amount').fill('98765');
  await page.getByRole('dialog').locator('#notes').fill('Draft · makan siang 🥗');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'More',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Bahasa Indonesia',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Transaksi baru',exact:true}).click();
  await expect(page.getByRole('dialog').locator('#amount')).toHaveValue('98765');
  await expect(page.getByRole('dialog').locator('#notes')).toHaveValue('Draft · makan siang 🥗');
});

test('pending quick-add options cannot leak across workspaces',async({page,context,api})=>{
  await api.put('/api/preferences',{data:{theme:'light',locale:'en'}});
  await page.setViewportSize({width:390,height:844});await page.goto('/dashboard');await ready(page);
  await chooseWorkspace(page,personal);
  let started=false,release!:()=>void;
  await page.route(`**/api/workspaces/${personal}/accounts`,async route=>{
    const response=await api.get(route.request().url(),{headers:route.request().headers()});started=true;
    await new Promise<void>(resolve=>release=resolve);
    await route.fulfill({status:response.status(),headers:response.headers(),body:await response.body()}).catch(()=>{});
  });
  await page.getByRole('button',{name:'Quick add',exact:true}).click();
  await expect.poll(()=>started).toBe(true);
  await page.keyboard.press('Escape');await chooseWorkspace(page,business);
  await page.getByRole('button',{name:'Quick add',exact:true}).click();
  await expect(page.locator('#quick-account')).toContainText('Main wallet');
  const businessAccount=await page.locator('#quick-account').inputValue();
  release();await page.waitForTimeout(200);
  await expect(page.locator('#quick-account')).toHaveValue(businessAccount);expect(businessAccount).not.toBe(account);
  await page.keyboard.press('Escape');
});

test('public landing and authentication screens reflow and pass accessibility checks',async({browser})=>{
  test.setTimeout(180_000);
  const context=await browser.newContext({reducedMotion:'reduce'});await context.addInitScript(()=>{try{localStorage.setItem('capybudget-theme','light');localStorage.setItem('capybudget-locale','en');}catch{}});const page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  for(const width of [320,820,1440]){
    await page.setViewportSize({width,height:800});
    for(const route of ['/','/login','/sign-up','/verify-email','/forgot-password','/reset-password','/two-factor','/unlock','/deletion-receipt']){
      await page.goto(route);await page.locator('main').waitFor();await noOverflow(page);
      if(route==='/two-factor'){const verify=page.getByRole('button',{name:'Verify',exact:true});await expect(verify).toBeEnabled();await verify.hover();}
      const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),route).toEqual([]);
    }
  }
  await page.goto('/login');await page.getByRole('button',{name:'Bahasa Indonesia',exact:true}).click();
  await page.getByRole('button',{name:/^Tema:/}).click();await expect(page.locator('html')).toHaveClass(/dark/);
  const primary=page.locator('button[type=submit]');await expect(primary).toBeEnabled();await primary.hover();
  const darkHover=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(darkHover.violations.map(v=>v.id)).toEqual([]);
  await noOverflow(page);await page.screenshot({path:join(artifacts,'login-1440-dark-id.png'),fullPage:true});
  expect(errors).toEqual([]);await context.close();
});

test('failed initial security check has an explicit recovery path',async({page,context,api})=>{
  await api.put('/api/preferences',{data:{theme:'light',locale:'en'}});
  await page.route('**/api/security/status',route=>route.abort('failed'));
  await page.goto('/dashboard');
  await expect(page.getByRole('button',{name:'Retry',exact:true})).toBeVisible();
  await expect(page.locator('main')).toHaveCount(0);
  await page.unroute('**/api/security/status');
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await ready(page);await expect(page.locator('#workspace-switcher')).not.toHaveValue('');
  await expect(page.locator('.hero')).toBeVisible();
});

test('quick-add refreshes cached wallets after a workspace mutation',async({page,context,api})=>{
  await api.put('/api/preferences',{data:{theme:'light',locale:'en'}});
  await page.setViewportSize({width:390,height:844});await page.goto('/dashboard');await ready(page);await chooseWorkspace(page,personal);
  await page.getByRole('button',{name:'Quick add',exact:true}).click();await expect(page.locator('#quick-account')).toContainText('Main wallet');
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  const status=await page.evaluate(async id=>(await fetch(`/api/workspaces/${id}/accounts`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Newly created wallet',kind:'cash',openingBalance:'0'})})).status,personal);
  expect(status).toBe(201);
  await page.getByRole('button',{name:'Quick add',exact:true}).click();await expect(page.locator('#quick-account')).toContainText('Newly created wallet');
  await page.keyboard.press('Escape');
});


test('text enlargement, zoom-equivalent reflow and open-sheet resize',async({page,api})=>{
  await api.put('/api/preferences',{data:{theme:'light',locale:'en'}});
  for(const width of [320,820]){
    await page.setViewportSize({width,height:900});
    for(const path of ['/dashboard','/transactions','/reports','/settings/appearance']){
      await page.goto(path);await ready(page);
      // Simulate 200% text enlargement without compounding inherited values.
      await page.evaluate(()=>{const sizes=[...document.querySelectorAll<HTMLElement>('body *')].filter(el=>!el.closest('svg')).map(el=>({el,size:parseFloat(getComputedStyle(el).fontSize)}));for(const {el,size} of sizes)el.style.fontSize=size*2+'px';});
      await noOverflow(page);
    }
  }
  await page.goto('/reports');await ready(page);
  await page.getByRole('button',{name:'Quick add',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  for(const size of [{width:390,height:844},{width:844,height:390},{width:1440,height:900}]){
    await page.setViewportSize(size);await noOverflow(page);
    const save=dialog.getByRole('button',{name:'Save',exact:true});await save.scrollIntoViewIfNeeded();await expect(save).toBeInViewport();
  }
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await noOverflow(page);
});


test('session read bursts remain available without spending credential budgets',async({api})=>{
  for(let attempt=0;attempt<120;attempt++){
    const session=await checked(await api.get('/api/auth/get-session'));
    expect(session.user.id).toBe(userId);
  }
});
