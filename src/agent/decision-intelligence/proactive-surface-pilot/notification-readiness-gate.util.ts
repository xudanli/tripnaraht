/**
 * Notification Readiness Gate — Push / System Notification 独立门禁；当前继续关闭。
 * Auto Apply / Auto Cancel / Auto Reroute 始终关闭。
 */

import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';
import type { L1SurfaceUtilityReportV1 } from './l1-passive-surface.util';
import type { AttentionQualityReportV1 } from './l2-in-app-interrupt-canary.util';

export const NOTIFICATION_READINESS_GATE_SCHEMA =
  'nara.notification_readiness_gate@v1' as const;

export type NotificationReadinessGateV1 = {
  schemaId: typeof NOTIFICATION_READINESS_GATE_SCHEMA;
  version: 1;
  scenarioId: TemporalScenarioId;
  /** 本阶段硬关 */
  passed: false;
  allowPush: false;
  allowSystemNotification: false;
  autoApplyClosed: true;
  autoCancelClosed: true;
  autoRerouteClosed: true;
  interruptCandidateIsNotNotificationAuthorization: true;
  reasonsZh: string[];
};

/**
 * 独立 Notification Gate：即使 L1/L2 通过，Push 仍关闭。
 */
export function checkNotificationReadinessGate(input: {
  scenarioId: TemporalScenarioId;
  l1Utility?: L1SurfaceUtilityReportV1;
  l2Attention?: AttentionQualityReportV1;
}): NotificationReadinessGateV1 {
  const reasonsZh = [
    'Notification Readiness Gate 当前关闭：禁止 Push / System Notification',
    'Interrupt Candidate ≠ Notification Authorization',
    'Auto Apply / Auto Cancel / Auto Reroute 始终关闭',
  ];
  if (input.l1Utility?.passed) {
    reasonsZh.push('L1 Utility 通过 ≠ Push 授权');
  }
  if (input.l2Attention?.passed) {
    reasonsZh.push('L2 Attention Quality 通过 ≠ Push 授权');
  }
  return {
    schemaId: NOTIFICATION_READINESS_GATE_SCHEMA,
    version: 1,
    scenarioId: input.scenarioId,
    passed: false,
    allowPush: false,
    allowSystemNotification: false,
    autoApplyClosed: true,
    autoCancelClosed: true,
    autoRerouteClosed: true,
    interruptCandidateIsNotNotificationAuthorization: true,
    reasonsZh,
  };
}

export function assertAutoActionsClosed(): {
  autoApply: false;
  autoCancel: false;
  autoReroute: false;
  reasonZh: string;
} {
  return {
    autoApply: false,
    autoCancel: false,
    autoReroute: false,
    reasonZh: 'Auto Apply / Auto Cancel / Auto Reroute 始终关闭',
  };
}
