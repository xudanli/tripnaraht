import type { TemporalQualityReportV1 } from '../temporal-shadow-validation/temporal-quality-report.util';
import type { ConfidenceCalibrationV1 } from '../temporal-shadow-validation/confidence-calibration.util';
import {
  judgeTemporalScenarioReadiness,
  TEMPORAL_SCENARIO_DEFS,
} from '../pilot/scenario-temporal-readiness.util';
import {
  createTemporalThresholdProposal,
  reviewTemporalThresholdProposal,
  computeMetricDistribution,
} from '../pilot/readiness-distribution.util';
import { decideTemporalVisibility } from './visibility-gate.util';
import {
  assertPresentationWithinPolicy,
  buildTemporalPresentationPolicy,
} from './temporal-presentation-policy.util';
import { admitTemporalVisibleSurface } from './user-visible-surface.util';
import {
  evaluateTemporalDecisionUtility,
  type TemporalUtilityEpisodeV1,
} from './temporal-decision-utility.util';
import {
  evaluateActionableLeadTime,
  type ActionableLeadTimeSampleV1,
} from './actionable-lead-time.util';
import {
  createInterventionCandidateShadow,
  evaluateInterventionQuality,
} from './intervention-candidate-shadow.util';
import { submitProactiveReadinessReview } from './proactive-readiness-review.util';
import type { TemporalImpactV1 } from '../temporal-graduation/temporal-impact.util';

