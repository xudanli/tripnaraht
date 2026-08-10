import { projectTravelWorldState } from '../../state-learning/project-travel-world-state.util';
import { REAL_DECISION_PILOT_RUNBOOK } from './pilot-runbook.util';
import {
  PILOT_OUTCOME_OBSERVATION_CONTRACTS,
  checkOutcomeObservationContract,
} from './outcome-observation-contract.util';
import {
  explainFunnelDrop,
  histogramFunnelDrops,
} from './funnel-drop-reason.util';
import {
  createObservationTimeline,
  appendObservationTimelineEntry,
} from './observation-timeline.util';
import {
  computeObservationDensity,
  computeTemporalCoverage,
} from './observation-density.util';
import { buildTemporalReadinessReport } from './temporal-readiness-report.util';
import {
  openDecisionCaseReview,
  completeDecisionCaseReview,
  computeCaseReviewCoverage,
} from './decision-case-review.util';
import { assemblePilotTravelDecisionDataset } from './assemble-pilot-dataset.util';
import { REAL_DECISION_PILOT_KEYS } from './pilot-decision-keys.util';

describe('Pilot Operations & Dataset Qualification', () => {
  it('Runbook freezes Trip Enroll → … → Dataset', () => {
    expect(REAL_DECISION_PILOT_RUNBOOK.steps.map((s) => s.step)).toEqual([
      'TRIP_ENROLL',
      'DECISION',
      'CHOICE',
      'ACTION',
      'OUTCOME',
      'ATTRIBUTION',
      'EVALUATION',
      'DATASET',
    ]);
  });

  it('freezes Outcome Observation Contract for four pilot keys', () => {
    for (const key of REAL_DECISION_PILOT_KEYS) {
      const c = PILOT_OUTCOME_OBSERVATION_CONTRACTS[key];
      expect(c.decisionKey).toBe(key);
      expect(c.requiredFields.some((f) => f.required)).toBe(true);
      expect(c.forbiddenAsObserved).toContain('COUNTERFACTUAL');
    }
    const ok = checkOutcomeObservationContract({
      decisionKey: 'pace_preference',
      observedFields: {
        day_fatigue_level: 'MEDIUM',
        skipped_or_rushed_count: 1,
      },
    });
    expect(ok.ok).toBe(true);
    const bad = checkOutcomeObservationContract({
      decisionKey: 'pace_preference',
      observedFields: { day_fatigue_level: 'MEDIUM' },
      markedAs: ['MODEL_PREDICTION'],
    });
    expect(bad.ok).toBe(false);
    expect(bad.missingFields).toContain('skipped_or_rushed_count');
    expect(bad.violatedForbidden).toContain('MODEL_PREDICTION');
  });

  it('Funnel Drop Reason names stage and needed data type', () => {
    const drop = explainFunnelDrop(
      {
        isDecision: true,
        isEligible: true,
        isComparable: true,
        outcomeObservable: false,
        attributionValid: true,
        evaluationValid: true,
        hasDisagreement: false,
      },
      { outcomeContractOk: false },
    );
    expect(drop.droppedAt).toBe('OUTCOME_OBSERVABLE');
    expect(drop.reasonCode).toBe('OUTCOME_CONTRACT_FAIL');
    expect(drop.needDataTypeZh).toMatch(/Outcome/);
    expect(
      histogramFunnelDrops([drop]).OUTCOME_CONTRACT_FAIL,
    ).toBe(1);
  });

  it('Observation Density / Temporal Coverage without prediction', () => {
    let tl = createObservationTimeline({ tripId: 't1' });
    tl = appendObservationTimelineEntry(tl, {
      at: '2026-08-10T08:00:00.000Z',
      kind: 'WORLD_STATE',
      refId: 'w1',
      summaryZh: 'ws',
    });
    tl = appendObservationTimelineEntry(tl, {
      at: '2026-08-10T12:00:00.000Z',
      kind: 'EVIDENCE',
      refId: 'e1',
      summaryZh: 'ev',
    });
    const density = computeObservationDensity(tl);
    expect(density.noPrediction).toBe(true);
    expect(density.spanHours).toBe(4);
    expect(density.medianGapHours).toBe(4);

    const ws = projectTravelWorldState({
      tripId: 't1',
      lifecycle: 'TRAVELING',
      tripMeta: { planVersion: 1 },
      correlation: { latestPlanVersion: 1 },
    });
    const coverage = computeTemporalCoverage({
      schemaId: 'nara.travel_decision_dataset@v1',
      version: 1,
      datasetId: 'd1',
      records: [
        {
          schemaId: 'nara.travel_decision_dataset@v1',
          version: 1,
          recordId: 'r1',
          tripId: 't1',
          decisionKey: 'pace_preference',
          snapshotId: 's1',
          worldState: ws,
          evidence: [],
          decision: {},
          recommendation: { productionOptionId: 'a' },
          choice: {},
          action: {},
          outcome: { observable: true, valueZh: 'ok' },
          recordedAt: new Date().toISOString(),
        },
      ],
      readyForTemporalProactive: false,
      minRecordsForTemporal: 50,
    });
    expect(coverage.distributionOnly).toBe(true);
    expect(coverage.distinctTripPhases).toContain('TRAVELING');
  });

  it('Readiness report explains why not Temporal and what to accumulate', () => {
    const bundle = assemblePilotTravelDecisionDataset({
      episodes: [
        {
          recordId: 'r1',
          tripId: 't1',
          decisionKey: 'pace_preference',
          snapshotId: 's1',
          worldState: projectTravelWorldState({
            tripId: 't1',
            lifecycle: 'PLANNING',
            tripMeta: { planVersion: 1 },
            correlation: { latestPlanVersion: 1 },
          }),
          evidence: [{ key: 'e', valueZh: 'x', freshness: 'VERIFIED' }],
          productionOptionId: 'a',
          candidateOptionId: 'b',
          userChosenOptionId: 'b',
          outcomeObservable: true,
          outcomeValueZh: 'ok',
          eligible: true,
          comparable: true,
          attributionValid: true,
          evaluationValid: true,
        },
      ],
      minRecordsForTemporal: 50,
    });

    const report = buildTemporalReadinessReport({
      dataset: bundle.dataset,
      funnelProgresses: bundle.funnelProgresses,
      funnelDropHistogram: { OUTCOME_NOT_OBSERVABLE: 3 },
    });
    expect(report.thresholdsFrozen).toBe(false);
    expect(report.ready).toBe(false);
    expect(report.testsPassedDoNotImplyReady).toBe(true);
    expect(report.dimensions.every((d) => d.ready === 'UNKNOWN')).toBe(true);
    expect(report.whyNotTemporalZh.join(' ')).toMatch(/不能进入 Temporal/);
    expect(report.needAccumulateZh.length).toBeGreaterThan(0);
    expect(report.blockers.some((b) => b.severity === 'WATCH')).toBe(true);
  });

  it('Decision Case Review covers disagreement/poor/inconclusive', () => {
    let review = openDecisionCaseReview({
      recordId: 'r_disagree',
      decisionKey: 'experience_selection',
      tripId: 't1',
      priority: 'DISAGREEMENT',
    });
    review = completeDecisionCaseReview(review, {
      reviewer: 'ops',
      usableForDataset: true,
      notesZh: '候选更贴用户选择',
      rootCauseCategory: 'DECISION',
    });
    expect(review.status).toBe('REVIEWED');
    expect(
      computeCaseReviewCoverage({
        highValueCaseIds: ['r_disagree', 'r_poor'],
        reviews: [review],
      }),
    ).toBe(0.5);
  });
});
