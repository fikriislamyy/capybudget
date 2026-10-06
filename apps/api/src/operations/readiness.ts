import Redis from 'ioredis';
import nodemailer from 'nodemailer';
import {HeadBucketCommand} from '@aws-sdk/client-s3';
import {client} from '../db';
import {s3,attachmentBucket} from '../tracking/storage';
import {backupS3,backupBucket} from '../privacy/tombstones';
import {encryptField,decryptField} from '../security/encryption';

type Check={name:string;status:'passed'|'failed';message:string};
export async function infrastructureReadiness(){
 const check=async(name:string,run:()=>Promise<string>):Promise<Check>=>{
  try{return {name,status:'passed',message:await run()};}
  catch{return {name,status:'failed',message:'Not verified. Check this service’s connection, permissions, and configuration.'};}
 };
 const checks=await Promise.all([
  check('Database & migrations',async()=>{const [row]=await client`select to_regclass('business_accounting_entries') as accounting,to_regclass('business_accounting_refresh') as queue,to_regclass('business_invitations') as invitations`;if(!row.accounting||!row.queue||!row.invitations)throw new Error('Migration required');return 'Database reachable; required accounting tables exist.';}),
  check('Redis',async()=>{const redis=new Redis(process.env.REDIS_URL??'redis://localhost:6379',{lazyConnect:true,maxRetriesPerRequest:1,connectTimeout:3000,commandTimeout:3000,retryStrategy:()=>null});redis.on('error',()=>{});try{await redis.connect();if(await redis.ping()!=='PONG')throw new Error('Redis unavailable');return 'Redis reachable. This does not prove that separate workers are running.';}finally{redis.disconnect();}}),
  check('SMTP',async()=>{if(!process.env.SMTP_HOST||!process.env.EMAIL_FROM)throw new Error('SMTP not configured');const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT??1025),secure:process.env.SMTP_SECURE==='true',connectionTimeout:5000,greetingTimeout:5000,socketTimeout:5000,...(process.env.SMTP_USER?{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD??''}}:{})});try{await transporter.verify();return 'SMTP connection/authentication verified. No email was sent; sender acceptance and inbox delivery still require an explicit email check.';}finally{transporter.close();}}),
  check('File storage',async()=>{await s3.send(new HeadBucketCommand({Bucket:attachmentBucket}),{abortSignal:AbortSignal.timeout(5000)});return 'Application bucket reachable. Read/write/PDF round-trip still requires the storage check.';}),
  check('Backup storage',async()=>{await backupS3.send(new HeadBucketCommand({Bucket:backupBucket}),{abortSignal:AbortSignal.timeout(5000)});return 'Backup bucket reachable. This does not prove that a current backup can be restored.';}),
  check('Encryption keyring',async()=>{const context={purpose:'service-readiness',owner:'self',entity:'probe',field:'roundtrip'},value=encryptField('capybudget-readiness',context);if(decryptField(value,context)!=='capybudget-readiness')throw new Error('Encryption failed');return 'Active encryption key passed an in-memory round trip. Historical keys must remain available.';}),
  check('Public URLs',async()=>{for(const name of ['PUBLIC_APP_URL','WEB_ORIGIN','BETTER_AUTH_URL']){const url=new URL(process.env[name]??'http://localhost:5173');if(process.env.NODE_ENV==='production'&&url.protocol!=='https:')throw new Error('HTTPS required');if(url.username||url.password)throw new Error('Invalid URL');}if(new URL(process.env.WEB_ORIGIN??'http://localhost:5173').origin!==new URL(process.env.BETTER_AUTH_URL??'http://localhost:5173').origin)throw new Error('Origin mismatch');return 'Authentication origins have compatible settings. External DNS/TLS and callback reachability need a check from outside the VPS.';})
 ]);
 return {checkedAt:new Date().toISOString(),environment:process.env.NODE_ENV==='production'?'production':'local',checks,passed:checks.every(c=>c.status==='passed'),limits:'Read-only infrastructure preflight. It is not production acceptance, a backup restore, a payment simulation, or independent accounting sign-off.'};
}
