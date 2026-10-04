import { Worker } from 'bullmq';
import Redis from 'ioredis';
import {refreshCaptureMaintenance,dispatchCaptureJobs,processStatement,processReceipt,cleanCaptureFiles} from './v2/worker';
import { TRACKING_QUEUE } from './queue';
import { processRecurringWorkspace } from './routes';

const worker=new Worker<{workspaceId:string;ownerUserId:string;id:string}>(TRACKING_QUEUE,async(job)=>{
  if(job.name==='statement-parse')return processStatement(job.data.workspaceId,job.data.ownerUserId,job.data.id);
  if(job.name==='receipt-ocr')return processReceipt(job.data.workspaceId,job.data.ownerUserId,job.data.id);
  if(job.name!=='workspace-scan')return;
  await processRecurringWorkspace(job.data.workspaceId,job.data.ownerUserId);
  await cleanCaptureFiles(job.data.workspaceId,job.data.ownerUserId);
},{connection:new Redis(process.env.REDIS_URL??'redis://localhost:6379',{maxRetriesPerRequest:null}),concurrency:2,lockDuration:60_000});

worker.on('failed',(job)=>console.error('Recurring worker job failed',{workspaceId:job?.data.workspaceId,attempts:job?.attemptsMade??0}));
worker.on('error',()=>console.error('Recurring worker connection error'));
let scanning=false;
async function scanCapture(){if(scanning)return;scanning=true;try{await dispatchCaptureJobs();await refreshCaptureMaintenance();}catch{console.error('Capture dispatcher unavailable; retrying shortly.');}finally{scanning=false;}}
const captureTimer=setInterval(()=>void scanCapture(),5000);void scanCapture();
console.info('CapyBudget tracking worker is running (recurrence, statements, receipt OCR)');
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,async()=>{clearInterval(captureTimer);await worker.close();process.exit(0);});
