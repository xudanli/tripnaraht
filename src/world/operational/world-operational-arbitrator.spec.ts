import { WorldOperationalArbitrator } from './world-operational-arbitrator';
import {
  OperationalSeverity,
  operationalSlice,
  OPERATIONAL_SLICE_TTL_SECONDS,
  computeFreshness,
} from '../contracts/operational-severity.contract';

describe('WorldOperationalArbitrator', () => {
  const arb = new WorldOperationalArbitrator();

  const baseOws = {
    operationalRisk: 'low' as const,
    blockingFactors: [] as string[],
    warnings: [] as string[],
    recommendedPolicies: [] as string[],
    confidence: 0.85,
  };

  it('maps BLOCKED slice to execution blocked', () => {
    const slice = operationalSlice(
      'iceland.safetravel.advisories',
      OperationalSeverity.BLOCKED,
      { gate_recommendation: 'BLOCK' },
      OPERATIONAL_SLICE_TTL_SECONDS.safetravel,
    );
    const r = arb.arbitrate({
      operationalWorldState: baseOws,
      operationalSlices: [slice],
    });
    expect(r.executionStatus).toBe('blocked');
    expect(r.rawSeverity).toBe(OperationalSeverity.BLOCKED);
  });

  it('blocks 2WD on F-road regardless of slice severity', () => {
    const r = arb.arbitrate({
      operationalWorldState: baseOws,
      operationalSlices: [],
      route: { includesFRoad: true },
      vehiclePolicy: { drivetrain: '2WD' },
    });
    expect(r.executionStatus).toBe('blocked');
    expect(r.blockingReasons.some((b) => b.includes('2wd'))).toBe(true);
  });

  it('downgrades confidence when slice is expired', () => {
    const generatedAt = Date.now() - 2 * 60 * 60 * 1000;
    const slice = {
      type: 'iceland.safetravel.advisories',
      severity: OperationalSeverity.INFO,
      structured: { gate_recommendation: 'ALLOW' },
      generatedAt,
      ttlSeconds: OPERATIONAL_SLICE_TTL_SECONDS.safetravel,
      freshness: computeFreshness(generatedAt, OPERATIONAL_SLICE_TTL_SECONDS.safetravel),
    };
    expect(slice.freshness).toBe('expired');
    const r = arb.arbitrate({ operationalWorldState: baseOws, operationalSlices: [slice as any] });
    expect(r.confidence).toBeLessThan(baseOws.confidence);
  });
});
