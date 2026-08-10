import { projectTravelWorldState } from '../../state-learning/project-travel-world-state.util';
import {
  judgeTemporalScenarioReadiness,
  TEMPORAL_SCENARIO_DEFS,
} from '../pilot/scenario-temporal-readiness.util';
import {
  createTemporalThresholdProposal,
  reviewTemporalThresholdProposal,
  computeMetricDistribution,
} from '../pilot/readiness-distribution.util';
import { appendObservationTimelineEntry } from '../pilot/observation-timeline.util';
import { assertTemporalImpactAsEvidenceOnly } from '../temporal-graduation/temporal-impact.util';
import { selectFirstApprovedShadowScenario } from './select-shadow-scenario.util';
import {
  freezePredictionTimeSnapshot,
  assertNoFutureEvidenceBackfill,
} from './prediction-time-snapshot.util';
import { runTemporalShadowProjection } from './run-temporal-shadow.util';
import { evaluateShadowTemporalProjection } from './evaluate-shadow-projection.util';
import { attributeTemporalFailure } from './temporal-failure-attribution.util';
import {
  attachShadowOutcomeAndEvaluation,
  type TemporalShadowRecordV1,
} from './temporal-shadow-record.util';
import {
  buildTemporalQualityReport,
  authorizeUserVisibleFromQualityReport,
} from './temporal-quality-report.util';

