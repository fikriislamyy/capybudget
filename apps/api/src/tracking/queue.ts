import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const TRACKING_QUEUE='capybudget-tracking';
const redisUrl=process.env.REDIS_URL??'redis://localhost:6379';
let queue:Queue|undefined;
function getQueue(){return queue??=new Queue(TRACKING_QUEUE,{connection:new Redis(redisUrl,{maxRetriesPerRequest:null})});}

export async function scheduleRecurringWorkspace(workspaceId:string,ownerUserId:string){
  await getQueue().upsertJobScheduler(`recurring:${workspaceId}`,{every:60_000},{name:'workspace-scan',data:{workspaceId,ownerUserId}});
}
