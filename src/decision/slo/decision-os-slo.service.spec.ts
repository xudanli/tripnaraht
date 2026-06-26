import { DecisionOsSloService } from './decision-os-slo.service';

describe('DecisionOsSloService', () => {
  let slo: DecisionOsSloService;

  beforeEach(() => {
    slo = new DecisionOsSloService();
    slo.reset();
  });

  it('records validation and computes pass rate', () => {
    slo.recordValidation({
      requestId: 'r1',
      runAt: new Date().toISOString(),
      durationMs: 10,
      stages: [],
      totalIssues: 0,
      hasFatal: false,
      hasConflict: false,
      confidenceDelta: 0,
      passed: true,
      outcome: 'SUCCESS',
    });
    slo.recordValidation({
      requestId: 'r2',
      runAt: new Date().toISOString(),
      durationMs: 20,
      stages: [],
      totalIssues: 1,
      hasFatal: false,
      hasConflict: true,
      confidenceDelta: -0.1,
      passed: false,
      outcome: 'PARTIAL',
    });

    const snap = slo.getSnapshot();
    expect(snap.validation.totalRuns).toBe(2);
    expect(snap.validation.passedRuns).toBe(1);
    expect(snap.validation.passRatePct).toBe(50);
  });

  it('records contingency blended success rate', () => {
    slo.recordContingency({
      tripId: 't1',
      pathId: 'KERNEL_REPLAN',
      reason: 'flight_cancelled',
      runAt: new Date().toISOString(),
      durationMs: 100,
      outcome: 'SUCCESS',
    });
    slo.recordContingency({
      tripId: 't2',
      pathId: 'KERNEL_REPLAN',
      reason: 'road_closed',
      runAt: new Date().toISOString(),
      durationMs: 200,
      outcome: 'FAILED',
      error: 'no dso',
    });

    const snap = slo.getSnapshot();
    expect(snap.contingency.totalRuns).toBe(2);
    expect(snap.contingency.successRuns).toBe(1);
    expect(snap.contingency.successRatePct).toBe(50);
    expect(snap.contingency.byPath.KERNEL_REPLAN?.runs).toBe(2);
  });
});
