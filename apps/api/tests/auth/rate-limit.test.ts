import { expect, test } from 'bun:test';
import { buildRateLimitBuckets } from '../../src/auth/rate-limit';

test('session reads use a separate bounded budget', () => {
  const reads = buildRateLimitBuckets('/get-session', undefined, '127.0.0.1');
  expect(reads).toHaveLength(1);
  expect(reads[0].key).toStartWith('ip:session-read:');
  expect(reads[0].limit).toBe(1000);
  expect(reads[0].seconds).toBe(60);
});
test('signup retains its global, IP and email cooldown budgets', () => {
  const buckets = buildRateLimitBuckets('/sign-up/email', 'synthetic@example.test', '127.0.0.1');
  expect(buckets[0].key).toStartWith('ip:all:');
  expect(buckets[0].limit).toBe(100);
  expect(buckets.map(({limit,seconds})=>[limit,seconds])).toEqual([[100,60],[5,900],[3,900],[1,60]]);
});
test('password login retains its IP and email attempt limits', () => {
  const buckets = buildRateLimitBuckets('/sign-in/email', 'synthetic@example.test', '127.0.0.1');
  expect(buckets.map(({limit,seconds})=>[limit,seconds])).toEqual([[100,60],[20,900],[10,900]]);
});
