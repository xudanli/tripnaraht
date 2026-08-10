/**
 * User Proactive Preference — 仅表达用户允许的主动介入等级。
 * 原则：Notification Permission ≠ Notification Authority（偏好 ≠ 发送权）。
 */

import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';

export const USER_PROACTIVE_PREFERENCE_SCHEMA =
  'nara.user_proactive_preference@v1' as const;

export type ProactivePreferenceLevel =
  | 'OFF'
  | 'L1_PASSIVE_ONLY'
  | 'L2_IN_APP_OK'
  | 'PUSH_OK_IF_AUTHORIZED';

export type UserProactivePreferenceV1 = {
  schemaId: typeof USER_PROACTIVE_PREFERENCE_SCHEMA;
  version: 1;
  userId: string;
  /** 全局默认偏好（仍非 Authority） */
  defaultLevel: ProactivePreferenceLevel;
  /** 按场景覆盖 */
  perScenario?: Partial<Record<TemporalScenarioId, ProactivePreferenceLevel>>;
  updatedAt: string;
  /** 显式：偏好不授予发送权 */
  preferenceIsNotNotificationAuthority: true;
  notificationPermissionIsNotNotificationAuthority: true;
};

export function setUserProactivePreference(input: {
  userId: string;
  defaultLevel: ProactivePreferenceLevel;
  perScenario?: UserProactivePreferenceV1['perScenario'];
  updatedAt?: string;
}): UserProactivePreferenceV1 {
  return {
    schemaId: USER_PROACTIVE_PREFERENCE_SCHEMA,
    version: 1,
    userId: input.userId,
    defaultLevel: input.defaultLevel,
    perScenario: input.perScenario,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    preferenceIsNotNotificationAuthority: true,
    notificationPermissionIsNotNotificationAuthority: true,
  };
}

export function resolvePreferredLevel(
  pref: UserProactivePreferenceV1,
  scenarioId: TemporalScenarioId,
): ProactivePreferenceLevel {
  return pref.perScenario?.[scenarioId] ?? pref.defaultLevel;
}

/**
 * 偏好允许某 Delivery Level ≠ 已获发送授权。
 */
export function preferenceAllowsDeliveryLevel(input: {
  pref: UserProactivePreferenceV1;
  scenarioId: TemporalScenarioId;
  deliveryLevel: 'L1_PASSIVE' | 'L2_IN_APP_INTERRUPT' | 'PUSH';
}): boolean {
  const level = resolvePreferredLevel(input.pref, input.scenarioId);
  if (level === 'OFF') return false;
  if (input.deliveryLevel === 'L1_PASSIVE') {
    return (
      level === 'L1_PASSIVE_ONLY' ||
      level === 'L2_IN_APP_OK' ||
      level === 'PUSH_OK_IF_AUTHORIZED'
    );
  }
  if (input.deliveryLevel === 'L2_IN_APP_INTERRUPT') {
    return level === 'L2_IN_APP_OK' || level === 'PUSH_OK_IF_AUTHORIZED';
  }
  /** PUSH */
  return level === 'PUSH_OK_IF_AUTHORIZED';
}
