import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EmailMessage, EncryptedEmailJob } from './types';

function encryptionKey(): Buffer {
  const encoded = process.env.EMAIL_JOB_ENCRYPTION_KEY;
  if (!encoded) throw new Error('EMAIL_JOB_ENCRYPTION_KEY is required');

  const key = Buffer.from(encoded, 'base64');
  if (key.byteLength !== 32) throw new Error('EMAIL_JOB_ENCRYPTION_KEY must encode exactly 32 bytes');
  return key;
}

export function encryptEmailMessage(message: EmailMessage): EncryptedEmailJob {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(message), 'utf8'),
    cipher.final()
  ]);

  return {
    version: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    expiresAt: message.expiresAt
  };
}

export function decryptEmailMessage(job: EncryptedEmailJob, allowExpired = false): EmailMessage {
  if (job.version !== 1 || (!allowExpired && job.expiresAt <= Date.now())) throw new Error('Expired or unsupported email job');

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
