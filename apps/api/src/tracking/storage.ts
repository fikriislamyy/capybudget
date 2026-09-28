import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export const attachmentBucket=process.env.S3_BUCKET??'capybudget';
const s3=new S3Client({
  endpoint:process.env.S3_ENDPOINT??'http://localhost:8333',
  region:process.env.S3_REGION??'us-east-1',
  forcePathStyle:true,
  credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID??'minioadmin',secretAccessKey:process.env.S3_SECRET_ACCESS_KEY??'minioadmin'}
});

let bucketReady:Promise<void>|undefined;
async function ensureBucket(){
  if(!bucketReady)bucketReady=s3.send(new CreateBucketCommand({Bucket:attachmentBucket})).then(()=>{}).catch((error:any)=>{
    if(error.name==='BucketAlreadyOwnedByYou'||error.name==='BucketAlreadyExists')return;
    bucketReady=undefined;throw error;
  });
  await bucketReady;
}
export async function putAttachment(key:string,bytes:Uint8Array,type:string){await ensureBucket();await s3.send(new PutObjectCommand({Bucket:attachmentBucket,Key:key,Body:bytes,ContentType:type}));}
export async function getAttachment(key:string){return s3.send(new GetObjectCommand({Bucket:attachmentBucket,Key:key}));}
export async function deleteAttachment(key:string){await s3.send(new DeleteObjectCommand({Bucket:attachmentBucket,Key:key}));}
