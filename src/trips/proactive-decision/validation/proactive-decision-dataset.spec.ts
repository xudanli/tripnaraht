import {
  appendProactiveDecisionDatasetRecord,
  buildProactiveDecisionDatasetRecord,
  patchProactiveDecisionDatasetRecord,
  readProactiveDecisionDatasetLog,
  toProactiveDecisionDatasetReplayJson,
} from './build-proactive-decision-dataset.util';
import { computeProactiveValidationMetrics } from './compute-proactive-validation-metrics.util';
import { evaluateProactiveValidationCanary } from './evaluate-proactive-validation-canary.util';
import { buildProactiveImpactFromWeather } from '../adapters/build-proactive-impact.util';
import { planLensesForProactiveCase } from '../lenses/evaluate-lens-activation.util';
import { synthesizeProactiveRecommendation } from '../synthesis/synthesize-proactive-recommendation.util';
import { evaluateProactiveIntervention } from '../intervention/evaluate-proactive-intervention.util';
import { resolveProactiveCanaryConfig } from '../config/proactive-canary-config.util';

describe('Phase 5 — Decision Dataset + Validation Metrics', () => {
  function buildParts() {
    const impact = buildProactiveImpactFromWeather({
      tripId: 'trip_p5',
      signalEventId: 'evt_p5_wind',
      signalKind: 'WEATHER_WIND',
      weatherImpact: {
        affectedPlanItemIds: ['item_reynisfjara'],
        affectedEntityRefs: [
          { kind: 'PLAN_ITEM', id: 'item_reynisfjara', label: 'Reynisfjara' },
        ],
      },
      affectedItemLabels: ['Reynisfjara'],
    });
    const lens = planLensesForProactiveCase({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      signalKind: 'WEATHER_WIND',
      needAlternative: true,
    });
    const syn = synthesizeProactiveRecommendation({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      lens,
    });
    if (!syn.ok) throw new Error('syn');
    const intervention = evaluateProactiveIntervention({
      impact,
      synthesis: syn.synthesis,
      decisionProblemId: 'problem_p5',
      attentionCost: 0.05,
      threshold: 0.05,
    });
    return { impact, syn, intervention };
  }

  it('builds product-shaped dataset row and patches user outcome', () => {
    const { impact, syn, intervention } = buildParts();
    const record = buildProactiveDecisionDatasetRecord({
      tripId: 'trip_p5',
      impact,
      synthesis: syn.synthesis,
      intervention,
      decisionProblemId: 'problem_p5',
      canaryStage: 'SHADOW',
      userVisible: false,
      wouldNotify: true,
      qualityScore: 1,
    });

    expect(record.trigger).toBe('weather_change');
    expect(record.impact).toBe(true);
    expect(record.recommended).toBe(true);
    expect(record.user_visible ?? record.userVisible).toBe(false);
    expect(toProactiveDecisionDatasetReplayJson(record)).toMatchObject({
      trigger: 'weather_change',
      impact: true,
      recommended: true,
      user_visible: false,
      user_action: null,
    });

    let meta = appendProactiveDecisionDatasetRecord({}, record);
    meta = patchProactiveDecisionDatasetRecord(meta, {
      signalEventId: 'evt_p5_wind',
      userAction: 'CONFIRM',
      outcome: 'ACCEPTED',
      userVisible: true,
    });
    const log = readProactiveDecisionDatasetLog(meta)!;
    expect(log.records[0].userAction).toBe('CONFIRM');
    expect(log.records[0].outcome).toBe('ACCEPTED');
    expect(log.records[0].userVisible).toBe(true);
  });

  it('computes Useful / Accept / FP validation metrics', () => {
    const { impact, syn, intervention } = buildParts();
    const base = buildProactiveDecisionDatasetRecord({
      tripId: 'trip_p5',
      impact,
      synthesis: syn.synthesis,
      intervention,
      canaryStage: 'L1_PASSIVE',
      userVisible: true,
      wouldNotify: true,
    });

    const dataset = [
      {
        ...base,
        recordId: 'r1',
        userAction: 'CONFIRM' as const,
        outcome: 'ACCEPTED' as const,
      },
      {
        ...base,
        recordId: 'r2',
        signalEventId: 'evt_2',
        userAction: 'FEEDBACK_USEFUL' as const,
        outcome: 'USEFUL' as const,
      },
      {
        ...base,
        recordId: 'r3',
        signalEventId: 'evt_3',
        userAction: 'FEEDBACK_NOT_USEFUL' as const,
        outcome: 'NOT_USEFUL' as const,
      },
      {
        ...base,
        recordId: 'r4',
        signalEventId: 'evt_4',
        userAction: 'DEFER' as const,
        outcome: 'DEFERRED' as const,
      },
    ];

    const m = computeProactiveValidationMetrics({ dataset });
    expect(m.visibleShown).toBe(4);
    expect(m.usefulInterventionRate).toBe(0.5);
    expect(m.acceptRate).toBe(0.25);
    expect(m.falsePositiveRate).toBe(0.25);
    expect(m.impactPrecisionProxy).toBe(1);
    expect(m.regretReduction).toBeNull();
  });

  it('SHADOW canary report uses wouldNotify proxy but blocks L1 advance', () => {
    const { impact, syn, intervention } = buildParts();
    const base = buildProactiveDecisionDatasetRecord({
      tripId: 'trip_p5',
      impact,
      synthesis: syn.synthesis,
      intervention,
      canaryStage: 'SHADOW',
      userVisible: false,
      wouldNotify: true,
    });
    const metrics = computeProactiveValidationMetrics({
      dataset: Array.from({ length: 40 }, (_, i) => ({
        ...base,
        recordId: `r_${i}`,
        signalEventId: `evt_${i}`,
      })),
    });
    const report = evaluateProactiveValidationCanary({
      metrics,
      config: resolveProactiveCanaryConfig({
        PROACTIVE_DECISION_V1_ENABLED: '1',
        PROACTIVE_CANARY_STAGE: 'SHADOW',
      }),
    });
    expect(report.shownSource).toBe('wouldNotifyProxy');
    expect(report.shownForGate).toBe(40);
    expect(report.advance.mayAdvance).toBe(false);
    expect(report.advance.reasonsZh.join(' ')).toMatch(/impression|Useful/);
  });
});
