import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key(): Buffer {
  const encoded=process.env.EMAIL_JOB_ENCRYPTION_KEY;
  if(!encoded)throw new Error('EMAIL_JOB_ENCRYPTION_KEY is required to protect push subscription keys');
  const decoded=Buffer.from(encoded,'base64');
  if(decoded.byteLength!==32)throw new Error('EMAIL_JOB_ENCRYPTION_KEY must encode exactly 32 bytes');
  return decoded;
}

export function encryptPushAuth(value:string):string {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
  const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}

export function decryptPushAuth(value:string):string {
  const [iv,tag,ciphertext]=value.split('.');
  if(!iv||!tag||!ciphertext)throw new Error('Invalid encrypted push authentication key');
  const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'));
  decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext,'base64url')),decipher.final()]).toString('utf8');
}
