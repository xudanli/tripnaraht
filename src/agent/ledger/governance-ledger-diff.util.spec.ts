import { diffGovernanceStates } from './governance-ledger-diff.util';

describe('diffGovernanceStates', () => {
  const t0 = 1_000;
  const t1 = 2_000;
  const t2 = 3_000;

  it('detects status escalation and new causal codes', () => {
    const events = [
      {
        id: 'a',
        tripId: 'trip1',
        timestamp: t0,
        eventLevel: 'L1_operational' as const,
        eventType: 'recovery_suggested' as const,
        correlationId: 'c1',
        causalityChainId: 'h1',
        executionDecision: { status: 'allow', reasonCodes: [], enforcedPolicies: {} },
        causedByPolicies: [],
        policyVersion: 'v1',
        affectedSubsystems: [],
      },
      {
        id: 'b',
        tripId: 'trip1',
        timestamp: t2,
        eventLevel: 'L1_operational' as const,
        eventType: 'execution_block' as const,
        correlationId: 'c2',
        causalityChainId: 'h2',
        executionDecision: { status: 'halt', reasonCodes: ['x'], enforcedPolicies: {} },
        causedByPolicies: ['weather.condition.elevated'],
        policyVersion: 'v1',
        affectedSubsystems: [],
      },
    ];
    const d = diffGovernanceStates(events, 'trip1', { baselineEndMs: t1, comparisonEndMs: t2 });
    expect(d.summaryLines.some((l) => /allow.*halt/i.test(l))).toBe(true);
    expect(d.narrativeHints.some((h) => /weather/i.test(h))).toBe(true);
  });
});
