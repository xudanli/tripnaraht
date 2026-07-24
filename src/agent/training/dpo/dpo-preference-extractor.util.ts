/**
 * PR-C：从 DecisionTrajectoryV1 构造 DPO 偏好对（Planner 服从 + 辩论叙事对齐）。
 */

import type { Itinerary } from '../../interfaces/trip-plan.interface';
import type {
  DecisionTrajectoryETLRow,
  DpoPreferenceJsonlRecord,
  DpoPairKind,
  PlannerRejectedSource,
} from '../interfaces/decision-trajectory-etl.types';
import type {
  DecisionTrajectoryV1,
  RedactedDebateArtifact,
} from '../interfaces/decision-trajectory.types';
import { DECISION_TRAJECTORY_SCHEMA_ID } from '../interfaces/decision-trajectory.types';

function clampStr(s: unknown, max = 12000): string {
  const t = typeof s === 'string' ? s : JSON.stringify(s ?? '');
  return t.length <= max ? t : `${t.slice(0, max)}…[truncated]`;
}

export function serializePlannerPrompt(ctx: DecisionTrajectoryV1['input_context']): string {
  return clampStr({
    schema: 'tripnara.planner_dpo_prompt@v1',
    hard_constraints: ctx.hard_constraints ?? [],
    operational_negative_constraints: ctx.operational_negative_constraints ?? {},
    world_state_digest: ctx.world_state_digest ?? {},
    trip_id: ctx.trip_id,
  });
}

export function serializeItinerary(itinerary: Itinerary | undefined): string | null {
  if (!itinerary?.days?.length) return null;
  return clampStr(itinerary);
}

function orchestrationIndicatesPlanFailure(payload: DecisionTrajectoryV1): boolean {
  const steps = payload.orchestration_steps ?? [];
  const gateBlocked = payload.axiom_gate.gate_result === 'BLOCK';
  const hadRepair = steps.some((s) => s.step === 'REPAIR');
  const verifyFail = steps.some((s) => s.step === 'VERIFY' && s.status === 'FAILED');
  const planFail = steps.some((s) => s.step === 'PLAN_GEN' && s.status === 'FAILED');
  return gateBlocked || hadRepair || verifyFail || planFail;
}

/**
 * 无中间 itinerary 草稿时，用违规公理 + 失败步序构造 Rejected 代理（Planner Obedience 负样本）。
 */
export function buildPlannerRejectedSurrogate(payload: DecisionTrajectoryV1): string | null {
  if (!orchestrationIndicatesPlanFailure(payload)) return null;
  const violations = payload.axiom_gate.violations ?? [];
  const adjustments = payload.axiom_gate.required_adjustments ?? [];
  if (!violations.length && !adjustments.length && payload.axiom_gate.gate_result !== 'BLOCK') {
    return null;
  }

  const failureSteps = (payload.orchestration_steps ?? [])
    .filter((s) => s.status === 'FAILED' || s.step === 'REPAIR' || s.step === 'VERIFY')
    .map((s) => ({
      step: s.step,
      status: s.status,
      harness_run_status: s.harness_run_status,
    }));

  return clampStr({
    surrogate_type: 'planner_defect_v1',
    gate_result: payload.axiom_gate.gate_result,
    triggered_axiom_ids: payload.axiom_gate.triggered_axiom_ids ?? [],
    violations: violations.slice(0, 12).map((v) => ({
      type: (v as { type?: string }).type,
      severity: (v as { severity?: string }).severity,
      detail: (v as { detail?: string }).detail,
    })),
    required_adjustments: adjustments.slice(0, 8),
    failure_steps: failureSteps,
  });
}

/**
 * PR-D：优先真拓扑对比；无 draft 时回退违规代理（PR-C）。
 */
export function resolvePlannerRejected(
  payload: DecisionTrajectoryV1,
): { rejected: string; rejected_source: PlannerRejectedSource } | null {
  const chosen = serializeItinerary(payload.final_output?.itinerary);
  const draftTopology = serializeItinerary(payload.plan_gen_draft_itinerary);

  if (draftTopology && chosen && draftTopology !== chosen) {
    return { rejected: draftTopology, rejected_source: 'true_topology' };
  }

  const surrogate = buildPlannerRejectedSurrogate(payload);
  if (surrogate) {
    return { rejected: surrogate, rejected_source: 'violation_surrogate' };
  }

  return null;
}

