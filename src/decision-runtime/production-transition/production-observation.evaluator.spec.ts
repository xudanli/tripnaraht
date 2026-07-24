import { evaluateProductionObservation } from './production-observation.evaluator';

describe('evaluateProductionObservation', () => {
  it('marks incomplete when time window not met and production metrics missing', () => {
    const report = evaluateProductionObservation({
      elapsedDays: 5,
      requiredDays: 30,
      timePass: false,
      selectiveClosureAt: '2026-07-01T00:00:00.000Z',
    });

    expect(report.overallDisposition).toBe('INCOMPLETE');
    expect(report.timeWindow.timePass).toBe(false);
    expect(report.blockers.some((b) => b.startsWith('observation-time'))).toBe(true);
    expect(report.bypassEntryPoints.length).toBe(0);
  });

  it('fails on legacy pass canonical block divergence', () => {
    const report = evaluateProductionObservation(
      {
        elapsedDays: 30,
        requiredDays: 30,
        timePass: true,
        selectiveClosureAt: '2026-06-01T00:00:00.000Z',
      },
      {
        constraintShadowMetrics: {
          comparedTotal: 10,
          divergedTotal: 1,
          byDivergenceKind: { LEGACY_PASS_CANONICAL_BLOCK: 2 },
        },
      },
    );

    expect(report.overallDisposition).toBe('FAIL');
    expect(report.blockers).toContain('constraint.legacy-pass-canonical-block');
  });

  it('passes executor lint gate when architecture lint is clean', () => {
    const report = evaluateProductionObservation(
      {
        elapsedDays: 5,
        requiredDays: 30,
        timePass: false,
        selectiveClosureAt: '2026-07-01T00:00:00.000Z',
      },
      { effectivePlanWriteGuard: true },
      {
        architectureLint: { pass: true, executorBypassCount: 0, legacyBooleanCallerCount: 0 },
      },
    );

    const executorMetrics = report.metrics.filter((m) => m.category === 'executor');
    expect(executorMetrics.find((m) => m.metricId === 'executor.non-executor-effective-write')?.disposition).toBe(
      'PASS',
    );
    expect(executorMetrics.find((m) => m.metricId === 'executor.shadow-effective-write')?.disposition).toBe(
      'PASS_WITH_CONDITIONS',
    );
  });

  it('evaluates overlay zero-tolerance metrics', () => {
    const report = evaluateProductionObservation(
      {
        elapsedDays: 30,
        requiredDays: 30,
        timePass: true,
        selectiveClosureAt: '2026-06-01T00:00:00.000Z',
      },
      {
        constraintShadowMetrics: {
          comparedTotal: 1,
          divergedTotal: 0,
          byDivergenceKind: {},
        },
      },
      {
        architectureLint: { pass: true, executorBypassCount: 0, legacyBooleanCallerCount: 0 },
        metricsOverlay: {
          authorization: { unauthorizedExecuteCount: 0, expiredStillExecutedCount: 0 },
          executor: { duplicateExecuteCount: 0, shadowEffectiveWriteCount: 0 },
          monitoring: { duplicateDecisionRunCount: 0 },
          latency: { p95GrowthPct: 5, gatewayErrorRatePct: 0.2 },
          constraint: { blockWinnerCount: 0 },
        },
      },
    );

    expect(report.categories.authorization.disposition).toBe('PASS');
    expect(report.categories.latency.disposition).toBe('PASS_WITH_CONDITIONS');
  });
});
