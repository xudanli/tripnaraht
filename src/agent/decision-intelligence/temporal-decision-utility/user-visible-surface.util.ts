/**
 * User-visible Temporal 表面 — 仅用户主动提问或既有 Decision Runtime。
 * 禁止主动打断 / Proactive Notification。
 */

import type { TemporalPresentationPolicyV1 } from './temporal-presentation-policy.util';
import type { TemporalVisibilityDecisionV1 } from './visibility-gate.util';

export type TemporalVisibleSurface =
  | 'USER_ASKED'
  | 'DECISION_RUNTIME'
  | 'PROACTIVE_INTERRUPT'
  | 'PUSH_NOTIFICATION';

export type TemporalSurfaceAdmissionV1 =
  | {
      ok: true;
      surface: 'USER_ASKED' | 'DECISION_RUNTIME';
      mayShowTemporal: boolean;
      proactiveInterruptForbidden: true;
      autoActionForbidden: true;
    }
  | {
      ok: false;
      code: 'SURFACE_FORBIDDEN' | 'NOT_USER_VISIBLE' | 'POLICY_WITHHOLD';
      reasonZh: string;
      proactiveInterruptForbidden: true;
      autoActionForbidden: true;
    };

/**
 * 准入：USER_ASKED / DECISION_RUNTIME 才可出现；PROACTIVE 一律拒绝。
 */
export function admitTemporalVisibleSurface(input: {
  visibility: TemporalVisibilityDecisionV1;
  policy: TemporalPresentationPolicyV1;
  surface: TemporalVisibleSurface;
}): TemporalSurfaceAdmissionV1 {
  const denyBase = {
    proactiveInterruptForbidden: true as const,
    autoActionForbidden: true as const,
  };

  if (
    input.surface === 'PROACTIVE_INTERRUPT' ||
    input.surface === 'PUSH_NOTIFICATION'
  ) {
    return {
      ok: false,
      code: 'SURFACE_FORBIDDEN',
      reasonZh:
        'User-visible Temporal 禁止主动打断 / Push；仅用户提问或既有 Decision Runtime',
      ...denyBase,
    };
  }

  if (!input.visibility.allowUserVisibleTemporal) {
    return {
      ok: false,
      code: 'NOT_USER_VISIBLE',
      reasonZh: '场景仍为 Shadow，不得向用户展示 Temporal',
      ...denyBase,
    };
  }

  if (!input.policy.mayPresentToUser) {
    return {
      ok: false,
      code: 'POLICY_WITHHOLD',
      reasonZh: 'PresentationPolicy WITHHOLD',
      ...denyBase,
    };
  }

  return {
    ok: true,
    surface: input.surface,
    mayShowTemporal: true,
    proactiveInterruptForbidden: true,
    autoActionForbidden: true,
  };
}
