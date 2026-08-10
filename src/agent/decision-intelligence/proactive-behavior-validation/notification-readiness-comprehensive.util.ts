/**
 * Comprehensive Notification Readiness Gate（行为验证阶段）。
 * 综合 Temporal Quality / Decision Utility / Intervention Quality / Timing /
 * Attention Fatigue / Silence Quality / L1-L2 Utility / User Preference。
 * Notification Permission ≠ Notification Authority。
 * Push 仅在具体 Scenario PASS 且 Scenario×PUSH 已授权后才可开；Auto Action 永关。
 */

import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';
import type { UserProactivePreferenceV1 } from './user-proactive-preference.util';
import { preferenceAllowsDeliveryLevel } from './user-proactive-preference.util';
import type { ProactiveLongitudinalReportV1 } from './proactive-longitudinal-report.util';
import type { SilenceEvaluationV1 } from './silence-evaluation.util';
import {
  assertNoGlobalProactiveFlag,
  isProactiveAuthorized,
  type ProactiveAuthorityRegistryV1,
} from './proactive-authority.util';

export const NOTIFICATION_READINESS_COMPREHENSIVE_SCHEMA =
  'nara.notification_readiness_comprehensive@v1' as const;

export type NotificationReadinessInputsV1 = {
  temporalQualityPassed: boolean;
  decisionUtilityPassed: boolean;
  interventionQualityPassed: boolean;
  timingQualityPassed: boolean;
  /** Attention Fatigue：越低越好；true=疲劳可接受 */
  attentionFatigueAcceptable: boolean;
  silenceQuality: Pick<SilenceEvaluationV1, 'passed' | 'silenceQualityScore'>;
  l1UtilityPassed: boolean;
  l2UtilityPassed: boolean;
  longitudinal?: Pick<
    ProactiveLongitudinalReportV1,
    'sustainable' | 'retentionWillingnessScore'
  >;
  userPreference: UserProactivePreferenceV1;
};

export type ComprehensiveNotificationReadinessV1 = {
  schemaId: typeof NOTIFICATION_READINESS_COMPREHENSIVE_SCHEMA;
  version: 1;
  scenarioId: TemporalScenarioId;
  dimensionPasses: Record<string, boolean>;
  passed: boolean;
  /** PASS ≠ 已可发送；仍需 Scenario×Level Authority */
  notificationPermissionIsNotNotificationAuthority: true;
  allowPushPendingAuthority: boolean;
  allowSystemNotificationPendingAuthority: boolean;
  autoApplyClosed: true;
  autoCancelClosed: true;
  autoRerouteClosed: true;
  reasonsZh: string[];
};

export function checkComprehensiveNotificationReadiness(input: {
  scenarioId: TemporalScenarioId;
  dimensions: NotificationReadinessInputsV1;
}): ComprehensiveNotificationReadinessV1 {
  const d = input.dimensions;
  const prefOk = preferenceAllowsDeliveryLevel({
    pref: d.userPreference,
    scenarioId: input.scenarioId,
    deliveryLevel: 'PUSH',
  });

  const dimensionPasses: Record<string, boolean> = {
    temporalQuality: d.temporalQualityPassed,
    decisionUtility: d.decisionUtilityPassed,
    interventionQuality: d.interventionQualityPassed,
    timing: d.timingQualityPassed,
    attentionFatigue: d.attentionFatigueAcceptable,
    silenceQuality: d.silenceQuality.passed,
    l1Utility: d.l1UtilityPassed,
    l2Utility: d.l2UtilityPassed,
    longitudinalSustainable: d.longitudinal?.sustainable ?? false,
    userPreferenceAllowsPush: prefOk,
  };

  const reasonsZh: string[] = [];
  for (const [k, v] of Object.entries(dimensionPasses)) {
    if (!v) reasonsZh.push(`维度未过: ${k}`);
  }

  const passed = Object.values(dimensionPasses).every(Boolean);
  if (passed) {
    reasonsZh.push(
      'Notification Readiness PASS（综合维度）；仍须 Scenario×PUSH Authority；Permission ≠ Authority',
    );
  } else {
    reasonsZh.push('Notification Readiness 未 PASS → Push/Notification 继续关闭');
  }

  return {
    schemaId: NOTIFICATION_READINESS_COMPREHENSIVE_SCHEMA,
    version: 1,
    scenarioId: input.scenarioId,
    dimensionPasses,
    passed,
    notificationPermissionIsNotNotificationAuthority: true,
    allowPushPendingAuthority: passed,
    allowSystemNotificationPendingAuthority: passed,
    autoApplyClosed: true,
    autoCancelClosed: true,
    autoRerouteClosed: true,
    reasonsZh,
  };
}

/**
 * 真正发送 Push 的最终裁定：Readiness PASS ∧ Scenario×PUSH Authority ∧ 非全局开关。
 */
export function authorizePushDelivery(input: {
  readiness: ComprehensiveNotificationReadinessV1;
  authority: ProactiveAuthorityRegistryV1;
  globalProactive?: boolean;
  now?: string;
}): {
  allowed: boolean;
  reasonsZh: string[];
  autoApplyClosed: true;
  autoCancelClosed: true;
  autoRerouteClosed: true;
} {
  assertNoGlobalProactiveFlag({ globalProactive: input.globalProactive });
  const reasonsZh: string[] = [];
  if (!input.readiness.passed) {
    reasonsZh.push('Notification Readiness 未 PASS');
  }
  const auth = isProactiveAuthorized({
    registry: input.authority,
    scenarioId: input.readiness.scenarioId,
    deliveryLevel: 'PUSH',
    now: input.now,
  });
  if (!auth) {
    reasonsZh.push('缺少 Scenario×PUSH 独立授权（禁止全局 proactive=true）');
  }
  const allowed = input.readiness.passed && auth;
  if (allowed) {
    reasonsZh.push('允许该 Scenario 的 Push（Authority 已授）；Auto Action 仍永关');
  }
  return {
    allowed,
    reasonsZh,
    autoApplyClosed: true,
    autoCancelClosed: true,
    autoRerouteClosed: true,
  };
}
