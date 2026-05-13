import type {
  ComplianceExperienceAxis,
  DecisionLogCognitiveSlice,
  UserCognitiveProfile,
} from './user-cognitive-profile.types';
import { USER_COGNITIVE_PROFILE_SCHEMA_VERSION } from './user-cognitive-profile.types';
import {
  COGNITIVE_NEGATIVE_FEEDBACK_TAGS,
  MEMORY_REPLAY_DECISION_SOURCE,
  MEMORY_REPLAY_REJECTION_FEEDBACK_PENALTY,
} from './memory-replay.constants';

const NEGATIVE_TAG_SET = new Set<string>(COGNITIVE_NEGATIVE_FEEDBACK_TAGS);

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function clampAxis(x: number): ComplianceExperienceAxis {
  if (!Number.isFinite(x)) return 0;
  return Math.max(-1, Math.min(1, x));
}

function sortSlicesChrono(slices: readonly DecisionLogCognitiveSlice[]): DecisionLogCognitiveSlice[] {
  return [...slices].sort((a, b) => {
    const c = a.timestamp.localeCompare(b.timestamp);
    if (c !== 0) return c;
    return a.step.localeCompare(b.step);
  });
}

function narrateConfidenceFromConflict(conflictCount: number | undefined): number {
  if (typeof conflictCount !== 'number' || conflictCount <= 0) return 1;
  return clamp01(1 / (1 + 0.15 * conflictCount));
}

function normalizeAllowedTags(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === 'string' && NEGATIVE_TAG_SET.has(t));
}

function sliceHasNegativeUserFeedback(s: DecisionLogCognitiveSlice): boolean {
  const u = normalizeAllowedTags(s.metadata?.user_feedback_tags);
  const r = normalizeAllowedTags(s.metadata?.research_audit_tags);
  return u.length > 0 || r.length > 0;
}

function sliceUsesMemoryReplayDecisionSource(s: DecisionLogCognitiveSlice): boolean {
  return s.metadata?.decision_source === MEMORY_REPLAY_DECISION_SOURCE;
}

function isMemoryReplayAxisNarrate(s: DecisionLogCognitiveSlice): boolean {
  if (s.step !== 'NARRATE') return false;
  if (!sliceUsesMemoryReplayDecisionSource(s)) return false;
  const ebp = s.metadata?.ebp_stance;
  return ebp === 'COMPLIANCE_FIRST' || ebp === 'COMMERCE_OVER_EXPERIENCE';
}

/**
 * 若 `narrateRow` 为带 MEMORY_REPLAY 的立场化 NARRATE，且在时间序上其后存在含否定标签的切片，则施加惩罚项。
 */
function isMemoryReplayFollowedByUserNegative(
  orderedAll: readonly DecisionLogCognitiveSlice[],
  narrateRow: DecisionLogCognitiveSlice,
): boolean {
  const i = orderedAll.indexOf(narrateRow);
  if (i < 0) return false;
  for (let j = i + 1; j < orderedAll.length; j++) {
    if (sliceHasNegativeUserFeedback(orderedAll[j]!)) return true;
  }
  return false;
}

function complianceExperienceAxisWeighted(
  narrate: readonly DecisionLogCognitiveSlice[],
  orderedAll: readonly DecisionLogCognitiveSlice[],
): ComplianceExperienceAxis {
  let num = 0;
  let den = 0;
  for (const s of narrate) {
    const ebp = s.metadata?.ebp_stance;
    if (ebp !== 'COMPLIANCE_FIRST' && ebp !== 'COMMERCE_OVER_EXPERIENCE') continue;
    const stanceVal = ebp === 'COMPLIANCE_FIRST' ? 1 : -1;
    const conf = narrateConfidenceFromConflict(s.metadata?.conflict_count);
    let penalty = 1;
    if (sliceUsesMemoryReplayDecisionSource(s) && isMemoryReplayFollowedByUserNegative(orderedAll, s)) {
      penalty = MEMORY_REPLAY_REJECTION_FEEDBACK_PENALTY;
    }
    const term = stanceVal * conf * penalty;
    num += term;
    den += Math.abs(stanceVal * conf * penalty);
  }
  if (den === 0) return 0;
  return clampAxis(num / den);
}

