import {
  buildCausalContextCacheKey,
  isHighRiskContextPhase,
  sweepMemoryCacheByTripVersionPrefix,
} from './context-cache-causal.util';
import type { ContextPackageOptions } from '../types/context-package.types';

describe('context-cache-causal.util', () => {
  const base: ContextPackageOptions = {
    tripId: 'trip-abc',
    phase: 'GATE_EVAL',
    agent: 'Gatekeeper',
    userQuery: '冰岛行程',
    dsoVersion: 10,
    requestId: 'req-a',
    targetDayIndex: 2,
  };

  it('buildCausalContextCacheKey encodes version, request and day', () => {
    const k10 = buildCausalContextCacheKey(base);
    const k11 = buildCausalContextCacheKey({ ...base, dsoVersion: 11, requestId: 'req-b' });
    expect(k10).toContain('trip:trip-abc');
    expect(k10).toContain('ver:10');
    expect(k10).toContain('req:req-a');
    expect(k10).toContain('day:2');
    expect(k10).not.toEqual(k11);
    expect(k11).toContain('ver:11');
    expect(k11).toContain('req:req-b');
  });

  it('isHighRiskContextPhase flags plan-changing steps', () => {
    expect(isHighRiskContextPhase('STATE_UPDATE')).toBe(true);
    expect(isHighRiskContextPhase('PLAN_GEN')).toBe(true);
    expect(isHighRiskContextPhase('NARRATE')).toBe(false);
  });

  it('sweepMemoryCacheByTripVersionPrefix removes only superseded version keys', () => {
    const cache = new Map<string, { package: unknown; timestamp: number }>();
    cache.set('trip:t1:ver:9:req:x:phase:P:agent:A:q:1', { package: {}, timestamp: 1 });
    cache.set('trip:t1:ver:10:req:y:phase:P:agent:A:q:2', { package: {}, timestamp: 2 });
    const n = sweepMemoryCacheByTripVersionPrefix(cache, 't1', 9);
    expect(n).toBe(1);
    expect(cache.has('trip:t1:ver:10:req:y:phase:P:agent:A:q:2')).toBe(true);
  });
});
