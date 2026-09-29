import { createHash } from 'node:crypto';

/** Stable hash binds a human confirmation to the exact server-generated preview. */
export function hashAssistantActionPayload(payload:unknown):string{
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function isValidActionPayloadHash(value:unknown):value is string{
  return typeof value==='string'&&/^[0-9a-f]{64}$/i.test(value);
}
