/**
 * TemporalImpact — 统一输出；isPrediction=true / isDecision=false。
 * 只能作为 Decision Runtime 的输入证据，禁止绕过 Harness 形成 Action。
 */

import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';
import type { TemporalAuthorizationV1 } from './select-qualified-scenario.util';

export const TEMPORAL_IMPACT_SCHEMA = 'nara.temporal_impact@v1' as const;

export type TemporalImpactDirection = 'WORSENING' | 'STABLE' | 'IMPROVING' | 'UNKNOWN';

export type TemporalImpactV1 = {
  schemaId: typeof TEMPORAL_IMPACT_SCHEMA;
  version: 1;
  impactId: string;
  scenarioId: TemporalScenarioId;
  projectedAt: string;
  horizonHours: number;
  onsetHours?: number | null;
  deadlineHours?: number | null;
  direction: TemporalImpactDirection;
  summaryZh: string;
  ruleId: string;
  /** 显式：预测 ≠ 决策 */
  isPrediction: true;
  isDecision: false;
  /** Shadow 默认不可见 */
  visibility: 'SHADOW' | 'USER_VISIBLE_TEMPORAL';
  mayTriggerAdjustment: false;
  mayBypassHarness: false;
  evidenceRefs: string[];
};

export type TemporalImpactHarnessBinding =
  | { ok: true; role: 'DECISION_RUNTIME_EVIDENCE_ONLY' }
  | {
      ok: false;
      code: 'TEMPORAL_CANNOT_FORM_ACTION';
      reason: string;
    };

/** TemporalImpact 禁止直接变成 Action */
export function assertTemporalImpactAsEvidenceOnly(
  impact: TemporalImpactV1,
  intendedUse:
    | 'DECISION_RUNTIME_EVIDENCE'
    | 'DIRECT_ACTION'
    | 'USER_PUSH'
    | 'AUTO_REPLAN',
): TemporalImpactHarnessBinding {
  if (intendedUse !== 'DECISION_RUNTIME_EVIDENCE') {
    return {
      ok: false,
      code: 'TEMPORAL_CANNOT_FORM_ACTION',
      reason: `temporal_impact_forbidden_use:${intendedUse};must_go_through_harness_decision_runtime`,
    };
  }
  if (impact.isDecision !== false || impact.isPrediction !== true) {
    return {
      ok: false,
      code: 'TEMPORAL_CANNOT_FORM_ACTION',
      reason: 'temporal_impact_must_be_prediction_not_decision',
    };
  }
  if (impact.mayBypassHarness !== false || impact.mayTriggerAdjustment !== false) {
    return {
      ok: false,
      code: 'TEMPORAL_CANNOT_FORM_ACTION',
      reason: 'temporal_impact_flags_forbid_bypass_or_adjust',
    };
  }
  return { ok: true, role: 'DECISION_RUNTIME_EVIDENCE_ONLY' };
}

export function assertTemporalImpactAsEvidenceOnlyOrThrow(
  impact: TemporalImpactV1,
  intendedUse: Parameters<typeof assertTemporalImpactAsEvidenceOnly>[1],
): void {
  const r = assertTemporalImpactAsEvidenceOnly(impact, intendedUse);
  if (r.ok === false) {
    throw new Error(`[TemporalImpact] ${r.code}: ${r.reason}`);
  }
}

export function requireShadowAuthorization(
  auth: TemporalAuthorizationV1,
): void {
  if (!auth.authorized || auth.mode === 'NONE') {
    throw new Error(
      '[TemporalGraduation] not_authorized:Scenario Qualified ≠ Temporal Authorized',
    );
  }
  if (auth.proactiveEnabled) {
    throw new Error('[TemporalGraduation] proactive_must_remain_closed');
  }
}
