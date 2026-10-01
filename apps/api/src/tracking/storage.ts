import {client} from '../db';
import {Readable} from 'node:stream';
import {encryptField,decryptField} from '../security/encryption';
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export const attachmentBucket=process.env.S3_BUCKET??'capybudget';
export const s3=new S3Client({
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
const objectContext=(key:string)=>({purpose:'private-object',owner:attachmentBucket,entity:key,field:'contents'});
async function activeObjectOwner(key:string){
 const parts=key.split('/');if(parts[0]==='privacy'){const [owner]=await client`select id from "user" where id=${parts[1]!} and account_status='active'`;return Boolean(owner);}
 const ws=['business','reports'].includes(parts[0]!)?parts[1]:parts[0];if(!ws||!/^[0-9a-f-]{36}$/i.test(ws))return true;
 const [owner]=await client`select w.id from workspaces w join "user" u on u.id=w.owner_user_id where w.id=${ws} and u.account_status='active'`;return Boolean(owner);
}
export async function putAttachment(key:string,bytes:Uint8Array,type:string){if(!await activeObjectOwner(key))throw new Error('Object owner is unavailable.');await ensureBucket();const encrypted=encryptField(Buffer.from(bytes).toString('base64'),objectContext(key));await s3.send(new PutObjectCommand({Bucket:attachmentBucket,Key:key,Body:encrypted,ContentType:'application/octet-stream',Metadata:{'capybudget-encryption':'1','original-content-type':type}}));if(!await activeObjectOwner(key)){try{await deleteAttachment(key);}catch{await client`insert into report_export_cleanup(object_key) values(${key}) on conflict do nothing`;}throw new Error('Object owner was quarantined during upload.');}}


export async function getAttachment(key:string){
 const object=await s3.send(new GetObjectCommand({Bucket:attachmentBucket,Key:key}));
 if(!object.Body)throw new Error('Private object body missing.');
 if(!object.Metadata?.['capybudget-encryption']){if(process.env.ALLOW_PLAINTEXT_OBJECTS==='1')return object;throw new Error('Private object requires encryption migration.');}
 if(object.Metadata['capybudget-encryption']!=='1')throw new Error('Unsupported private object encryption.');
 const encrypted=await object.Body.transformToString(),bytes=Buffer.from(decryptField(encrypted,objectContext(key)),'base64');
 const body=Object.assign(Readable.from(bytes),{transformToByteArray:async()=>new Uint8Array(bytes),transformToString:async(encoding:BufferEncoding='utf8')=>bytes.toString(encoding),transformToWebStream:()=>Readable.toWeb(Readable.from(bytes))});
 return {...object,Body:body as unknown as typeof object.Body,ContentType:object.Metadata['original-content-type'],ContentLength:bytes.length};
}

export async function deleteAttachment(key:string){await s3.send(new DeleteObjectCommand({Bucket:attachmentBucket,Key:key}));}
