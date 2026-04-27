import {
  buildDecisionFeedbackCorrelationId,
  computePredictiveFailureStateHash,
  computeRepairInterventionStateHash,
  digestPlanDraftForCorrelation,
  digestSimulatedRepairTracesForCorrelation,
  digestTripPlanRequestLight,
  isUserRepairResolutionLabel,
} from './decision-feedback-correlation.util';

describe('decision-feedback-correlation.util', () => {
  it('buildDecisionFeedbackCorrelationId is stable for same params', () => {
    const a = buildDecisionFeedbackCorrelationId({
      sessionId: 'sess-1',
      phase: 'REPAIR',
      kind: 'REPAIR_ESCALATION',
      roundIndex: 3,
      stateHash: 'abc123',
    });
    const b = buildDecisionFeedbackCorrelationId({
      sessionId: 'sess-1',
      phase: 'REPAIR',
      kind: 'REPAIR_ESCALATION',
      roundIndex: 3,
      stateHash: 'abc123',
    });
    expect(a).toBe(b);
    expect(a.length).toBe(40);
  });

  it('buildDecisionFeedbackCorrelationId differs on phase/kind/round/stateHash', () => {
    const base = {
      sessionId: 'sess-1',
      roundIndex: 3,
      stateHash: 'h1',
    } as const;
    const repair = buildDecisionFeedbackCorrelationId({ ...base, phase: 'REPAIR', kind: 'REPAIR_ESCALATION' });
    const pred = buildDecisionFeedbackCorrelationId({ ...base, phase: 'INTAKE', kind: 'PREDICTIVE_FAILURE' });
    expect(repair).not.toBe(pred);

    const r4 = buildDecisionFeedbackCorrelationId({ ...base, phase: 'REPAIR', kind: 'REPAIR_ESCALATION', roundIndex: 4 });
    expect(repair).not.toBe(r4);

    const h2 = buildDecisionFeedbackCorrelationId({
      ...base,
      phase: 'REPAIR',
      kind: 'REPAIR_ESCALATION',
      stateHash: 'h2',
    });
    expect(repair).not.toBe(h2);
  });

  it('PREDICTIVE vs REPAIR same session round 0 vs 1 do not collide', () => {
    const sh = 'samehash16chars00';
    const p = buildDecisionFeedbackCorrelationId({
      sessionId: 'trip-1',
      phase: 'INTAKE',
      kind: 'PREDICTIVE_FAILURE',
      roundIndex: 0,
      stateHash: sh,
    });
    const r = buildDecisionFeedbackCorrelationId({
      sessionId: 'trip-1',
      phase: 'REPAIR',
      kind: 'REPAIR_ESCALATION',
      roundIndex: 1,
      stateHash: sh,
    });
    expect(p).not.toBe(r);
  });

  it('computeRepairInterventionStateHash is stable', () => {
    expect(
      computeRepairInterventionStateHash({
        dsoVersion: 7,
        escalationReason: 'UTILITY_COMPENSATION_THRESHOLD',
        utilityDeltaSum: -40.333333,
        planDigest: 'deadbeef',
      }),
    ).toBe(
      computeRepairInterventionStateHash({
        dsoVersion: 7,
        escalationReason: 'UTILITY_COMPENSATION_THRESHOLD',
        utilityDeltaSum: -40.333333,
        planDigest: 'deadbeef',
      }),
    );
  });

  it('computePredictiveFailureStateHash is stable', () => {
    const h = computePredictiveFailureStateHash({
      dsoVersion: 2,
      simulatedTracesDigest: 'simdig',
      tripDigest: 'tripdig',
    });
    expect(h).toBe(
      computePredictiveFailureStateHash({
        dsoVersion: 2,
        simulatedTracesDigest: 'simdig',
        tripDigest: 'tripdig',
      }),
    );
  });

  it('digestPlanDraftForCorrelation summarizes days', () => {
    const d = digestPlanDraftForCorrelation({
      request_id: 'r1',
      days: [{ date: '2026-07-01', items: [{ id: 'a' }, { id: 'b' }] }],
    });
    expect(d.length).toBe(16);
    const d2 = digestPlanDraftForCorrelation({
      request_id: 'r1',
      days: [{ date: '2026-07-01', items: [{ id: 'a' }, { id: 'b' }] }],
    });
    expect(d).toBe(d2);
  });

  it('digestSimulatedRepairTracesForCorrelation', () => {
    const d = digestSimulatedRepairTracesForCorrelation([
      {
        tacticId: 'T1',
        reason: 'X',
        metrics: { utility_delta: -12.4 },
        simulation: { kind: 'HISTORICAL_BOUNDARY', boundary_id: 'b1' },
      },
    ]);
    expect(d.length).toBe(16);
  });

  it('digestTripPlanRequestLight', () => {
    expect(
      digestTripPlanRequestLight({
        origin: 'A',
        destination: 'B',
        days: 5,
        must_include_poi_ids: ['z', 'a'],
        date_range: { start_date: '2026-01-01', end_date: '2026-01-05' },
      }),
    ).toBe(
      digestTripPlanRequestLight({
        origin: 'A',
        destination: 'B',
        days: 5,
        must_include_poi_ids: ['a', 'z'],
        date_range: { start_date: '2026-01-01', end_date: '2026-01-05' },
      }),
    );
  });

  it('isUserRepairResolutionLabel', () => {
    expect(isUserRepairResolutionLabel('ACCEPTED_AUTO_REPAIR')).toBe(true);
    expect(isUserRepairResolutionLabel('RELAXED_CONSTRAINTS')).toBe(true);
    expect(isUserRepairResolutionLabel('PROCEED_REGARDLESS')).toBe(true);
    expect(isUserRepairResolutionLabel('ABANDONED')).toBe(true);
    expect(isUserRepairResolutionLabel('NOPE')).toBe(false);
  });
});
