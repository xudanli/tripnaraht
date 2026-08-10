import { projectTravelWorldState } from '../../state-learning/project-travel-world-state.util';
import { evaluateCanaryCandidate } from '../canary/canary-candidate-evaluation.util';
import { buildComparableDecisionSnapshot } from '../canary/comparable-snapshot.util';
import {
  REAL_DECISION_PILOT_KEYS,
  assertRealDecisionPilotKeyOrThrow,
} from './pilot-decision-keys.util';
import {
  advanceDecisionDataFunnel,
  countDecisionDataFunnel,
} from './decision-data-funnel.util';
import { classifyDecisionFailure } from './decision-failure-taxonomy.util';
import { buildEvaluationSliceReport } from './evaluation-slice.util';
import {
  createObservationTimeline,
  appendObservationTimelineEntry,
} from './observation-timeline.util';
import { checkTemporalReadinessGate } from './temporal-readiness-gate.util';
import { assemblePilotTravelDecisionDataset } from './assemble-pilot-dataset.util';

describe('Real Decision Pilot', () => {
  function world(phase: 'PLANNING' | 'TRAVELING') {
    return projectTravelWorldState({
      tripId: 'trip_pilot',
      lifecycle: phase,
      decisionOs: {
        revision: 'v1',
        tripId: 'trip_pilot',
        name: 'Pilot',
        days: [{ date: '2026-08-10', items: [{ placeName: '雷克雅未克' }] }],
      },
      tripMeta: { planVersion: 1, status: 'ACTIVE' },
      correlation: { latestPlanVersion: 1 },
      bookingItems: [{ dayIndex: 1, bookingStatus: 'BOOKED' }],
    });
  }

  it('only opens four low-risk pilot decision keys', () => {
    expect(REAL_DECISION_PILOT_KEYS).toEqual([
      'pace_preference',
      'arrival_day_load',
      'accommodation_movement',
      'experience_selection',
    ]);
    expect(() => assertRealDecisionPilotKeyOrThrow('vehicle_drive')).toThrow(
      /not_in_pilot_batch/,
    );
  });

  it('Decision Data Funnel drops before evaluation when outcome missing', () => {
    const p = advanceDecisionDataFunnel({
      isDecision: true,
      isEligible: true,
      isComparable: true,
      outcomeObservable: false,
      attributionValid: true,
      evaluationValid: true,
      hasDisagreement: false,
    });
    expect(p.droppedAt).toBe('OUTCOME_OBSERVABLE');
    expect(p.stageReached).toBe('COMPARABLE');
  });

  it('Failure taxonomy + disagreement classification', () => {
    const label = classifyDecisionFailure({
      productionOptionId: 'easy',
      candidateOptionId: 'packed',
      userChosenOptionId: 'packed',
      outcomeGood: true,
    });
    expect(label.disagreementClass).toBe('CANDIDATE_BETTER_CHOICE');
  });

  it('Evaluation slices by DecisionKey/TripPhase/EvidenceQuality (not global-only)', () => {
    const snapPlan = buildComparableDecisionSnapshot({
      tripId: 'trip_pilot',
      decisionKey: 'pace_preference',
      worldState: world('PLANNING'),
      evidence: [{ key: 'a', valueZh: '轻松', freshness: 'VERIFIED' }],
    });
    const snapTravel = buildComparableDecisionSnapshot({
      tripId: 'trip_pilot',
      decisionKey: 'experience_selection',
      worldState: world('TRAVELING'),
      evidence: [{ key: 'b', valueZh: '温泉', freshness: 'ASSUMED' }],
    });
    const report = buildEvaluationSliceReport({
      rows: [
        {
          decisionKey: 'pace_preference',
          tripPhase: 'PLANNING',
          evidence: snapPlan.evidence,
          evaluation: evaluateCanaryCandidate({
            channel: 'PRODUCTION',
            snapshot: snapPlan,
            hints: { outcomeScore: 0.5, safetyOk: true, feasibilityOk: true },
          }),
        },
        {
          decisionKey: 'pace_preference',
          tripPhase: 'PLANNING',
          evidence: snapPlan.evidence,
          evaluation: evaluateCanaryCandidate({
            channel: 'CANDIDATE',
            snapshot: snapPlan,
            hints: { outcomeScore: 0.85, safetyOk: true, feasibilityOk: true },
          }),
        },
        {
          decisionKey: 'experience_selection',
          tripPhase: 'TRAVELING',
          evidence: snapTravel.evidence,
          evaluation: evaluateCanaryCandidate({
            channel: 'PRODUCTION',
            snapshot: snapTravel,
            hints: { outcomeScore: 0.4, safetyOk: true, feasibilityOk: true },
          }),
        },
      ],
    });
    expect(report.globalAverageForbiddenAsSoleConclusion).toBe(true);
    expect(report.slices.length).toBeGreaterThanOrEqual(2);
    const pace = report.slices.find(
      (s) =>
        s.decisionKey === 'pace_preference' && s.evidenceQuality === 'VERIFIED_RICH',
    );
    expect(pace?.candidateN).toBe(1);
    expect(pace?.productionN).toBe(1);
    expect(pace?.avgOutcome).toBeGreaterThan(0.5);
  });

  it('Observation Timeline records only existing observations (no prediction)', () => {
    let tl = createObservationTimeline({
      tripId: 'trip_pilot',
      decisionKey: 'pace_preference',
    });
    tl = appendObservationTimelineEntry(tl, {
      at: '2026-08-10T10:00:00.000Z',
      kind: 'WORLD_STATE',
      refId: 'ws1',
      summaryZh: 'WorldState projected',
    });
    tl = appendObservationTimelineEntry(tl, {
      at: '2026-08-10T10:05:00.000Z',
      kind: 'EVIDENCE',
      refId: 'ev1',
      summaryZh: 'Evidence VERIFIED pace',
    });
    expect(tl.noPredictionLogic).toBe(true);
    expect(tl.entries.every((e) => e.isPrediction === false)).toBe(true);
    expect(() =>
      appendObservationTimelineEntry(tl, {
        at: '2026-08-10T11:00:00.000Z',
        kind: 'EVENT',
        refId: 'pred',
        summaryZh: '预测明天堵车',
        isPrediction: true,
      }),
    ).toThrow(/prediction_forbidden/);
  });

  it('assembles first high-quality Travel Decision Dataset; Temporal gated', () => {
    const episodes = REAL_DECISION_PILOT_KEYS.flatMap((key, i) => {
      const phase = i % 2 === 0 ? ('PLANNING' as const) : ('TRAVELING' as const);
      const ws = world(phase);
      return [
        {
          recordId: `${key}_hq`,
          tripId: 'trip_pilot',
          decisionKey: key,
          snapshotId: `snap_${key}`,
          worldState: ws,
          evidence: [
            { key: 'e', valueZh: 'ok', freshness: 'VERIFIED' as const },
          ],
          productionOptionId: 'a',
          candidateOptionId: 'b',
          userChosenOptionId: 'b',
          outcomeObservable: true,
          outcomeValueZh: '用户接受候选',
          eligible: true,
          comparable: true,
          attributionValid: true,
          evaluationValid: true,
          evaluation: evaluateCanaryCandidate({
            channel: 'CANDIDATE',
            snapshot: buildComparableDecisionSnapshot({
              tripId: 'trip_pilot',
              decisionKey: key,
              worldState: ws,
              evidence: [
                { key: 'e', valueZh: 'ok', freshness: 'VERIFIED' },
              ],
            }),
            hints: {
              safetyOk: true,
              feasibilityOk: true,
              outcomeScore: 0.8,
              userAccepted: true,
            },
          }),
        },
      ];
    });

    const bundle = assemblePilotTravelDecisionDataset({
      episodes,
      minRecordsForTemporal: 50,
    });
    expect(bundle.highQualityCount).toBe(4);
    expect(bundle.dataset.records.every((r) => r.outcome.observable)).toBe(true);
    expect(
      countDecisionDataFunnel(bundle.funnelProgresses).EVALUATION_VALID,
    ).toBe(4);

    const gate = checkTemporalReadinessGate({
      dataset: bundle.dataset,
      funnelProgresses: bundle.funnelProgresses,
      minHighQualityEpisodes: 20,
    });
    expect(gate.testsPassedDoNotImplyReady).toBe(true);
    expect(gate.ready).toBe(false);
    expect(gate.missing).toEqual(
      expect.arrayContaining(['HIGH_QUALITY_EPISODES']),
    );
  });
});
