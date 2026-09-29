import { describe, expect, test } from 'bun:test';
import { hashAssistantActionPayload, isValidActionPayloadHash } from '../../src/assistant/actions';

describe('assistant action preview binding',()=>{
  test('uses a stable SHA-256 hash over the exact preview facts',()=>{
    const payload={action:'contribute_to_goal',amount:'100.0000',goalId:'goal-1'};
    const first=hashAssistantActionPayload(payload);
    expect(first).toHaveLength(64);
    expect(hashAssistantActionPayload(payload)).toBe(first);
    expect(hashAssistantActionPayload({...payload,amount:'101.0000'})).not.toBe(first);
    expect(isValidActionPayloadHash(first)).toBe(true);
    expect(isValidActionPayloadHash('z'.repeat(64))).toBe(false);
    expect(isValidActionPayloadHash(null)).toBe(false);
  });
});
