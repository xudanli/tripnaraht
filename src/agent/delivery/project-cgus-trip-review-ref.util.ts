/**
 * CGUS Trip Review 交付投影（对话出站）。
 * 只暴露 iOS / 运营回写所需的 ref，不改 EU 公式。
 */

import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { CgusDecisionTraceV1 } from '../../trips/decision/optimization/cgus-decision-trace.types';

export const CGUS_TRIP_REVIEW_REF_SCHEMA_ID = 'tripnara.cgus_trip_review_ref@v1' as const;

/** 对话 / observability 上的轻量指针（非完整 Trace） */
export type CgusTripReviewRefV1 = {
  schema_id: typeof CGUS_TRIP_REVIEW_REF_SCHEMA_ID;
  decision_id: string;
  trip_id: string;
  decision_type: string;
  recommended_candidate?: string;
  /** Top-N 候选 id，便于 OVERRIDE 选其它选项 */
  ranking_top: string[];
  top1_margin?: number;
  /**
   * 回写 path 参数提示：优先 durable_trip_run_id。
   * `POST /api/decision/cgus/trip-review/{trip_run_id_hint}/action`
   */
  trip_run_id_hint?: string | null;
};

export function projectCgusTripReviewRefFromTrace(
  trace: CgusDecisionTraceV1,
  opts?: { trip_run_id?: string | null },
): CgusTripReviewRefV1 {
  return {
    schema_id: CGUS_TRIP_REVIEW_REF_SCHEMA_ID,
    decision_id: trace.decision_id,
    trip_id: trace.trip_id,
    decision_type: trace.decision_type,
    recommended_candidate: trace.recommended_candidate,
    ranking_top: (trace.ranking ?? []).slice(0, 5),
    top1_margin: trace.top1_margin,
    trip_run_id_hint: opts?.trip_run_id?.trim() || null,
  };
}

export function projectCgusTripReviewRefFromDecisionState(
  dso: DecisionState | undefined | null,
  opts?: { trip_run_id?: string | null },
): CgusTripReviewRefV1 | undefined {
  const trace = dso?.optimizationHints?.cgusDecisionTrace;
  if (!trace?.decision_id) return undefined;
  return projectCgusTripReviewRefFromTrace(trace, opts);
}