describe('Temporal Decision Utility Validation', () => {
  function qualifyPace() {
    const proposal = reviewTemporalThresholdProposal(
      createTemporalThresholdProposal({
        scenarioId: 'pace_day_sequence',
        distributions: [
          computeMetricDistribution('OUTCOME_OBSERVABILITY', [0.7, 0.8]),
          computeMetricDistribution('OBSERVATION_DENSITY', [5, 10]),
          computeMetricDistribution('TEMPORAL_COVERAGE', [0.5, 0.75]),
          computeMetricDistribution('HIGH_QUALITY_EPISODES', [10, 30]),
        ],
        usePercentile: 50,
        rationaleZh: 'pace',
      }),
      'APPROVED',
    );
    return TEMPORAL_SCENARIO_DEFS.map((d) =>
      judgeTemporalScenarioReadiness({
        scenarioId: d.scenarioId,
        metricValues: {
          OUTCOME_OBSERVABILITY: 0.95,
          OBSERVATION_DENSITY: 20,
          TEMPORAL_COVERAGE: 0.9,
          HIGH_QUALITY_EPISODES: 50,
          ATTRIBUTION: 0.9,
          WORLDSTATE_EVIDENCE_QUALITY: 0.9,
          CASE_REVIEW_COVERAGE: 0.9,
        },
        approvedProposal:
          d.scenarioId === 'pace_day_sequence' ? proposal : null,
      }),
    );
  }

  function calibration(ok: boolean): ConfidenceCalibrationV1 {
    return {
      schemaId: 'nara.temporal_confidence_calibration@v1',
      version: 1,
      scenarioId: 'pace_day_sequence',
      bins: [],
      ece: ok ? 0.08 : 0.4,
      calibrated: ok,
      rationaleZh: [],
    };
  }

  function report(passed: boolean): TemporalQualityReportV1 {
    return {
      schemaId: 'nara.temporal_quality_report@v1',
      version: 1,
      scenarioId: 'pace_day_sequence',
      sampleN: 10,
      comparableN: 10,
      whenAccurateZh: passed ? ['ok'] : [],
      whenInaccurateZh: passed ? [] : ['bad'],
      whyInaccurateByCategory: {},
      confidenceCalibration: calibration(passed),
      referenceGlobalAvgScore: passed ? 0.8 : 0.4,
      globalAggregateForbiddenAsSoleVerdict: true,
      qualityGatePassed: passed,
      qualityGateReasonsZh: passed ? ['ok'] : ['fail'],
      allowUserVisibleTemporal: passed,
      proactiveStillClosed: true,
      autoActionStillClosed: true,
      impactStillDecisionRuntimeEvidenceOnly: true,
      verdictZh: passed ? 'pass' : 'fail',
    };
  }

  function impact(): TemporalImpactV1 {
    return {
      schemaId: 'nara.temporal_impact@v1',
      version: 1,
      impactId: 'timp_test',
      scenarioId: 'pace_day_sequence',
      projectedAt: '2026-08-07T10:00:00.000Z',
      horizonHours: 48,
      onsetHours: 12,
      deadlineHours: 36,
      direction: 'WORSENING',
      summaryZh: '节奏恶化风险',
      ruleId: 'pace_fatigue_and_packed',
      isPrediction: true,
      isDecision: false,
      visibility: 'USER_VISIBLE_TEMPORAL',
      mayTriggerAdjustment: false,
      mayBypassHarness: false,
      evidenceRefs: ['fatigue'],
    };
  }

  it('Quality Gate fail stays Shadow; pass allows USER_VISIBLE only', () => {
    const judgements = qualifyPace();
    const fail = decideTemporalVisibility({
      judgements,
      report: report(false),
    });
    expect(fail.stayInShadow).toBe(true);
    expect(fail.mode).toBe('SHADOW');
    expect(fail.proactiveNotificationForbidden).toBe(true);
    expect(fail.autoActionForbidden).toBe(true);

    const pass = decideTemporalVisibility({
      judgements,
      report: report(true),
    });
    expect(pass.mode).toBe('USER_VISIBLE_TEMPORAL');
    expect(pass.allowUserVisibleTemporal).toBe(true);
    expect(pass.auth.proactiveEnabled).toBe(false);
  });

  it('PresentationPolicy: UI precision must not exceed prediction precision', () => {
    const visibility = decideTemporalVisibility({
      judgements: qualifyPace(),
      report: report(true),
    });
    const policy = buildTemporalPresentationPolicy({
      visibility,
      impact: impact(),
      evidence: [
        { key: 'fatigue', valueZh: '疲劳', freshness: 'VERIFIED' },
      ],
      statedConfidence: 0.7,
      calibration: calibration(true),
      onsetErrorHours: 10,
    });
    expect(policy.uiPrecisionMustNotExceedPredictionPrecision).toBe(true);
    expect(policy.maxExpressibleConfidence).toBeLessThanOrEqual(0.7);
    expect(policy.proactivePushForbidden).toBe(true);

    expect(
      assertPresentationWithinPolicy({
        policy,
        requestedCertainty: 'EXPECTED',
        requestedTimePrecision: policy.timePrecision,
        claimedConfidence: policy.maxExpressibleConfidence,
      }).ok,
    ).toBe(false);

    expect(
      assertPresentationWithinPolicy({
        policy,
        requestedCertainty: policy.certaintyLanguage,
        requestedTimePrecision: policy.timePrecision,
        claimedConfidence: policy.maxExpressibleConfidence,
      }).ok,
    ).toBe(true);
  });

  it('User-visible only on USER_ASKED / DECISION_RUNTIME; proactive forbidden', () => {
    const visibility = decideTemporalVisibility({
      judgements: qualifyPace(),
      report: report(true),
    });
    const policy = buildTemporalPresentationPolicy({
      visibility,
      impact: impact(),
      evidence: [
        { key: 'fatigue', valueZh: '疲劳', freshness: 'VERIFIED' },
      ],
      statedConfidence: 0.8,
      calibration: calibration(true),
      onsetErrorHours: 4,
    });

    expect(
      admitTemporalVisibleSurface({
        visibility,
        policy,
        surface: 'USER_ASKED',
      }).ok,
    ).toBe(true);
    expect(
      admitTemporalVisibleSurface({
        visibility,
        policy,
        surface: 'DECISION_RUNTIME',
      }).ok,
    ).toBe(true);
    const push = admitTemporalVisibleSurface({
      visibility,
      policy,
      surface: 'PROACTIVE_INTERRUPT',
    });
    expect(push.ok).toBe(false);
    expect(push.proactiveInterruptForbidden).toBe(true);
  });

  it('DoD: utility + lead time prove better decisions; intervention shadow no notify', () => {
    const scenarioId = 'pace_day_sequence' as const;
    const judgements = qualifyPace();
    const visibility = decideTemporalVisibility({
      judgements,
      report: report(true),
    });

    const episodes: TemporalUtilityEpisodeV1[] = [];
    for (let i = 0; i < 6; i++) {
      episodes.push({
        episodeId: `shown_${i}`,
        scenarioId,
        temporalShown: true,
        decisionCompleted: true,
        actionTimingImproved: true,
        correctionReduced: i > 0,
        regretReduced: true,
        outcomeImproved: i < 5,
      });
      episodes.push({
        episodeId: `ctrl_${i}`,
        scenarioId,
        temporalShown: false,
        decisionCompleted: i > 2,
        actionTimingImproved: false,
        correctionReduced: i > 3,
        regretReduced: i > 4,
        outcomeImproved: i > 4,
      });
    }

    const utility = evaluateTemporalDecisionUtility({
      scenarioId,
      episodes,
    });
    expect(utility.accuratePredictionIsNotUsefulIntervention).toBe(true);
    expect(utility.passed).toBe(true);
    expect(utility.deltaActionTiming).toBeGreaterThan(0);
    expect(utility.deltaRegret).toBeGreaterThan(0);

    const samples: ActionableLeadTimeSampleV1[] = Array.from(
      { length: 6 },
      (_, i) => ({
        sampleId: `alt_${i}`,
        scenarioId,
        predictedLeadHours: 24,
        usableActionWindowHours: 14 + (i % 3),
        controlActionWindowHours: 4,
        actedInWindow: true,
      }),
    );
    const leadTime = evaluateActionableLeadTime({ scenarioId, samples });
    expect(leadTime.passed).toBe(true);
    expect(leadTime.avgLeadGainHours).toBeGreaterThan(2);

    const blocked = createInterventionCandidateShadow({
      scenarioId,
      utility: { ...utility, passed: false },
      leadTime,
      severity: 0.8,
      confidence: 0.8,
      urgency: 0.7,
      actionability: 0.7,
      disruptionCost: 0.2,
    });
    expect(blocked.ok).toBe(false);

    const candidates = Array.from({ length: 6 }, (_, i) => {
      const r = createInterventionCandidateShadow({
        scenarioId,
        utility,
        leadTime,
        severity: 0.6,
        confidence: 0.7,
        urgency: i < 2 ? 0.8 : 0.3,
        actionability: 0.65,
        disruptionCost: i < 2 ? 0.25 : 0.55,
        candidateId: `ics_${i}`,
      });
      if (!r.ok) throw new Error('expected candidate');
      expect(r.candidate.notifyUser).toBe(false);
      expect(r.candidate.autoActionForbidden).toBe(true);
      return r.candidate;
    });

    const iq = evaluateInterventionQuality({
      scenarioId,
      candidates,
      maxShouldInterruptRate: 0.5,
    });
    expect(iq.passed).toBe(true);
    expect(iq.notifyUserStillForbidden).toBe(true);

    const review = submitProactiveReadinessReview({
      scenarioId,
      visibility,
      utility,
      leadTime,
      interventionQuality: iq,
    });
    expect(review.ok).toBe(true);
    if (review.ok) {
      expect(review.review.status).toBe('SUBMITTED_FOR_REVIEW');
      expect(review.review.proactiveNotificationStillForbidden).toBe(true);
      expect(review.review.autoActionStillForbidden).toBe(true);
      expect(review.review.dodFocusZh).toMatch(/更及时|后悔|质量/);
    }
  });
});
