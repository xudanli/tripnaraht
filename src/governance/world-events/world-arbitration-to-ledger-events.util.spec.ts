import { worldArbitrationToGovernanceLedgerEvents } from './world-arbitration-to-ledger-events.util';
import { OperationalSeverity } from '../../world/contracts/operational-severity.contract';

describe('worldArbitrationToGovernanceLedgerEvents', () => {
  it('emits official_warning_issued when SafeTravel appears in arbitration', () => {
    const evs = worldArbitrationToGovernanceLedgerEvents({
      tripId: 't1',
      operationalWorldState: {
        operationalRisk: 'high',
        blockingFactors: [],
        warnings: [],
        recommendedPolicies: [],
        confidence: 0.5,
      },
      operationalArbitration: {
        executionStatus: 'blocked',
        blockingReasons: ['safetravel_gate:BLOCK'],
        recommendedActions: [],
        enforcedPolicies: [],
        confidence: 0.5,
        rawSeverity: OperationalSeverity.BLOCKED,
      },
    });
    expect(evs.some((e) => e.eventType === 'official_warning_issued')).toBe(true);
    expect(evs[0].correlationId).toBeTruthy();
    expect(evs.every((e) => e.causalityChainId === evs[0].causalityChainId)).toBe(true);
  });
});
