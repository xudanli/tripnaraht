import { explainFunnelDrop } from './funnel-drop-reason.util';
import { rankFunnelDropGaps } from './rank-data-gaps.util';
import { buildObservationGapBacklog } from './observation-gap-backlog.util';
import {
  computeMetricDistribution,
  createTemporalThresholdProposal,
  reviewTemporalThresholdProposal,
} from './readiness-distribution.util';
import {
  TEMPORAL_SCENARIO_DEFS,
  assertPilotKeysCoveredByScenarios,
  judgeTemporalScenarioReadiness,
  explainWhichTemporalScenariosQualify,
} from './scenario-temporal-readiness.util';
import { buildPilotQualificationReport } from './pilot-qualification-report.util';
import { countDecisionDataFunnel } from './decision-data-funnel.util';
import {
  openDecisionCaseReview,
  completeDecisionCaseReview,
} from './decision-case-review.util';

describe('Pilot Calibration & Threshold Freezing', () => {
  it('ranks funnel drops into Top Data Gaps for dev tasks', () => {
    const details = [
      ...Array.from({ length: 5 }, () =>
        explainFunnelDrop({
          isDecision: true,
          isEligible: true,
          isComparable: true,
          outcomeObservable: false,
          attributionValid: true,
          evaluationValid: true,
          hasDisagreement: false,
        }),
      ),
      explainFunnelDrop({
        isDecision: true,
        isEligible: false,
        isComparable: false,
        outcomeObservable: false,
        attributionValid: false,
        evaluationValid: false,
        hasDisagreement: false,
      }),
    ];
    const ranked = rankFunnelDropGaps(details);
    expect(ranked[0].reasonCode).toBe('OUTCOME_NOT_OBSERVABLE');
    expect(ranked[0].impactScore).toBeGreaterThan(ranked[1].impactScore);
    const backlog = buildObservationGapBacklog({ rankedGaps: ranked, topN: 3 });
    expect(backlog.tasksMustComeFromTopGaps).toBe(true);
    expect(backlog.items[0].titleZh).toMatch(/Outcome/);
  });

  it('Case Review forces rootCauseCategory for high-value cases', () => {
    const review = openDecisionCaseReview({
      recordId: 'r1',
      decisionKey: 'pace_preference',
      tripId: 't1',
      priority: 'POOR',
    });
    expect(() =>
      completeDecisionCaseReview(review, {
        reviewer: 'ops',
        usableForDataset: false,
      }),
    ).toThrow(/rootCauseCategory_required/);
    const done = completeDecisionCaseReview(review, {
      reviewer: 'ops',
      usableForDataset: true,
      rootCauseCategory: 'EVIDENCE',
    });
    expect(done.rootCauseCategory).toBe('EVIDENCE');
  });

  it('collects P50/P75/P90 without setting thresholds; proposal needs human review', () => {
    const dist = computeMetricDistribution(
      'OUTCOME_OBSERVABILITY',
      [0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
    );
    expect(dist.thresholdNotSet).toBe(true);
    expect(dist.p50).not.toBeNull();
    expect(dist.p75).not.toBeNull();
    expect(dist.p90).not.toBeNull();

    let proposal = createTemporalThresholdProposal({
      scenarioId: 'pace_day_sequence',
      distributions: [dist],
      usePercentile: 75,
      rationaleZh: '用真实 Pilot P75 提案，待人工 Review',
    });
    expect(proposal.humanReviewStatus).toBe('PENDING');
    expect(proposal.canFreezeThresholds).toBe(false);
    proposal = reviewTemporalThresholdProposal(proposal, 'APPROVED');
    expect(proposal.canFreezeThresholds).toBe(true);
  });

  it('judges Temporal readiness per scenario; forbids global gate flip', () => {
    expect(assertPilotKeysCoveredByScenarios()).toBe(true);
    expect(TEMPORAL_SCENARIO_DEFS).toHaveLength(4);

    const judgements = TEMPORAL_SCENARIO_DEFS.map((d) =>
      judgeTemporalScenarioReadiness({
        scenarioId: d.scenarioId,
        metricValues: {
          OUTCOME_OBSERVABILITY: 0.9,
          OBSERVATION_DENSITY: 10,
          TEMPORAL_COVERAGE: 0.8,
          HIGH_QUALITY_EPISODES: 30,
          ATTRIBUTION: 0.8,
          WORLDSTATE_EVIDENCE_QUALITY: 0.8,
          CASE_REVIEW_COVERAGE: 0.8,
        },
        approvedProposal: null,
      }),
    );
    expect(judgements.every((j) => j.qualified === false)).toBe(true);
    expect(judgements.every((j) => j.globalGateForbidden)).toBe(true);

    const approved = reviewTemporalThresholdProposal(
      createTemporalThresholdProposal({
        scenarioId: 'pace_day_sequence',
        distributions: [
          computeMetricDistribution('OUTCOME_OBSERVABILITY', [0.7, 0.8, 0.9]),
          computeMetricDistribution('OBSERVATION_DENSITY', [5, 8, 12]),
          computeMetricDistribution('TEMPORAL_COVERAGE', [0.5, 0.6, 0.75]),
          computeMetricDistribution('HIGH_QUALITY_EPISODES', [10, 20, 40]),
        ],
        usePercentile: 50,
        rationaleZh: 'pace 场景分布稳定后提案',
      }),
      'APPROVED',
    );

    const pace = judgeTemporalScenarioReadiness({
      scenarioId: 'pace_day_sequence',
      metricValues: {
        OUTCOME_OBSERVABILITY: 0.95,
        OBSERVATION_DENSITY: 20,
        TEMPORAL_COVERAGE: 0.9,
        HIGH_QUALITY_EPISODES: 50,
      },
      approvedProposal: approved,
    });
    expect(pace.qualified).toBe(true);
    expect(pace.thresholdsFrozen).toBe(true);

    const arrival = judgeTemporalScenarioReadiness({
      scenarioId: 'arrival_day_recovery',
      metricValues: {
        OUTCOME_OBSERVABILITY: 0.99,
        ATTRIBUTION: 0.99,
        WORLDSTATE_EVIDENCE_QUALITY: 0.99,
      },
      approvedProposal: approved,
    });
    expect(arrival.qualified).toBe(false);

    const which = explainWhichTemporalScenariosQualify({
      judgements: [pace, arrival],
    });
    expect(which.notAGlobalGateFlip).toBe(true);
    expect(which.qualifiedScenarioIds).toEqual(['pace_day_sequence']);
    expect(which.notQualifiedScenarioIds).toContain('arrival_day_recovery');
  });

  it('Pilot Qualification Report answers which scenarios qualify with evidence', () => {
    const drops = rankFunnelDropGaps([
      explainFunnelDrop({
        isDecision: true,
        isEligible: true,
        isComparable: true,
        outcomeObservable: false,
        attributionValid: true,
        evaluationValid: true,
        hasDisagreement: false,
      }),
    ]);
    const report = buildPilotQualificationReport({
      funnelCounts: countDecisionDataFunnel([]),
      rawCount: 10,
      outcomeObservableCount: 4,
      attributionValidCount: 3,
      evaluationValidCount: 2,
      datasetQualifiedCount: 2,
      densities: [],
      temporalCoverage: {
        distinctTripPhases: ['PLANNING'],
        distinctDecisionKeys: ['pace_preference'],
        recordsWithOutcome: 2,
        recordsTotal: 2,
        phaseCoverageRate: 0.25,
        distributionOnly: true,
      },
      rankedDataGaps: drops,
      gapBacklog: buildObservationGapBacklog({ rankedGaps: drops }),
      metricDistributions: [
        computeMetricDistribution('OUTCOME_OBSERVABILITY', [0.2, 0.4, 0.6]),
      ],
      scenarioJudgements: [
        judgeTemporalScenarioReadiness({
          scenarioId: 'pace_day_sequence',
          metricValues: {},
          approvedProposal: null,
        }),
      ],
    });
    expect(report.temporalProactiveCausalDevForbidden).toBe(true);
    expect(report.thresholdsFrozenGlobally).toBe(false);
    expect(report.whichScenariosQualifyZh.join(' ')).toMatch(/不合格|合格/);
    expect(report.rankedDataGaps[0].reasonCode).toBe('OUTCOME_NOT_OBSERVABLE');
  });
});
