import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { CgusDecisionTraceV1 } from './cgus-decision-trace.types';
import {
  buildCgusOutcomeLoopDsoPatch,
  findCgusDecisionTrace,
  listCgusDecisionTraces,
  projectCgusTripReviewSummary,
  upsertCgusDecisionTraceLog,
} from './cgus-trip-review.util';

function sampleTrace(id = 't1:OPTIMIZE:v0'): CgusDecisionTraceV1 {
  return {
    schemaVersion: 'cgus-decision-trace/v1',
    decision_id: id,
    trip_id: 't1',
    decision_type: 'OPTIMIZE',
    candidate_ids: ['A', 'B'],
    hard_constraint_result: 'all_feasible',
    hard_constraint_reasons: [],
    candidate_scores: {
      A: { safety: 0.82, experience: 0.88, expected_utility: 0.79 },
      B: { safety: 0.91, experience: 0.55, expected_utility: 0.73 },
    },
    ranking: ['A', 'B'],
    top1_margin: 0.06,
    recommended_candidate: 'A',
  };
}

function sampleDso(trace?: CgusDecisionTraceV1): DecisionState {
  const t = trace ?? sampleTrace();
  return {
    requestId: 't1',
    userIntent: { destination: 'IS' } as any,
    tripState: {},
    environmentState: {},
    systemState: { requestId: 't1', version: 1 },
    optimizationHints: { method: 'CGUS', cgusDecisionTrace: t },
  } as DecisionState;
}

describe('cgus-trip-review.util', () => {
  it('lists and finds traces from hints + log', () => {
    const a = sampleTrace('d-a');
    const b = sampleTrace('d-b');
    const dso = {
      ...sampleDso(a),
      systemState: { requestId: 't1', cgusDecisionTraceLog: [b] },
    } as DecisionState;
    const listed = listCgusDecisionTraces(dso);
    expect(listed.map((x) => x.decision_id).sort()).toEqual(['d-a', 'd-b']);
    expect(findCgusDecisionTrace(dso, 'd-b')?.decision_id).toBe('d-b');
  });

  it('upserts log by decision_id', () => {
    const a = sampleTrace('d1');
    const updated = { ...a, user_action: 'ACCEPT' as const, chosen_candidate: 'A' };
    expect(upsertCgusDecisionTraceLog([a], updated)).toHaveLength(1);
    expect(upsertCgusDecisionTraceLog([a], updated)[0].user_action).toBe('ACCEPT');
  });

  it('buildCgusOutcomeLoopDsoPatch applies action and mirrors hints', () => {
    const dso = sampleDso();
    const { nextTrace, optimizationHints, cgusDecisionTraceLog } = buildCgusOutcomeLoopDsoPatch(
      dso,
      { kind: 'action', user_action: 'OVERRIDE', chosen_candidate: 'B' },
    );
    expect(nextTrace.recommended_candidate).toBe('A');
    expect(nextTrace.chosen_candidate).toBe('B');
    expect(optimizationHints?.cgusDecisionTrace?.chosen_candidate).toBe('B');
    expect(cgusDecisionTraceLog[0].user_action).toBe('OVERRIDE');
  });

  it('buildCgusOutcomeLoopDsoPatch backfills trip shadow when pair seed present', () => {
    const dso = sampleDso();
    const decisionId = dso.optimizationHints!.cgusDecisionTrace!.decision_id;
    dso.optimizationHints = {
      ...dso.optimizationHints,
      tripShadowPair: {
        schemaId: 'tripnara.trip_shadow_pair@v1',
        decisionId,
        tripId: 't1',
        diverged: true,
        without: 'A',
        withMemory: 'B',
        qualityDelta: 'UNKNOWN',
        northStarReady: false,
      },
      tripShadowPairRecord: {
        schemaId: 'tripnara.trip_shadow_pair@v1',
        version: 1,
        decisionPair: {
          schemaId: 'tripnara.decision_pair@v1',
          version: 1,
          decisionId,
          tripId: 't1',
          baseline: { context: 'without_memory', recommendation: 'A' },
          memoryAssisted: {
            context: 'with_memory',
            recommendation: 'B',
            memoryContribution: ['M1'],
          },
          diverged: true,
        },
        compareCase: {
          decisionId,
          tripId: 't1',
          withoutMemoryRecommendation: 'A',
          withMemoryRecommendation: 'B',
          diverged: true,
          memoryChangedRecommendation: true,
          qualityDelta: 'UNKNOWN',
        },
        northStarReady: false,
        notes: ['awaiting_user_outcome'],
      },
      memoryDecisionTrace: {
        schemaId: 'tripnara.memory_decision_trace@v1',
        version: 1,
        decisionId,
        contextSources: {
          world: true,
          booking: false,
          team: false,
          memory: true,
        },
        memoryContribution: { used: true, influence: [] },
      },
    } as any;

    const action = buildCgusOutcomeLoopDsoPatch(dso, {
      kind: 'action',
      user_action: 'ACCEPT',
    });
    expect(action.optimizationHints?.tripShadowPair?.qualityDelta).toBe('IMPROVED');
    expect(action.tripShadowCaseLog?.[0]?.accepted).toBe(true);

    const withOutcome = buildCgusOutcomeLoopDsoPatch(
      {
        ...dso,
        optimizationHints: action.optimizationHints,
        systemState: {
          ...dso.systemState!,
          cgusDecisionTraceLog: action.cgusDecisionTraceLog,
          tripShadowCaseLog: action.tripShadowCaseLog,
        },
      },
      {
        kind: 'outcome',
        actual_outcome: { completed: true, safetyIncident: false },
        decision_regret: 'NONE',
      },
    );
    expect(withOutcome.tripShadowNorthStar?.answerable).toBe(true);
    expect(withOutcome.tripShadowNorthStar?.preventedMistakeCount).toBe(1);
  });

  it('projectCgusTripReviewSummary exposes compare rows', () => {
    const summary = projectCgusTripReviewSummary(sampleTrace());
    expect(summary.recommended_candidate).toBe('A');
    expect(summary.score_compare).toHaveLength(2);
    expect(summary.score_compare[0].is_recommended).toBe(true);
    expect(summary.is_wrong_recommendation).toBe(false);
  });
});
