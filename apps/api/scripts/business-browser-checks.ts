import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {hashPassword} from 'better-auth/crypto';
// Isolated application/database, no worker processes and no real payments/emails.
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required.');
const database=new URL(process.env.DATABASE_URL);database.pathname='/capybudget_business_v2_test';process.env.DATABASE_URL=database.toString();
const redis=new URL(process.env.BUSINESS_TEST_REDIS_URL??process.env.REDIS_URL??'redis://localhost:6379');if(!process.env.BUSINESS_TEST_REDIS_URL)redis.pathname='/15';process.env.REDIS_URL=redis.toString();
process.env.DATABASE_POOL_MAX='2';process.env.BETTER_AUTH_SECRET=randomUUID()+randomUUID();process.env.NODE_ENV='test';process.env.WEB_ORIGIN='http://localhost:5189';process.env.PUBLIC_APP_URL=process.env.WEB_ORIGIN;process.env.BETTER_AUTH_URL=process.env.WEB_ORIGIN;process.env.API_INTERNAL_URL='http://localhost:3109';process.env.PUBLIC_API_URL=process.env.API_INTERNAL_URL;
const {client}=await import('../src/db');const {app}=await import('../src/app');app.listen(3109);
const web=Bun.spawn(['bun','run','dev','--port','5189','--strictPort'],{cwd:import.meta.dir+'/../../web',env:{...process.env,CAPY_VITE_CACHE_DIR:`/tmp/capybudget-business-browser-vite-${process.pid}`},stdout:'ignore',stderr:'inherit'});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try{
 const subjects=new Map<string,{id:string;cookies:{name:string;value:string;url:string}[]}>(),password='IsolatedBrowserFixture!42',hash=await hashPassword(password);
 for(const role of ['owner','staff','viewer']){
  const id='business-browser-'+randomUUID(),email=id+'@example.test';await client`insert into "user"(id,name,email,email_verified) values(${id},${role},${email},true)`;await client`insert into account(id,account_id,provider_id,user_id,password) values(${randomUUID()},${id},'credential',${id},${hash})`;
  const login=await app.handle(new Request(process.env.WEB_ORIGIN+'/api/auth/sign-in/email',{method:'POST',headers:{origin:process.env.WEB_ORIGIN,'content-type':'application/json'},body:JSON.stringify({email,password})}));if(!login.ok)throw new Error('Fixture login failed: '+login.status);
  const cookies=login.headers.getSetCookie().map(value=>{const [part]=value.split(';'),separator=part!.indexOf('=');return {name:part!.slice(0,separator),value:part!.slice(separator+1),url:process.env.WEB_ORIGIN!};});subjects.set(role,{id,cookies});
 }
 const owner=subjects.get('owner')!,cookie=owner.cookies.map(c=>c.name+'='+c.value).join('; ');
 const create=await app.handle(new Request(process.env.WEB_ORIGIN+'/api/workspaces',{method:'POST',headers:{cookie,origin:process.env.WEB_ORIGIN,'content-type':'application/json'},body:JSON.stringify({kind:'business',name:'Browser fixture',currency:'IDR',timezone:'Asia/Jakarta'})}));if(!create.ok)throw new Error('Fixture workspace creation failed.');const ws=(await create.json()).workspace.id;
 for(const [role,person] of subjects){if(role!=='owner')await client`insert into workspace_memberships(workspace_id,user_id,role) values(${ws},${person.id},${role})`;await client`insert into onboarding_state(user_id,usage_type,current_step,first_workspace_id,completed_at) values(${person.id},'both','done',${ws},now())`;}
 const draft=await app.handle(new Request(process.env.WEB_ORIGIN+'/api/workspaces/'+ws+'/invoices',{method:'POST',headers:{cookie,origin:process.env.WEB_ORIGIN,'content-type':'application/json'},body:JSON.stringify({lines:[{description:'Browser fixture',quantity:'1',unitPrice:'1000'}]})}));const invoice=(await draft.json()).invoice;
 let ready=false;for(let attempts=0;attempts<120;attempts++){try{const response=await fetch(process.env.WEB_ORIGIN);if(response.ok){ready=true;break;}}catch{}await Bun.sleep(250);}if(!ready)throw new Error('Isolated frontend did not start.');
 browser=await chromium.launch({headless:true});let checked=0;
 const routes=['/business/team','/business/audit','/business/contacts','/business/catalog','/business/recurring-invoices','/business/payables','/business/aging','/business/projects','/business/payments','/business/tax','/business/settings','/invoices','/invoices/new','/invoices/'+invoice.id];
 for(const size of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport:size,serviceWorkers:'block'});await context.addCookies(owner.cookies);await context.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:'capybudget-workspace:'+owner.id,value:ws});
  const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for(const route of routes){errors.length=0;const response=await page.goto(process.env.WEB_ORIGIN+route,{waitUntil:'domcontentloaded',timeout:45000});if(!response?.ok())throw new Error('Page failed '+route+': '+response?.status());await page.locator('h1').first().waitFor({timeout:15000});await page.waitForTimeout(1200);if(new URL(page.url()).pathname!==route)throw new Error('Unexpected redirect from '+route);if(errors.length)throw new Error(route+': '+errors.join('; '));const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);if(overflow)throw new Error('Horizontal page overflow: '+route+' at '+size.width);checked++;console.log('Browser check '+checked+': '+size.width+' '+route);}
  await context.close();
 }
 const viewer=subjects.get('viewer')!,context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});await context.addCookies(viewer.cookies);await context.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:'capybudget-workspace:'+viewer.id,value:ws});const page=await context.newPage();await page.goto(process.env.WEB_ORIGIN+'/invoices',{waitUntil:'domcontentloaded'});if(await page.locator('a[href="/invoices/new"]').count())throw new Error('Viewer sees invoice creation action.');await context.close();
 console.log('Passed '+checked+' desktop/mobile route checks and viewer action visibility. No real payment or email delivery was tested.');
}finally{await browser?.close();web.kill();await app.stop();await client.end();}

process.exit(0);