export function extractPlannerObediencePair(
  row: DecisionTrajectoryETLRow,
): DpoPreferenceJsonlRecord | null {
  const payload = row.payload;
  if (payload.schema_id !== DECISION_TRAJECTORY_SCHEMA_ID) return null;

  const chosen = serializeItinerary(payload.final_output?.itinerary);
  const rejectedPack = resolvePlannerRejected(payload);
  if (!chosen || !rejectedPack || chosen === rejectedPack.rejected) return null;

  return {
    prompt: serializePlannerPrompt(payload.input_context),
    chosen,
    rejected: rejectedPack.rejected,
    trajectory_id: row.id,
    request_id: row.requestId,
    pair_type: 'planner_obedience',
    rejected_source: rejectedPack.rejected_source,
  };
}

export function buildDebateRejectedSurrogate(debate: RedactedDebateArtifact): string | null {
  const { abu, dr_dre, neptune } = debate.guardian_votes_redacted;
  const abuBlocks = abu.vote === 'BLOCK';
  const tieBreak = debate.tie_break_used === true;
  if (!abuBlocks && !tieBreak) return null;

  const conflicting: string[] = [];
  if (neptune?.vote === 'WARN' || neptune?.vote === 'PASS') {
    conflicting.push(neptune.reason);
  }
  if (dr_dre.vote === 'WARN') {
    conflicting.push(dr_dre.reason);
  }

  return clampStr({
    surrogate_type: 'debate_overruled_v1',
    abu_block_reason: abu.reason,
    tie_break_used: tieBreak,
    debate_gate_fusion: debate.debate_gate_fusion,
    conflicting_narrative_hints: conflicting,
    guardian_votes: {
      abu: abu.vote,
      dr_dre: dr_dre.vote,
      neptune: neptune?.vote,
    },
  });
}

export function extractDebateNarratorPair(
  row: DecisionTrajectoryETLRow,
): DpoPreferenceJsonlRecord | null {
  const debate = row.payload.debate_history;
  if (!debate?.prompts_redacted || !debate.raw_completion_redacted?.trim()) return null;

  const chosen = clampStr(debate.raw_completion_redacted);
  const rejected = buildDebateRejectedSurrogate(debate);
  if (!rejected) {
    if (debate.guardian_votes_redacted.abu.vote !== 'BLOCK' && !debate.tie_break_used) {
      return null;
    }
    return null;
  }
  if (chosen === rejected) return null;

  const prompt = clampStr({
    schema: 'tripnara.debate_dpo_prompt@v1',
    system_prompt: debate.prompts_redacted.system_prompt,
    user_prompt: debate.prompts_redacted.user_prompt,
  });

  return {
    prompt,
    chosen,
    rejected: rejected ?? clampStr({ note: 'abu_reject_without_surrogate', abu: debate.guardian_votes_redacted.abu }),
    trajectory_id: row.id,
    request_id: row.requestId,
    pair_type: 'debate_narrator',
  };
}

/**
 * 每条 DecisionTrajectory 最多产出 0–2 条 DPO（Planner + Debate）。
 */
export function extractDpoPreferencesFromDecisionTrajectories(
  rows: DecisionTrajectoryETLRow[],
): DpoPreferenceJsonlRecord[] {
  const out: DpoPreferenceJsonlRecord[] = [];

  for (const row of rows) {
    if (row.status !== 'FINALIZED') continue;
    if (row.orchestrationOutcome === 'CRITICAL_FAIL') continue;

    const planner = extractPlannerObediencePair(row);
    if (planner) out.push(planner);

    const debate = extractDebateNarratorPair(row);
    if (debate) out.push(debate);
  }

  return out;
}

/** 与 legacy `trajectoriesToDpoPreferenceRecords` 输出字段兼容（补 pair_type）。 */
export function dpoRecordsToLegacyShape(
  records: DpoPreferenceJsonlRecord[],
): Array<Omit<DpoPreferenceJsonlRecord, 'pair_type'>> {
  return records.map(({ pair_type: _p, ...rest }) => rest);
}
