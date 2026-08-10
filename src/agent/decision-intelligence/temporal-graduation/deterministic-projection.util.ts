/**
 * Deterministic / rule-based Temporal Projection（Shadow）。
 * 不引入复杂预测模型 / Causal Model / 通用 Temporal Runtime。
 */

import type { TravelWorldStateV1 } from '../../state-learning/travel-world-state.types';
import type { EvidenceFactV1 } from '../../harness/hardening/evidence.contract';
import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';
import { getTemporalScenarioContract } from './temporal-scenario-contract.util';
import type { TemporalAuthorizationV1 } from './select-qualified-scenario.util';
import {
  requireShadowAuthorization,
  type TemporalImpactV1,
  type TemporalImpactDirection,
} from './temporal-impact.util';

export type DeterministicProjectionInput = {
  auth: TemporalAuthorizationV1;
  scenarioId: TemporalScenarioId;
  worldState: TravelWorldStateV1;
  evidence: EvidenceFactV1[];
  now?: string;
};

function hasEvidenceKey(evidence: EvidenceFactV1[], re: RegExp): boolean {
  return evidence.some(
    (e) => re.test(e.key) || re.test(e.valueZh),
  );
}

/**
 * 规则投影：仅返回 TemporalImpact（预测），不决策、不动作。
 */
export function projectTemporalImpactDeterministic(
  input: DeterministicProjectionInput,
): TemporalImpactV1 {
  requireShadowAuthorization(input.auth);
  if (input.auth.scenarioId !== input.scenarioId) {
    throw new Error('[TemporalProjection] scenario_mismatch_with_authorization');
  }
  const contract = getTemporalScenarioContract(input.scenarioId);
  const now = input.now ?? new Date().toISOString();

  let direction: TemporalImpactDirection = 'STABLE';
  let onsetHours: number | null = null;
  let deadlineHours: number | null = null;
  let ruleId = 'rule_stable_default';
  let summaryZh = '规则投影：Horizon 内节奏/负载未见恶化信号';

  if (input.scenarioId === 'pace_day_sequence') {
    const fatigue =
      hasEvidenceKey(input.evidence, /fatigue|疲劳|赶场|过载|skip|rushed/i) ||
      (input.worldState.booking.missingLodgingDays?.length ?? 0) > 0;
    const packed =
      hasEvidenceKey(input.evidence, /packed|紧凑|满程/) ||
      (input.worldState.plan.daySummariesZh?.some((s) => /满|多|紧/.test(s)) ??
        false);
    if (fatigue && packed) {
      direction = 'WORSENING';
      onsetHours = 12;
      deadlineHours = 36;
      ruleId = 'pace_fatigue_and_packed';
      summaryZh = '规则投影：疲劳+紧凑日程 → 48h 内节奏恶化风险上升';
    } else if (fatigue || packed) {
      direction = 'WORSENING';
      onsetHours = 24;
      deadlineHours = 48;
      ruleId = 'pace_single_stressor';
      summaryZh = '规则投影：单一压力信号 → 可能恶化';
    }
  } else if (input.scenarioId === 'arrival_day_recovery') {
    if (hasEvidenceKey(input.evidence, /晚到|延误|overload|过载|arrival/i)) {
      direction = 'WORSENING';
      onsetHours = 6;
      deadlineHours = 24;
      ruleId = 'arrival_late_or_overload';
      summaryZh = '规则投影：抵达日负载偏高 → 恢复窗口承压';
    }
  } else if (input.scenarioId === 'accommodation_move_chain') {
    if (hasEvidenceKey(input.evidence, /换住|搬|transfer|movement/i)) {
      direction = 'WORSENING';
      onsetHours = 24;
      deadlineHours = 72;
      ruleId = 'move_chain_friction';
      summaryZh = '规则投影：换住链条可能增加摩擦';
    }
  } else if (input.scenarioId === 'experience_slotting') {
    if (hasEvidenceKey(input.evidence, /冲突|满|冲突槽|slot/i)) {
      direction = 'WORSENING';
      onsetHours = 12;
      deadlineHours = 48;
      ruleId = 'experience_slot_conflict';
      summaryZh = '规则投影：体验穿插可能冲突';
    }
  }

  const visibility =
    input.auth.mode === 'USER_VISIBLE_TEMPORAL'
      ? 'USER_VISIBLE_TEMPORAL'
      : 'SHADOW';

  return {
    schemaId: 'nara.temporal_impact@v1',
    version: 1,
    impactId: `timp_${input.scenarioId}_${Date.now()}`,
    scenarioId: input.scenarioId,
    projectedAt: now,
    horizonHours: contract.horizonHours,
    onsetHours,
    deadlineHours,
    direction,
    summaryZh,
    ruleId,
    isPrediction: true,
    isDecision: false,
    visibility,
    mayTriggerAdjustment: false,
    mayBypassHarness: false,
    evidenceRefs: input.evidence.map((e) => e.key),
  };
}
