import type { ClarificationQuestion } from '../interfaces/clarification.interface';
import type { GateResult, TripPlanRequest } from '../interfaces/trip-plan.interface';
import {
  buildGuardianDebateClarificationQuestion,
  sanitizeGuardianResultsForUnspecifiedVehicle,
} from './guardian-debate-user-surface.util';
import { extractGuardianDebateUserIntentAnchors } from './guardian-debate-user-intent-anchor.util';
import { resolveTripPlanNlMessage } from './marathon-intake-signals.util';

export type DebateGateFusionReason = 'abu_reject' | 'marathon_replace_confirm';

export interface DebateGateFusionResult {
  gate: GateResult;
  fused: boolean;
  reason?: DebateGateFusionReason;
}

/** 是否因三人格合议需要用户确认（短路 PLAN_GEN）。 */
export function shouldFuseDebateForUserConfirm(
  gate: GateResult,
  trip?: TripPlanRequest | null,
): boolean {
  const confirm = trip?.guardian_debate_trip_context?.debate_user_confirm;
  if (
    confirm?.question_id === 'guardian_debate_abu_reject_v1' &&
    confirm.choice === 'accept_neptune_alternative'
  ) {
    return false;
  }

  const gr = gate.guardian_results;
  if (!gr) return false;
  if (gr.abu?.verdict === 'REJECT') return true;

  const anchors =
    trip?.guardian_debate_trip_context?.user_intent_anchors ??
    extractGuardianDebateUserIntentAnchors(resolveTripPlanNlMessage(trip ?? undefined));
  if (!anchors?.midnight_sun_continuous_drive) return false;
  if (gr.neptune?.verdict !== 'REPLACE') return false;
  return gr.drdre?.verdict === 'REJECT' || gr.drdre?.verdict === 'ADJUST';
}

/**
 * 将三人格合议升格为门控 `NEED_USER_CONFIRM`（编排短路，不进入 PLAN_GEN）。
 * 若门控已为 BLOCK / NEED_USER_CONFIRM，或无合议确认需求，则不改动。
 */
export function fuseGuardianDebateVerdictIntoGate(
  gate: GateResult,
  trip?: TripPlanRequest | null,
): DebateGateFusionResult {
  if (gate.gate_result === 'BLOCK' || gate.gate_result === 'NEED_USER_CONFIRM') {
    return { gate, fused: false };
  }

  let gr = gate.guardian_results;
  if (!gr) {
    return { gate, fused: false };
  }

  gr = sanitizeGuardianResultsForUnspecifiedVehicle(gr, trip);
  const gateSanitized: GateResult = { ...gate, guardian_results: gr };

  if (!shouldFuseDebateForUserConfirm(gateSanitized, trip)) {
    return { gate: gateSanitized, fused: false };
  }

  const reason: DebateGateFusionReason =
    gr.abu?.verdict === 'REJECT' ? 'abu_reject' : 'marathon_replace_confirm';

  const abuDetail =
    gr.abu?.evidence?.find((e) => typeof e === 'string' && e.trim())?.trim() ??
    gr.drdre?.evidence?.find((e) => typeof e === 'string' && e.trim())?.trim() ??
    gr.debate_summary_zh?.trim() ??
    '三人格合议需确认强度或替代方案';

  const violations = [...(gate.violations ?? [])];
  const violationTag =
    reason === 'abu_reject' ? 'guardian_debate:abu_reject' : 'guardian_debate:marathon_confirm';
  if (!violations.some((v) => String(v.detail ?? '').includes(violationTag))) {
    violations.push({
      type: reason === 'abu_reject' ? 'SAFETY' : 'FATIGUE',
      severity: 'SOFT',
      detail: `[${violationTag}] ${abuDetail.slice(0, 480)}`,
    });
  }

  const adjustments = [...(gate.required_adjustments ?? [])];
  if (gr.neptune?.verdict === 'REPLACE') {
    const neptuneWhy = gr.neptune.evidence?.find((e) => typeof e === 'string' && e.trim())?.trim();
    if (neptuneWhy && !adjustments.some((a) => a.why === neptuneWhy)) {
      adjustments.push({
        action: 'REDUCE_SCOPE_OR_ADD_EVIDENCE',
        why: neptuneWhy,
      });
    }
  }

  return {
    gate: {
      ...gateSanitized,
      gate_result: 'NEED_USER_CONFIRM',
      violations,
      required_adjustments: adjustments,
      confidence: Math.min(gate.confidence ?? 0.8, 0.72),
    },
    fused: true,
    reason,
  };
}

/** Abu REJECT 短路时注入的澄清卡片（与 `buildClarificationResult` 对齐）。 */
export function buildGuardianDebateFusionClarificationQuestions(
  gate: GateResult,
  trip?: TripPlanRequest | null,
): ClarificationQuestion[] {
  return [buildGuardianDebateClarificationQuestion(gate, trip)];
}