describe('Temporal Shadow Validation', () => {
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
        rationaleZh: 'pace 分布稳定',
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

  function ws() {
    return projectTravelWorldState({
      tripId: 't_shadow',
      lifecycle: 'TRAVELING',
      decisionOs: {
        revision: 'v1',
        tripId: 't_shadow',
        days: [
          {
            date: '2026-08-11',
            items: [{ placeName: '满日程A' }, { placeName: '满日程B' }],
          },
        ],
      },
      tripMeta: { planVersion: 1 },
      correlation: { latestPlanVersion: 1 },
    });
  }

  it('continues Pilot when QUALIFIED but not APPROVED_FOR_SHADOW', () => {
    const target = selectFirstApprovedShadowScenario({
      judgements: qualifyPace(),
      approvedForShadow: false,
    });
    expect(target.ok).toBe(false);
    if (!target.ok) {
      expect(target.action).toBe('CONTINUE_PILOT');
      expect(target.reason).toBe('QUALIFIED_BUT_NOT_APPROVED_FOR_SHADOW');
    }
  });

  it('Future Evidence ≠ Past Prediction Evidence — blocks backfill', () => {
    const projectedAt = '2026-08-07T10:00:00.000Z';
    const snap = freezePredictionTimeSnapshot({
      scenarioId: 'pace_day_sequence',
      tripId: 't1',
      projectedAt,
      worldState: ws(),
      evidence: [
        {
          key: 'fatigue',
          valueZh: '疲劳',
          freshness: 'VERIFIED',
          observedAt: '2026-08-07T09:00:00.000Z',
        },
      ],
    });
    expect(snap.futureEvidenceIsNotPastPredictionEvidence).toBe(true);
    expect(snap.frozen).toBe(true);

    const guard = assertNoFutureEvidenceBackfill({
      snapshot: snap,
      candidateEvidence: [
        {
          key: 'late_signal',
          valueZh: '事后才知的疲劳加重',
          freshness: 'VERIFIED',
          observedAt: '2026-08-07T18:00:00.000Z',
        },
      ],
    });
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.code).toBe('FUTURE_EVIDENCE_BACKFILL_FORBIDDEN');
    }

    expect(() =>
      freezePredictionTimeSnapshot({
        scenarioId: 'pace_day_sequence',
        tripId: 't1',
        projectedAt,
        worldState: ws(),
        evidence: [
          {
            key: 'future',
            valueZh: '未来证据',
            freshness: 'VERIFIED',
            observedAt: '2026-08-08T00:00:00.000Z',
          },
        ],
      }),
    ).toThrow(/future_evidence_forbidden/);
  });

  it('user trajectory change must not count as False Alert', () => {
    const target = selectFirstApprovedShadowScenario({
      judgements: qualifyPace(),
      approvedForShadow: true,
    });
    expect(target.ok).toBe(true);
    if (!target.ok) return;

    const run = runTemporalShadowProjection({
      target,
      tripId: 't_shadow',
      worldState: ws(),
      evidence: [
        {
          key: 'fatigue',
          valueZh: '疲劳',
          freshness: 'VERIFIED',
          observedAt: '2026-08-07T09:00:00.000Z',
        },
        {
          key: 'pace',
          valueZh: 'packed 紧凑',
          freshness: 'VERIFIED',
          observedAt: '2026-08-07T09:30:00.000Z',
        },
      ],
      now: '2026-08-07T10:00:00.000Z',
    });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.record.impact.direction).toBe('WORSENING');

    const { interpretation, evaluation } = evaluateShadowTemporalProjection({
      impact: run.record.impact,
      interpretationHints: {
        rawDeteriorated: false,
        userTrajectoryChanged: true,
      },
    });
    expect(interpretation.mayCountAsFalseAlert).toBe(false);
    expect(interpretation.inconclusive).toBe(true);
    expect(evaluation.falseAlert).toBe(false);

    const attr = attributeTemporalFailure({
      evaluation,
      interpretation,
    });
    expect(attr.primary).toBe('USER_BEHAVIOR');
    expect(attr.isFailure).toBe(false);
  });

  it('DoD: scenario report explains when accurate/inaccurate and confidence trust', () => {
    const judgements = qualifyPace();
    const target = selectFirstApprovedShadowScenario({
      judgements,
      approvedForShadow: true,
    });
    expect(target.ok).toBe(true);
    if (!target.ok) return;

    const records: TemporalShadowRecordV1[] = [];
    for (let i = 0; i < 6; i++) {
      const run = runTemporalShadowProjection({
        target,
        tripId: `t_${i}`,
        worldState: ws(),
        evidence: [
          {
            key: 'fatigue',
            valueZh: '疲劳',
            freshness: 'VERIFIED',
            observedAt: '2026-08-07T09:00:00.000Z',
          },
          {
            key: 'pace',
            valueZh: 'packed',
            freshness: 'VERIFIED',
            observedAt: '2026-08-07T09:10:00.000Z',
          },
        ],
        now: `2026-08-07T10:0${i}:00.000Z`,
      });
      if (!run.ok) throw new Error('shadow run failed');

      let timeline = run.record.observedTimeline;
      timeline = appendObservationTimelineEntry(timeline, {
        at: `2026-08-08T12:0${i}:00.000Z`,
        kind: 'EVENT',
        refId: `ev_${i}`,
        summaryZh: '日疲劳观测',
      });

      const deteriorated = i < 5;
      const { interpretation, evaluation } = evaluateShadowTemporalProjection({
        impact: run.record.impact,
        interpretationHints: {
          rawDeteriorated: deteriorated,
          observedDirection: deteriorated ? 'WORSENING' : 'STABLE',
          onsetHours: (run.record.impact.onsetHours ?? 12) + (i % 2),
          deadlineHours: run.record.impact.deadlineHours ?? 36,
          /** 第 5 条：真实漏报式偏差，计 FA */
          userTrajectoryChanged: false,
        },
      });
      const attr = attributeTemporalFailure({
        evaluation,
        interpretation,
        hints: deteriorated
          ? undefined
          : { projectionLogicSuspect: true },
      });
      records.push(
        attachShadowOutcomeAndEvaluation(
          { ...run.record, observedTimeline: timeline },
          {
            outcomeInterpretation: interpretation,
            evaluation,
            failureAttribution: attr,
          },
        ),
      );
    }

    expect(
      assertTemporalImpactAsEvidenceOnly(
        records[0]!.impact,
        'DECISION_RUNTIME_EVIDENCE',
      ).ok,
    ).toBe(true);
    expect(
      assertTemporalImpactAsEvidenceOnly(
        records[0]!.impact,
        'DIRECT_ACTION',
      ).ok,
    ).toBe(false);

    const report = buildTemporalQualityReport({
      scenarioId: 'pace_day_sequence',
      records,
      minSamples: 5,
    });
    expect(report.globalAggregateForbiddenAsSoleVerdict).toBe(true);
    expect(report.proactiveStillClosed).toBe(true);
    expect(report.autoActionStillClosed).toBe(true);
    expect(report.impactStillDecisionRuntimeEvidenceOnly).toBe(true);
    expect(report.whenAccurateZh.length).toBeGreaterThan(0);
    expect(report.whenInaccurateZh.length).toBeGreaterThan(0);
    expect(report.confidenceCalibration.bins.length).toBe(3);
    expect(report.verdictZh.length).toBeGreaterThan(10);

    /** 5 准 1 不准 → Gate 通常可通过且校准可信 */
    expect(report.qualityGatePassed).toBe(true);
    expect(report.allowUserVisibleTemporal).toBe(true);

    const auth = authorizeUserVisibleFromQualityReport({
      judgements,
      report,
    });
    expect(auth.mode).toBe('USER_VISIBLE_TEMPORAL');
    expect(auth.proactiveEnabled).toBe(false);
  });
});
