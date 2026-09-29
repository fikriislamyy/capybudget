import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const ASSISTANT_QUEUE='capybudget-assistant';
const redisUrl=process.env.REDIS_URL??'redis://localhost:6379';
let queue:Queue|undefined;
function getQueue(){return queue??=new Queue(ASSISTANT_QUEUE,{connection:new Redis(redisUrl,{maxRetriesPerRequest:null}),defaultJobOptions:{attempts:3,backoff:{type:'exponential',delay:5000},removeOnComplete:{age:86400,count:1000},removeOnFail:{age:7*86400,count:5000}}});}
export async function scheduleAssistantForecastRefresh(){await getQueue().upsertJobScheduler('assistant-refresh-sweep',{every:60_000},{name:'assistant-refresh-sweep',data:{}});}
export async function enqueueAssistantForecastRun(runId:string,workspaceId:string,userId:string){await getQueue().add('assistant-forecast-run',{runId,workspaceId,userId},{jobId:`forecast-${runId}`});}
