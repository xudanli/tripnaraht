import {
  buildFulfillmentInputFromReadinessFindings,
  runGate1FulfillmentCausalAnalysis,
} from './gate1-fulfillment-causal.engine';

describe('gate1-fulfillment-causal.engine', () => {
  it('returns null when no meaningful readiness pressure', () => {
    expect(
      runGate1FulfillmentCausalAnalysis({
        blockers: [{ status: 'LOW', dimension: 'DOCUMENT', title: 'ok' }],
        daysToDeparture: 45,
      }),
    ).toBeNull();
  });

  it('computes departure failure risk from blockers and lead time squeeze', () => {
    const out = runGate1FulfillmentCausalAnalysis(
      buildFulfillmentInputFromReadinessFindings(
        [
          {
            status: 'BLOCKER',
            dimension: 'SUPPLIER',
            title: '冰川团未确认',
            dueAt: new Date('2026-07-01T00:00:00Z'),
            responsibleParty: 'supplier',
          },
        ],
        { daysToDeparture: 5, supplierLeadTimeDays: 14 },
      ),
      new Date('2026-06-26T00:00:00Z'),
    );

    expect(out?.schema).toBe('tripnara/gate1-fulfillment-causal/v1');
    expect(out!.departureFailureRisk).toBeGreaterThan(0.4);
    expect(out!.causalChain).toContain('supplier:lead_time');
    expect(out!.recommendedIntervention?.type).toBe('ESCALATE_SUPPLIER');
    expect(out!.userFacingAssessment).toContain('阻断');
  });
});
