/**
 * CGUS V1 Operational Validation — Decision Outcome Loop writeback.
 *
 * OPS-CGUS-01 Action → OPS-CGUS-02 Outcome/Regret → OPS-CGUS-03 Diagnosis
 *
 * 不修改 EU 公式；不把 Override 当成 failure。
 */

import type {
  CgusActualOutcomeV1,
  CgusDecisionRegret,
  CgusDecisionRootCause,
  CgusDecisionTraceV1,
  CgusDecisionUserAction,
  CgusRecommendationProblematic,
} from './cgus-decision-trace.types';

export class CgusOutcomeLoopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CgusOutcomeLoopError';
  }
}

function nowIso(at?: string): string {
  return at ?? new Date().toISOString();
}

/**
 * OPS-CGUS-01：回写用户决策动作。
 * ACCEPT ⇒ chosen = recommended；OVERRIDE ⇒ chosen 必须存在且 ≠ recommended。
 */
export function applyCgusUserActionWriteback(
  trace: CgusDecisionTraceV1,
  input: {
    user_action: CgusDecisionUserAction;
    chosen_candidate?: string;
    override_reason?: string;
    captured_at?: string;
  },
): CgusDecisionTraceV1 {
  const { user_action } = input;
  const recommended = trace.recommended_candidate;

  let chosen = input.chosen_candidate;

  if (user_action === 'ACCEPT') {
    if (!recommended) {
      throw new CgusOutcomeLoopError('ACCEPT requires recommended_candidate on trace');
    }
    chosen = recommended;
  } else if (user_action === 'OVERRIDE') {
    if (!chosen) {
      throw new CgusOutcomeLoopError('OVERRIDE requires chosen_candidate');
    }
    if (recommended && chosen === recommended) {
      throw new CgusOutcomeLoopError(
        'OVERRIDE chosen_candidate must differ from recommended_candidate (use ACCEPT)',
      );
    }
  } else if (user_action === 'REJECT_ALL' || user_action === 'NO_ACTION') {
    chosen = undefined;
  }

  return {
    ...trace,
    user_action,
    chosen_candidate: chosen,
    override_reason: input.override_reason,
    user_action_captured_at: nowIso(input.captured_at),
  };
}

/**
 * OPS-CGUS-02：回写事实 Outcome 与 Regret（二者分列；Override ≠ Regret）。
 */
export function applyCgusOutcomeWriteback(
  trace: CgusDecisionTraceV1,
  input: {
    actual_outcome: CgusActualOutcomeV1;
    decision_regret: CgusDecisionRegret;
    captured_at?: string;
  },
): CgusDecisionTraceV1 {
  return {
    ...trace,
    actual_outcome: { ...input.actual_outcome },
    decision_regret: input.decision_regret,
    outcome_captured_at: nowIso(input.captured_at),
  };
}

/**
 * OPS-CGUS-03：Trip Review 诊断。
 * recommendation_problematic=NO ⇒ root_cause 默认 NONE（可显式覆盖）。
 */
export function applyCgusTripReviewDiagnosis(
  trace: CgusDecisionTraceV1,
  input: {
    recommendation_problematic: CgusRecommendationProblematic;
    root_cause?: CgusDecisionRootCause;
    review_note?: string;
    reviewed_by: string;
    reviewed_at?: string;
  },
): CgusDecisionTraceV1 {
  let root_cause = input.root_cause;
  if (input.recommendation_problematic === 'NO' && root_cause === undefined) {
    root_cause = 'NONE';
  }
  if (input.recommendation_problematic === 'YES' && !root_cause) {
    throw new CgusOutcomeLoopError('problematic=YES requires root_cause');
  }
  if (input.recommendation_problematic === 'YES' && root_cause === 'NONE') {
    throw new CgusOutcomeLoopError('problematic=YES cannot use root_cause=NONE');
  }

  return {
    ...trace,
    recommendation_problematic: input.recommendation_problematic,
    root_cause,
    review_note: input.review_note,
    reviewed_by: input.reviewed_by,
    reviewed_at: nowIso(input.reviewed_at),
  };
}

/** Override 本身不是研发触发条件 */
export function isCgusOverrideAloneInsufficient(trace: CgusDecisionTraceV1): boolean {
  return trace.user_action === 'OVERRIDE' && !trace.root_cause;
}

/**
 * 仅当诊断确认且根因属于「错误推荐」桶时，才计入 Wrong Recommendation 运营指标。
 */
export function isCgusWrongRecommendation(trace: CgusDecisionTraceV1): boolean {
  if (trace.recommendation_problematic !== 'YES') return false;
  const rc = trace.root_cause;
  return rc === 'FEASIBILITY' || rc === 'UTILITY' || rc === 'WEIGHT';
}

/** 解冻 EU / L5 前的硬门：需要诊断 + 对应根因（调用方再叠加「重复案例」计数） */
export function mayEvidenceUnfreezeEuUtility(trace: CgusDecisionTraceV1): boolean {
  return (
    trace.recommendation_problematic === 'YES' &&
    trace.root_cause === 'UTILITY' &&
    (trace.decision_regret === 'MEDIUM' ||
      trace.decision_regret === 'HIGH' ||
      trace.user_action === 'OVERRIDE')
  );
}

export function mayEvidenceDiscussWeightLearning(trace: CgusDecisionTraceV1): boolean {
  return trace.recommendation_problematic === 'YES' && trace.root_cause === 'WEIGHT';
}

/**
 * 将 Outcome Loop 回写结果挂回 OptimizationHints（不可变替换）。
 * 供 Kernel / Agent / 运营 API 共用，不碰 CGUS 评分。
 */
export function patchHintsWithCgusDecisionTrace(
  hints: { cgusDecisionTrace?: CgusDecisionTraceV1 },
  next: CgusDecisionTraceV1,
): { cgusDecisionTrace: CgusDecisionTraceV1 } {
  if (
    hints.cgusDecisionTrace &&
    hints.cgusDecisionTrace.decision_id !== next.decision_id
  ) {
    throw new CgusOutcomeLoopError(
      `decision_id mismatch: hints=${hints.cgusDecisionTrace.decision_id} next=${next.decision_id}`,
    );
  }
  return { cgusDecisionTrace: next };
}
