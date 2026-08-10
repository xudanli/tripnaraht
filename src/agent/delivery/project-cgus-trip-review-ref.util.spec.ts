import {
  CGUS_TRIP_REVIEW_REF_SCHEMA_ID,
  projectCgusTripReviewRefFromDecisionState,
  projectCgusTripReviewRefFromTrace,
} from './project-cgus-trip-review-ref.util';
import type { CgusDecisionTraceV1 } from '../../trips/decision/optimization/cgus-decision-trace.types';
import { attachConversationTurnResultToPayload } from './conversation/attach-conversation-turn.util';

describe('projectCgusTripReviewRef', () => {
  const trace: CgusDecisionTraceV1 = {
    schemaVersion: 'cgus-decision-trace/v1',
    decision_id: 'run1:OPTIMIZE:v0',
    trip_id: 'run1',
    decision_type: 'OPTIMIZE',
    candidate_ids: ['A', 'B', 'C'],
    hard_constraint_result: 'all_feasible',
    hard_constraint_reasons: [],
    candidate_scores: {},
    ranking: ['A', 'B', 'C'],
    top1_margin: 0.05,
    recommended_candidate: 'A',
  };

  it('projects thin ref for iOS writeback', () => {
    const ref = projectCgusTripReviewRefFromTrace(trace, { trip_run_id: 'tr_abc' });
    expect(ref.schema_id).toBe(CGUS_TRIP_REVIEW_REF_SCHEMA_ID);
    expect(ref.decision_id).toBe('run1:OPTIMIZE:v0');
    expect(ref.recommended_candidate).toBe('A');
    expect(ref.ranking_top).toEqual(['A', 'B', 'C']);
    expect(ref.trip_run_id_hint).toBe('tr_abc');
  });

  it('returns undefined when DSO has no cgusDecisionTrace', () => {
    expect(
      projectCgusTripReviewRefFromDecisionState({
        optimizationHints: { method: 'HEURISTIC' },
      } as any),
    ).toBeUndefined();
  });

  it('dual-writes ref onto conversation_turn_result and payload', () => {
    const ref = projectCgusTripReviewRefFromTrace(trace, { trip_run_id: 'tr_1' });
    const payload = attachConversationTurnResultToPayload({
      request_id: 'r1',
      trip_id: 't1',
      answer_text: 'ok',
      result_status: 'SUCCESS',
      payload: { trusted_delivery_v1: { delivery_verdict: 'VERIFIED' } },
      cgus_trip_review: ref,
    });
    expect((payload as any).cgus_trip_review_v1.decision_id).toBe(trace.decision_id);
    expect((payload as any).conversation_turn_result.cgus_trip_review.recommended_candidate).toBe(
      'A',
    );
  });
});
