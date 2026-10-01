import { describe, expect, test } from 'bun:test';
import { exceedsUnusualThreshold, medianUnits, unusualThreshold } from '../../src/notifications/math';

describe('unusual spending thresholds',()=>{
 test('rounds an even median and MAD down in integer units',()=>{
  expect(medianUnits([1n,2n])).toBe(1n);
  const stats=unusualThreshold([100n,100n,100n,100n,200n,200n,200n,200n],0n);
  expect(stats.median).toBe(150n);
  expect(stats.mad).toBe(50n);
  expect(stats.threshold).toBe(450n);
 });

 test('uses the configured minimum and requires an amount strictly above the threshold',()=>{
  const stats=unusualThreshold(Array.from({length:10},()=>10_000n),50_000n);
  expect(stats.median).toBe(10_000n);
  expect(stats.mad).toBe(0n);
  expect(stats.threshold).toBe(50_000n);
  expect(exceedsUnusualThreshold(50_000n,stats.threshold)).toBe(false);
  expect(exceedsUnusualThreshold(50_001n,stats.threshold)).toBe(true);
 });

 test('rejects an empty baseline instead of inventing a threshold',()=>{
  expect(()=>medianUnits([])).toThrow(RangeError);
 });
});
