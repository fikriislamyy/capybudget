import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { TRACKING_QUEUE } from './queue';
import { processRecurringWorkspace } from './routes';

const worker=new Worker<{workspaceId:string;ownerUserId:string}>(TRACKING_QUEUE,async(job)=>{
  if(job.name!=='workspace-scan')return;
  await processRecurringWorkspace(job.data.workspaceId,job.data.ownerUserId);
},{connection:new Redis(process.env.REDIS_URL??'redis://localhost:6379',{maxRetriesPerRequest:null}),concurrency:4,lockDuration:60_000});

worker.on('failed',(job)=>console.error('Recurring worker job failed',{workspaceId:job?.data.workspaceId,attempts:job?.attemptsMade??0}));
worker.on('error',()=>console.error('Recurring worker connection error'));
console.info('CapyBudget recurring worker is running');
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,async()=>{await worker.close();process.exit(0);});
