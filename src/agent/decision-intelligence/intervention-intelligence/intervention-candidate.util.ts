/**
 * InterventionCandidate — 正式冻结契约。
 * Useful Information ≠ Worth Interrupting。
 * Shadow 三级：DO_NOT_SURFACE / SURFACE_PASSIVELY / INTERRUPT_CANDIDATE；不通知用户。
 */

import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';

export const INTERVENTION_CANDIDATE_FROZEN_SCHEMA =
  'nara.intervention_candidate@v1' as const;

export type InterventionSurfaceLevelV1 =
  | 'DO_NOT_SURFACE'
  | 'SURFACE_PASSIVELY'
  | 'INTERRUPT_CANDIDATE';

export type InterventionCandidateV1 = {
  schemaId: typeof INTERVENTION_CANDIDATE_FROZEN_SCHEMA;
  version: 1;
  candidateId: string;
  scenarioId: TemporalScenarioId;
  tripId: string;
  /** 同一风险事件键（Dedup / Active State 用） */
  riskEventKey: string;
  createdAt: string;
  severity: number;
  urgency: number;
  confidence: number;
  actionability: number;
  actionableLeadTimeHours: number;
  disruptionCost: number;
  surfaceLevel: InterventionSurfaceLevelV1;
  /** Shadow：永不通知 */
  notifyUser: false;
  pushForbidden: true;
  autoActionForbidden: true;
  autoApplyForbidden: true;
  usefulInformationIsNotWorthInterrupting: true;
  rationaleZh: string;
};

export type FreezeInterventionCandidateInput = {
  scenarioId: TemporalScenarioId;
  tripId: string;
  riskEventKey: string;
  severity: number;
  urgency: number;
  confidence: number;
  actionability: number;
  actionableLeadTimeHours: number;
  disruptionCost: number;
  createdAt?: string;
  candidateId?: string;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * 冻结 Candidate 并分级。有用信息 ≠ 值得打断。
 */
export function freezeInterventionCandidate(
  input: FreezeInterventionCandidateInput,
): InterventionCandidateV1 {
  const severity = clamp01(input.severity);
  const urgency = clamp01(input.urgency);
  const confidence = clamp01(input.confidence);
  const actionability = clamp01(input.actionability);
  const disruptionCost = clamp01(input.disruptionCost);
  const lead = Math.max(0, input.actionableLeadTimeHours);

  const interruptValue =
    severity * 0.22 +
    urgency * 0.22 +
    actionability * 0.22 +
    confidence * 0.14 +
    Math.min(1, lead / 24) * 0.1 -
    disruptionCost * 0.4;

  let surfaceLevel: InterventionSurfaceLevelV1;
  let rationaleZh: string;

  if (
    disruptionCost >= 0.75 ||
    actionability < 0.25 ||
    confidence < 0.35 ||
    lead < 1 ||
    interruptValue < 0.15
  ) {
    surfaceLevel = 'DO_NOT_SURFACE';
    rationaleZh = `DO_NOT_SURFACE：打扰过高/不可行动/置信不足/无有效 lead（value=${interruptValue.toFixed(2)}）`;
  } else if (
    interruptValue >= 0.38 &&
    actionability >= 0.5 &&
    disruptionCost <= 0.55 &&
    urgency >= 0.45 &&
    lead >= 2
  ) {
    surfaceLevel = 'INTERRUPT_CANDIDATE';
    rationaleZh = `INTERRUPT_CANDIDATE：Shadow 候选打断（value=${interruptValue.toFixed(2)}）；不通知用户`;
  } else {
    surfaceLevel = 'SURFACE_PASSIVELY';
    rationaleZh = `SURFACE_PASSIVELY：有用但不足以打断（Useful ≠ Worth Interrupting；value=${interruptValue.toFixed(2)}）`;
  }

  return {
    schemaId: INTERVENTION_CANDIDATE_FROZEN_SCHEMA,
    version: 1,
    candidateId:
      input.candidateId ??
      `ic_${input.scenarioId}_${input.riskEventKey}_${Date.now()}`,
    scenarioId: input.scenarioId,
    tripId: input.tripId,
    riskEventKey: input.riskEventKey,
    createdAt: input.createdAt ?? new Date().toISOString(),
    severity,
    urgency,
    confidence,
    actionability,
    actionableLeadTimeHours: lead,
    disruptionCost,
    surfaceLevel,
    notifyUser: false,
    pushForbidden: true,
    autoActionForbidden: true,
    autoApplyForbidden: true,
    usefulInformationIsNotWorthInterrupting: true,
    rationaleZh,
  };
}
