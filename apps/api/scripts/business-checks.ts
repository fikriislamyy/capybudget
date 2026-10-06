import {randomUUID} from 'node:crypto';
const configured=process.env.DATABASE_URL;
if(!configured)throw new Error('DATABASE_URL is required.');
const destination=new URL(configured);destination.pathname='/capybudget_business_v2_test';
const redis=new URL(process.env.BUSINESS_TEST_REDIS_URL??process.env.REDIS_URL??'redis://localhost:6379');if(!process.env.BUSINESS_TEST_REDIS_URL)redis.pathname='/15';
if(process.env.BUSINESS_MAILPIT==='1'){
 const endpoint=new URL(process.env.S3_ENDPOINT??'http://localhost:8333');if(!['localhost','127.0.0.1','object-storage'].includes(endpoint.hostname))throw new Error('Mailpit checks require local object storage.');
 process.env.SMTP_HOST='127.0.0.1';process.env.SMTP_PORT='1025';process.env.SMTP_SECURE='false';delete process.env.SMTP_USER;delete process.env.SMTP_PASSWORD;process.env.EMAIL_FROM='CapyBudget fixture <noreply@example.test>';
}
const child=Bun.spawn(['bun','test','tests/business'],{cwd:import.meta.dir+'/..',env:{...process.env,DATABASE_URL:destination.toString(),BUSINESS_INTEGRATION:'1',REDIS_URL:redis.toString(),BETTER_AUTH_SECRET:randomUUID()+randomUUID(),DATABASE_POOL_MAX:'2'},stdin:'inherit',stdout:'inherit',stderr:'inherit'});
process.exit(await child.exited);
