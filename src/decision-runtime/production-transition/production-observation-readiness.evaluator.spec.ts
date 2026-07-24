import { evaluateProductionObservationReadiness } from './production-observation-readiness.evaluator';
import { evaluateProductionObservation } from './production-observation.evaluator';

describe('evaluateProductionObservationReadiness', () => {
  const timeWindow = {
    requiredDays: 30,
    elapsedDays: 30,
    archivedDays: 30,
    timePass: true,
    observationStartedAt: '2026-06-01T00:00:00.000Z',
    selectiveClosureAt: '2026-06-01T00:00:00.000Z',
    selectiveClosureOverall: 'CANONICAL_SELECTIVE_READY',
    anchorSource: 'observation-baseline' as const,
  };

  it('requires volume and coverage — not calendar alone', () => {
    const report = evaluateProductionObservation(
      {
        elapsedDays: 30,
        requiredDays: 30,
        timePass: true,
        selectiveClosureAt: '2026-06-01T00:00:00.000Z',
        archivedDays: 30,
      },
      {
        constraintShadowMetrics: { comparedTotal: 1, divergedTotal: 0, byDivergenceKind: {} },
      },
      {
        architectureLint: { pass: true, executorBypassCount: 0, legacyBooleanCallerCount: 0 },
        metricsOverlay: {
          authorization: { unauthorizedExecuteCount: 0, expiredStillExecutedCount: 0 },
          executor: { duplicateExecuteCount: 0, shadowEffectiveWriteCount: 0 },
          monitoring: { duplicateDecisionRunCount: 0 },
          latency: { p95GrowthPct: 2, gatewayErrorRatePct: 0 },
          constraint: { blockWinnerCount: 0 },
          volume: {
            formalTriggerRequests: 10,
            canonicalShadowDispatches: 10,
            constraintComparisons: 5,
            authorizationEvaluations: 0,
            effectivePlanExecutions: 0,
            monitoringEvents: 0,
            coreScenariosCovered: 7,
            destinationPacksCovered: 1,
            fallbackDrillsCompleted: 1,
          },
        },
      },
    );

    const readiness = evaluateProductionObservationReadiness(
      report,
      timeWindow,
      report.metrics.length ? undefined : undefined,
      { legacyFallbackDrillPass: true },
    );

    const withVolume = evaluateProductionObservationReadiness(report, timeWindow, {
      formalTriggerRequests: 10,
      canonicalShadowDispatches: 10,
      constraintComparisons: 5,
      authorizationEvaluations: 0,
      effectivePlanExecutions: 0,
      monitoringEvents: 0,
      coreScenariosCovered: 7,
      destinationPacksCovered: 1,
      fallbackDrillsCompleted: 1,
    });

    expect(withVolume.observationDurationSatisfied).toBe(true);
    expect(withVolume.observationReady).toBe(false);
    expect(withVolume.volumeBlockers.length).toBeGreaterThan(0);
    expect(readiness.phase.decisionRuntimePhase).toBe('PRODUCTION_OBSERVATION');
  });

  it('passes dual gate when duration volume coverage and redlines satisfied', () => {
    const report = evaluateProductionObservation(
      {
        elapsedDays: 30,
        requiredDays: 30,
        timePass: true,
        selectiveClosureAt: '2026-06-01T00:00:00.000Z',
        archivedDays: 30,
      },
      {
        constraintShadowMetrics: { comparedTotal: 500, divergedTotal: 0, byDivergenceKind: {} },
      },
      {
        architectureLint: { pass: true, executorBypassCount: 0, legacyBooleanCallerCount: 0 },
        metricsOverlay: {
          authorization: { unauthorizedExecuteCount: 0, expiredStillExecutedCount: 0 },
          executor: { duplicateExecuteCount: 0, shadowEffectiveWriteCount: 0 },
          monitoring: { duplicateDecisionRunCount: 0 },
          latency: { p95GrowthPct: 2, gatewayErrorRatePct: 0 },
          constraint: { blockWinnerCount: 0 },
        },
      },
    );

    const readiness = evaluateProductionObservationReadiness(report, timeWindow, {
      formalTriggerRequests: 600,
      canonicalShadowDispatches: 600,
      constraintComparisons: 400,
      authorizationEvaluations: 150,
      effectivePlanExecutions: 80,
      monitoringEvents: 100,
      coreScenariosCovered: 7,
      destinationPacksCovered: 1,
      fallbackDrillsCompleted: 1,
    });

    expect(readiness.observationReady).toBe(true);
    expect(readiness.disposition).toBe('PASS');
  });
});
