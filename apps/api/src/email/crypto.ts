import {encryptField,decryptField} from '../security/encryption';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import type { EmailMessage, EncryptedEmailJob } from './types';

function encryptionKey(): Buffer {
  const encoded = process.env.EMAIL_JOB_ENCRYPTION_KEY;
  if (!encoded) throw new Error('EMAIL_JOB_ENCRYPTION_KEY is required');

  const key = Buffer.from(encoded, 'base64');
  if (key.byteLength !== 32) throw new Error('EMAIL_JOB_ENCRYPTION_KEY must encode exactly 32 bytes');
  return key;
}

export function encryptEmailMessage(message: EmailMessage): EncryptedEmailJob {
  const owner=message.securityOwnerId??'identity-mail',entity=randomUUID();
  const encoded=encryptField(JSON.stringify(message),{purpose:'email-job',owner,entity,field:'payload:'+message.expiresAt});
  const envelope=JSON.parse(Buffer.from(encoded.slice(6),'base64url').toString());
  return {version:2,keyId:envelope.keyId,owner,entity,iv:envelope.nonce,tag:envelope.tag,ciphertext:envelope.ciphertext,expiresAt:message.expiresAt};
}

export function decryptEmailMessage(job: EncryptedEmailJob, allowExpired = false): EmailMessage {
  if (![1,2].includes(job.version) || (!allowExpired && job.expiresAt <= Date.now())) throw new Error('Expired or unsupported email job');

  if(job.version===2){
    if(!job.keyId||!job.owner||!job.entity)throw new Error('Invalid email job metadata.');
    const encoded='cbenc:'+Buffer.from(JSON.stringify({version:2,keyId:job.keyId,algorithm:'AES-256-GCM',nonce:job.iv,tag:job.tag,ciphertext:job.ciphertext})).toString('base64url');
    const message=JSON.parse(decryptField(encoded,{purpose:'email-job',owner:job.owner,entity:job.entity,field:'payload:'+job.expiresAt})) as EmailMessage;
    if(!message.to||message.expiresAt!==job.expiresAt)throw new Error('Invalid email job payload.');return message;
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(job.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(job.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(job.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
  const message = JSON.parse(plaintext) as EmailMessage;

  if (!message.to || message.expiresAt !== job.expiresAt) throw new Error('Invalid email job payload');
  return message;
}
