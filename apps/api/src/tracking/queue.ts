import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const TRACKING_QUEUE='capybudget-tracking';
const redisUrl=process.env.REDIS_URL??'redis://localhost:6379';
let queue:Queue|undefined;
function getQueue(){return queue??=new Queue(TRACKING_QUEUE,{connection:new Redis(redisUrl,{maxRetriesPerRequest:null})});}

export async function scheduleRecurringWorkspace(workspaceId:string,ownerUserId:string){
  await getQueue().upsertJobScheduler(`recurring:${workspaceId}`,{every:60_000},{name:'workspace-scan',data:{workspaceId,ownerUserId}});
}

export async function scheduleTrackingTask(name:string,data:{workspaceId:string;ownerUserId:string;id:string}) {
  const jobId=`capture:${name}:${data.workspaceId}:${data.id}`.replace(/:/g,'-');
  const previous=await getQueue().getJob(jobId);
  if(previous&&['completed','failed'].includes(await previous.getState()))await previous.remove();
  return getQueue().add(name,data,{jobId,attempts:3,backoff:{type:'exponential',delay:5000},removeOnComplete:100,removeOnFail:100});
}
