/**
 * Surface Pilot 入口 — 仅 Proactive Readiness Gate = PASS 可进真实 Surface Pilot。
 * 原则：Interrupt Candidate ≠ Notification Authorization。
 * 第一阶段仅 L1 PASSIVE；否则继续 Shadow。
 */

import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';
import type { ProactiveReadinessGateV1 } from '../intervention-intelligence/proactive-readiness-gate.util';
import type { InterventionCandidateV1 } from '../intervention-intelligence/intervention-candidate.util';

export type SurfacePilotLevel = 'SHADOW' | 'L1_PASSIVE' | 'L2_IN_APP_INTERRUPT';

export type SelectSurfacePilotResult =
  | {
      ok: true;
      scenarioId: TemporalScenarioId;
      level: 'L1_PASSIVE';
      interruptCandidateIsNotNotificationAuthorization: true;
      pushClosed: true;
      notificationClosed: true;
      autoActionClosed: true;
      reasonZh: string;
    }
  | {
      ok: false;
      action: 'CONTINUE_SHADOW';
      reason: 'PROACTIVE_READINESS_GATE_NOT_PASS';
      interruptCandidateIsNotNotificationAuthorization: true;
      reasonZh: string;
    };

/** Gate PASS = 三质量闸全过（≠ 通知授权） */
export function isProactiveReadinessGatePass(
  gate: ProactiveReadinessGateV1,
): boolean {
  return (
    gate.temporalQualityPassed &&
    gate.decisionUtilityPassed &&
    gate.interventionQualityPassed
  );
}

export function selectSurfacePilotEntry(input: {
  gate: ProactiveReadinessGateV1;
}): SelectSurfacePilotResult {
  if (!isProactiveReadinessGatePass(input.gate)) {
    return {
      ok: false,
      action: 'CONTINUE_SHADOW',
      reason: 'PROACTIVE_READINESS_GATE_NOT_PASS',
      interruptCandidateIsNotNotificationAuthorization: true,
      reasonZh:
        'Proactive Readiness Gate 未 PASS → 继续 Shadow；不得进入真实 Surface Pilot',
    };
  }
  return {
    ok: true,
    scenarioId: input.gate.scenarioId,
    level: 'L1_PASSIVE',
    interruptCandidateIsNotNotificationAuthorization: true,
    pushClosed: true,
    notificationClosed: true,
    autoActionClosed: true,
    reasonZh:
      'Gate PASS → 允许 L1 PASSIVE Surface Pilot；Interrupt Candidate ≠ Notification Authorization；Push/Notification/Auto Action 仍关',
  };
}

/**
 * Candidate 不得直接授权任何 Delivery Channel。
 */
export function assertCandidateCannotAuthorizeChannel(input: {
  candidate: InterventionCandidateV1;
  requestedChannel: string;
}): {
  ok: false;
  code: 'INTERRUPT_CANDIDATE_NOT_NOTIFICATION_AUTHORIZATION';
  reasonZh: string;
} {
  void input;
  return {
    ok: false,
    code: 'INTERRUPT_CANDIDATE_NOT_NOTIFICATION_AUTHORIZATION',
    reasonZh:
      'Interrupt Candidate ≠ Notification Authorization：渠道须由 Harness / Delivery Policy 独立裁定',
  };
}
