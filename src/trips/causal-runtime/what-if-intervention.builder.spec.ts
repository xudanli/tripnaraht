import type { RobustnessMetrics, WhatIfCandidate } from '../../planning-policy/services/robustness-evaluator.service';
import {
  enrichWhatIfCandidateWithIntervention,
  enrichWhatIfReport,
  formatInterventionSummaryForTrustSurface,
  parsePlanBInterventionPayload,
  serializePlanBInterventionPayload,
  buildPlanBInterventionPayload,
} from './what-if-intervention.builder';

describe('what-if-intervention.builder', () => {
  const baseMetrics: RobustnessMetrics = {
    samples: 100,
    onTimeProb: 0.62,
    expectedOvertimeMin: 12,
    overtimeP90Min: 28,
    hpEndMean: 0.4,
    hpEndP10: 0.25,
    costMean: 100,
    costP90: 130,
    riskLevel: 'MEDIUM',
    diagnostics: {
      avgTransitDeltaMin: 5,
      avgQueueDeltaMin: 2,
      avgVisitDeltaMin: 3,
      avgWindowWaitDeltaMin: 4,
    },
    timeWindowMissProb: 0.42,
    perPoiMissProb: [],
    windowWaitProb: 0.15,
    perPoiWaitProb: [],
    completedPoiMean: 4,
    completedPoiP10: 3,
    completionRateMean: 0.88,
    completionRateP10: 0.75,
    perPoiEntrySlack: [],
  };

  const candidateMetrics: RobustnessMetrics = {
    ...baseMetrics,
    timeWindowMissProb: 0.28,
    onTimeProb: 0.78,
  };

  it('enriches candidate with intervention and causal projection', () => {
    const candidate: WhatIfCandidate = {
      id: 'SHIFT:glacier:50',
      title: '提前 50 分钟',
      description: 'test',
      schedule: { stops: [] } as any,
      metrics: candidateMetrics,
      action: { type: 'SHIFT_EARLIER', poiId: 'glacier', minutes: 50 },
      deltaSummary: { missDelta: -0.14, onTimeDelta: 0.16 },
      confidence: { level: 'HIGH', reason: '显著改善' },
    };

    const enriched = enrichWhatIfCandidateWithIntervention(candidate, { baseMetrics });
    expect(enriched.intervention?.type).toBe('SHIFT_TIME');
    expect(enriched.causalProjection?.causalChain.length).toBeGreaterThan(2);
    expect(enriched.intervention?.expectedEffects[0]?.metric).toBe('on_time_probability');
  });

  it('enriches report with recommendedIntervention', () => {
    const report = enrichWhatIfReport({
      base: {
        id: 'BASE',
        title: '原计划',
        description: 'base',
        schedule: { stops: [] } as any,
        metrics: baseMetrics,
      },
      candidates: [
        {
          id: 'SHIFT:g:50',
          title: '提前',
          description: 'd',
          schedule: { stops: [] } as any,
          metrics: candidateMetrics,
          action: { type: 'SHIFT_EARLIER', poiId: 'g', minutes: 50 },
          deltaSummary: { missDelta: -0.14 },
        },
      ],
      winnerId: 'SHIFT:g:50',
      meta: { baseSamples: 300, candidateSamples: 300, confirmSamples: 600, baseSeed: 42 },
    });

    expect(report.recommendedIntervention?.type).toBe('SHIFT_TIME');
    expect(report.causalHypothesis?.baseMissProb).toBe(0.42);
    expect(report.causalHypothesis?.projectedMissProb).toBe(0.28);
  });

  it('round-trips Plan B intervention payload', () => {
    const candidate = enrichWhatIfCandidateWithIntervention(
      {
        id: 'SHIFT:g:50',
        title: '提前',
        description: 'd',
        schedule: { stops: [] } as any,
        metrics: candidateMetrics,
        action: { type: 'SHIFT_EARLIER', poiId: 'g', minutes: 50 },
        deltaSummary: { missDelta: -0.14 },
      },
      { baseMetrics },
    );
    const payload = buildPlanBInterventionPayload(candidate);
    expect(payload).not.toBeNull();
    const json = serializePlanBInterventionPayload(payload!);
    const parsed = parsePlanBInterventionPayload(json);
    expect(parsed?.intervention.interventionId).toBe('SHIFT:g:50');
    expect(formatInterventionSummaryForTrustSurface(parsed!.intervention, parsed!.causalProjection)).toContain(
      '错过概率',
    );
  });
});
