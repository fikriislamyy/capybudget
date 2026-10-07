import { sweepAssistantSummaries } from './v2/summaries';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { processQueuedAssistantForecast, recoverQueuedAssistantForecasts, refreshStaleAssistantForecasts } from './routes';
import { ASSISTANT_QUEUE, scheduleAssistantForecastRefresh } from './queue';

const worker=new Worker(ASSISTANT_QUEUE,async(job)=>{
 if(job.name==='assistant-forecast-run')await processQueuedAssistantForecast(String(job.data.runId),String(job.data.workspaceId),String(job.data.userId));
 if(job.name==='assistant-refresh-sweep'){await recoverQueuedAssistantForecasts();await refreshStaleAssistantForecasts();await sweepAssistantSummaries();}
},{connection:new Redis(process.env.REDIS_URL??'redis://localhost:6379',{maxRetriesPerRequest:null}),concurrency:1,lockDuration:120_000});

worker.on('failed',()=>console.error('Assistant forecast refresh job failed'));
worker.on('error',()=>console.error('Assistant forecast worker connection error'));
worker.on('ready',()=>void scheduleAssistantForecastRefresh().catch(()=>console.error('Unable to schedule assistant forecast refresh')));
void scheduleAssistantForecastRefresh().catch(()=>console.error('Unable to schedule assistant forecast refresh'));
console.info('CapyBudget assistant worker is running');
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,async()=>{await worker.close();process.exit(0);});