/**
 * 从已脱敏的 DecisionLog 切片提炼 `UserCognitiveProfile`（确定性、可单测）。
 * - 仅统计 `step === 'NARRATE'` 且 metadata 中含 3.0 叙事字段的条目计入 `evidence_weight` 与 stitch 代理。
 * - 合规—体验轴：对 CF / COE 使用加权；若 `decision_source === MEMORY_REPLAY` 且时间序后出现
 *   `user_feedback_tags` / `research_audit_tags` 中的否定短码（见 `COGNITIVE_NEGATIVE_FEEDBACK_TAGS`），
 *   对该条应用 `MEMORY_REPLAY_REJECTION_FEEDBACK_PENALTY`（反向扣分）。
 * - 不访问用户 message、inputs_summary、outputs_summary 等自由文本。
 */
export function deriveUserCognitiveProfileFromDecisionSignals(
  subjectRef: string,
  slices: readonly DecisionLogCognitiveSlice[],
  opts?: { maxLookback?: number; nowIso?: string },
): UserCognitiveProfile {
  const max = opts?.maxLookback ?? 50;
  const orderedAll = sortSlicesChrono(slices);
  const narrate = orderedAll.filter((s) => s.step === 'NARRATE').slice(-max);

  let narrate_compliance_first_hits = 0;
  let narrate_commerce_over_experience_hits = 0;
  let narrate_stitch_transparency_voice_hits = 0;
  let conflictSum = 0;
  let conflictN = 0;

  for (const s of narrate) {
    const ebp = s.metadata?.ebp_stance;
    if (ebp === 'COMPLIANCE_FIRST') narrate_compliance_first_hits += 1;
    if (ebp === 'COMMERCE_OVER_EXPERIENCE') narrate_commerce_over_experience_hits += 1;
    const vt = s.metadata?.effective_voice_tone;
    if (vt === 'reassuring_transparency') narrate_stitch_transparency_voice_hits += 1;
    const cc = s.metadata?.conflict_count;
    if (typeof cc === 'number' && cc > 0) {
      conflictSum += cc;
      conflictN += 1;
    }
  }

  const compliance_experience_axis = complianceExperienceAxisWeighted(narrate, orderedAll);

  const mean_conflict_count_when_nonzero = conflictN > 0 ? conflictSum / conflictN : null;

  const stitch_transparency_exposure_proxy = clamp01(
    narrate.length === 0 ? 0 : narrate_stitch_transparency_voice_hits / narrate.length,
  );

  let memory_replay_axis_narrate_hits = 0;
  let memory_replay_penalized_hits = 0;
  for (const s of narrate) {
    if (!isMemoryReplayAxisNarrate(s)) continue;
    memory_replay_axis_narrate_hits += 1;
    if (isMemoryReplayFollowedByUserNegative(orderedAll, s)) memory_replay_penalized_hits += 1;
  }

  const negative_feedback_proxy = clamp01(
    memory_replay_axis_narrate_hits === 0 ? 0 : memory_replay_penalized_hits / memory_replay_axis_narrate_hits,
  );

  const price_sensitivity_proxy = clamp01(0);

  return {
    schema_version: USER_COGNITIVE_PROFILE_SCHEMA_VERSION,
    subject_ref: subjectRef,
    updated_at: opts?.nowIso ?? new Date().toISOString(),
    evidence_weight: narrate.length,
    compliance_experience_axis,
    price_sensitivity_proxy,
    stitch_transparency_exposure_proxy,
    negative_feedback_proxy,
    derivation: {
      narrate_compliance_first_hits,
      narrate_commerce_over_experience_hits,
      narrate_stitch_transparency_voice_hits,
      mean_conflict_count_when_nonzero,
      memory_replay_axis_narrate_hits,
      memory_replay_penalized_hits,
    },
  };
}
