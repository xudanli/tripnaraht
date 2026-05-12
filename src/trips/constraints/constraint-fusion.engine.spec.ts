import { fuseConstraints } from './constraint-fusion.engine';
import type { ConstraintDomainOutput } from './constraint-domain-output.types';

describe('fuseConstraints', () => {
  it('merges ROAD + WEATHER on same slot and flags multi-domain', () => {
    const inputs: ConstraintDomainOutput[] = [
      {
        domain: 'ROAD',
        severity: 'HIGH',
        affectedSlots: ['slot-1'],
        affectedPOIs: [],
        blocking: true,
        reasonCode: 'F208_CLOSED',
        confidence: 0.9,
      },
      {
        domain: 'WEATHER',
        severity: 'HIGH',
        affectedSlots: ['slot-1'],
        affectedPOIs: [],
        blocking: true,
        reasonCode: 'WIND',
        confidence: 0.85,
      },
    ];
    const fused = fuseConstraints(inputs);
    const s = fused.get('slot-1');
    expect(s?.isBlocked).toBe(true);
    expect([...(s?.blockingDomains ?? [])].sort()).toEqual(['ROAD', 'WEATHER']);
    expect(s?.severity).toBe('HIGH');
  });

  it('takes max severity across domains', () => {
    const fused = fuseConstraints([
      {
        domain: 'BOOKING',
        severity: 'LOW',
        affectedSlots: ['a'],
        affectedPOIs: [],
        blocking: false,
        reasonCode: 'x',
        confidence: 1,
      },
      {
        domain: 'FATIGUE',
        severity: 'HIGH',
        affectedSlots: ['a'],
        affectedPOIs: [],
        blocking: false,
        reasonCode: 'y',
        confidence: 1,
      },
    ]);
    expect(fused.get('a')?.severity).toBe('HIGH');
  });
});
