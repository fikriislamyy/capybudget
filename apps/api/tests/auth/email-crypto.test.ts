import { afterEach, describe, expect, test } from 'bun:test';
import { decryptEmailMessage, encryptEmailMessage } from '../../src/email/crypto';

const originalKey = process.env.EMAIL_JOB_ENCRYPTION_KEY;
const testKey = Buffer.alloc(32, 7).toString('base64');

afterEach(() => {
  if (originalKey === undefined) delete process.env.EMAIL_JOB_ENCRYPTION_KEY;
  else process.env.EMAIL_JOB_ENCRYPTION_KEY = originalKey;
});

describe('encrypted email jobs', () => {
  test('round trips verification codes without storing their plaintext', () => {
    process.env.EMAIL_JOB_ENCRYPTION_KEY = testKey;
    const message = {
      kind: 'verification' as const,
      to: 'person@example.com',
      otp: '804219',
      locale: 'en' as const,
      expiresAt: Date.now() + 60_000
    };
    const job = encryptEmailMessage(message);
    expect(job.ciphertext).not.toContain(message.otp);
    expect(decryptEmailMessage(job)).toEqual(message);
  });

  test('rejects modified ciphertext', () => {
    process.env.EMAIL_JOB_ENCRYPTION_KEY = testKey;
    const job = encryptEmailMessage({
      kind: 'password-reset', to: 'person@example.com', url: 'https://example.com/reset?token=secret',
      locale: 'en', expiresAt: Date.now() + 60_000
    });
    job.ciphertext = Buffer.alloc(Buffer.from(job.ciphertext, 'base64').length, 0).toString('base64');
    expect(() => decryptEmailMessage(job)).toThrow();
  });

  test('rejects expired jobs', () => {
    process.env.EMAIL_JOB_ENCRYPTION_KEY = testKey;
    const job = encryptEmailMessage({
      kind: 'verification', to: 'person@example.com', otp: '804219', locale: 'id', expiresAt: Date.now() + 60_000
    });
    job.expiresAt = Date.now() - 1;
    expect(() => decryptEmailMessage(job)).toThrow('Expired or unsupported email job');
  });
});
