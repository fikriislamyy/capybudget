import {encryptField,decryptField} from '../security/encryption';
import { createHash, createDecipheriv } from 'node:crypto';

function key(): Buffer {
  const encoded=process.env.EMAIL_JOB_ENCRYPTION_KEY;
  if(!encoded)throw new Error('EMAIL_JOB_ENCRYPTION_KEY is required to protect push subscription keys');
  const decoded=Buffer.from(encoded,'base64');
  if(decoded.byteLength!==32)throw new Error('EMAIL_JOB_ENCRYPTION_KEY must encode exactly 32 bytes');
  return decoded;
}

type PushScope={workspaceId:string;userId:string;endpoint:string};
const scopedContext=(scope:PushScope)=>({purpose:'push-auth',owner:scope.userId,entity:createHash('sha256').update(scope.workspaceId+'\0'+scope.endpoint).digest('hex'),field:'auth'});
export function encryptPushAuth(value:string,scope?:PushScope):string {return scope?'push2:'+encryptField(value,scopedContext(scope)):encryptField(value,{purpose:'push-auth',owner:'notification-service',entity:'subscription',field:'auth'});}

export function decryptPushAuth(value:string,scope?:PushScope):string {
  if(value.startsWith('push2:')){if(!scope)throw new Error('Push credential scope is required.');return decryptField(value.slice(6),scopedContext(scope));}
  if(value.startsWith('cbenc:'))return decryptField(value,{purpose:'push-auth',owner:'notification-service',entity:'subscription',field:'auth'});
  const [iv,tag,ciphertext]=value.split('.');
  if(!iv||!tag||!ciphertext)throw new Error('Invalid encrypted push authentication key');
  const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'));
  decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext,'base64url')),decipher.final()]).toString('utf8');
}
