import { OperationalSeverity } from '../contracts/operational-severity.contract';
import { applyOperationalArbitrationToPolicies } from './apply-arbitration-to-resolved-policies.util';
import type { OperationalArbitration } from './world-operational-arbitrator';

describe('applyOperationalArbitrationToPolicies', () => {
  const base = {
    drivingPolicy: { pace: 'standard' },
    routePolicy: { allowFRoads: true, allowLongDistanceAutorouting: true },
    lodgingPolicy: {},
    riskPolicy: { operationalRisk: 'low' },
  };

  it('blocked halts automation and denies long legs', () => {
    const arb: OperationalArbitration = {
      executionStatus: 'blocked',
      blockingReasons: ['x'],
      recommendedActions: [],
      enforcedPolicies: [],
      confidence: 0.5,
      rawSeverity: OperationalSeverity.BLOCKED,
    };
    const out = applyOperationalArbitrationToPolicies(arb, base);
    expect(out.executionPolicyHook.haltAutomatedExecution).toBe(true);
    expect(out.executionPolicyHook.denyLongDistanceAutorouting).toBe(true);
    expect(out.executionPolicyHook.causedByPolicies).toContain('execution.blocking.unknown');
    expect(Object.isFrozen(out.executionPolicyHook)).toBe(true);
    expect(out.routePolicy.allowFRoads).toBe(false);
    expect(out.routePolicy.maxSingleLegDriveHours).toBeLessThanOrEqual(3);
  });

  it('dangerous forces 4WD hint and caps leg hours', () => {
    const arb: OperationalArbitration = {
      executionStatus: 'dangerous',
      blockingReasons: [],
      recommendedActions: [],
      enforcedPolicies: [],
      confidence: 0.7,
      rawSeverity: OperationalSeverity.DANGEROUS,
    };
    const out = applyOperationalArbitrationToPolicies(arb, base);
    expect(out.drivingPolicy.forcedMinimumVehicleClass).toMatch(/4WD/i);
    expect(out.routePolicy.maxSingleLegDriveHours).toBe(4);
  });
});
