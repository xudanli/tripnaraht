/**
 * 从 CGUSSearchResult 投影 Decision Trace 的「排序侧」字段。
 * 不填充 user_action / outcome / regret（由 Trip Review 后写）。
 *
 * V1：打全可观测 ranking/utility；不为对齐图 13 发明缺失维度。
 */

import type { CGUSSearchResult } from './cgus-search.service';
import {
  CGUS_DECISION_TRACE_SCHEMA_VERSION,
  type CgusCandidateUtilityBreakdownV1,
  type CgusDecisionTraceV1,
} from './cgus-decision-trace.types';

/** 将维度得分 + 惩罚压成 Trace 分项（供 cgus-search 挂到 ranked 行） */
export function buildCgusUtilityBreakdown(input: {
  safety?: number;
  experience?: number;
  philosophy?: number;
  timeSlack?: number;
  riskPenalty?: number;
  /** 未提供时记 0（KNOWN_GAP 显式可观测） */
  budgetPenalty?: number;
}): CgusCandidateUtilityBreakdownV1 {
  const timeSlack = input.timeSlack;
  return {
    safety: input.safety,
    experience: input.experience,
    philosophy: input.philosophy,
    risk_penalty: input.riskPenalty,
    budget_penalty: input.budgetPenalty ?? 0,
    time_penalty:
      typeof timeSlack === 'number' && Number.isFinite(timeSlack)
        ? Math.max(0, Math.min(1, 1 - timeSlack))
        : undefined,
  };
}

export function projectCgusDecisionTraceFromSearchResult(input: {
  decision_id: string;
  trip_id: string;
  decision_type: string;
  result: CGUSSearchResult;
  /** 硬约束/掩码原因（可选，来自上游） */
  hard_constraint_reasons?: string[];
  /** Policy 快照 provenance（可选） */
  policyProvenance?: {
    contractVersion?: number;
    policyVersion?: number;
    policySource?: string;
    effectiveConstraints?: string[];
    effectiveObjectives?: string[];
    executionAuthorityExcludedFromScoring?: true;
  };
}): CgusDecisionTraceV1 {
  const { result } = input;
  const ranked = result.rankedCandidates ?? [];
  const candidate_ids = ranked.map((r) => r.candidate.id);
  const ranking = [...candidate_ids];

  const feasibleCount = ranked.filter((r) => r.candidate.feasible).length;
  let hard_constraint_result: CgusDecisionTraceV1['hard_constraint_result'];
  if (result.emergencyMaskAudit) {
    hard_constraint_result = 'masked';
  } else if (feasibleCount === 0) {
    hard_constraint_result = 'none_feasible';
  } else if (feasibleCount < ranked.length) {
    hard_constraint_result = 'partial';
  } else {
    hard_constraint_result = 'all_feasible';
  }

  const candidate_scores: Record<string, CgusCandidateUtilityBreakdownV1> = {};
  for (const r of ranked) {
    const id = r.candidate.id;
    candidate_scores[id] = {
      ...(r.utilityBreakdown ?? {}),
      utility: r.utility,
      expected_utility: r.expectedUtility ?? r.utility,
    };
  }

  let top1_margin: number | undefined;
  if (ranked.length >= 2) {
    const u0 = ranked[0].expectedUtility ?? ranked[0].utility;
    const u1 = ranked[1].expectedUtility ?? ranked[1].utility;
    if (Number.isFinite(u0) && Number.isFinite(u1)) {
      top1_margin = u0 - u1;
    }
  }

  const hard_constraint_reasons = [
    ...(input.hard_constraint_reasons ?? []),
    ...(result.emergencyMaskAudit?.forbidden_modes?.map((m) => `forbidden_mode:${m}`) ?? []),
    ...ranked.flatMap((r) =>
      (r.candidate.constraintViolations ?? [])
        .filter((v) => v.severity === 'HARD' && (v.degree ?? 0) > 0)
        .map((v) => `${r.candidate.id}:${v.type}`),
    ),
  ];

  return {
    schemaVersion: CGUS_DECISION_TRACE_SCHEMA_VERSION,
    decision_id: input.decision_id,
    trip_id: input.trip_id,
    decision_type: input.decision_type,
    candidate_ids,
    hard_constraint_result,
    hard_constraint_reasons,
    candidate_scores,
    ranking,
    top1_margin,
    recommended_candidate: result.recommended?.id ?? ranking[0],
    ...(input.policyProvenance?.contractVersion != null
      ? { contractVersion: input.policyProvenance.contractVersion }
      : {}),
    ...(input.policyProvenance?.policyVersion != null
      ? { policyVersion: input.policyProvenance.policyVersion }
      : {}),
    ...(input.policyProvenance?.policySource
      ? { policySource: input.policyProvenance.policySource }
      : {}),
    ...(input.policyProvenance?.effectiveConstraints
      ? { effectiveConstraints: input.policyProvenance.effectiveConstraints }
      : {}),
    ...(input.policyProvenance?.effectiveObjectives
      ? { effectiveObjectives: input.policyProvenance.effectiveObjectives }
      : {}),
    ...(input.policyProvenance?.executionAuthorityExcludedFromScoring
      ? { executionAuthorityExcludedFromScoring: true as const }
      : {}),
  };
}
