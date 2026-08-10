/**
 * Delivery Policy — 渠道授权由 Harness / Delivery Policy 独立裁定。
 * Interrupt Candidate ≠ Notification Authorization。
 */

import type { InterventionCandidateV1 } from '../intervention-intelligence/intervention-candidate.util';
import type { UserAttentionContextV1 } from './user-attention-context.util';
import type { SelectSurfacePilotResult } from './select-surface-pilot.util';

export const DELIVERY_POLICY_SCHEMA = 'nara.delivery_policy@v1' as const;

export type DeliveryChannelV1 =
  | 'NONE'
  | 'L1_PASSIVE_IN_APP'
  | 'L2_IN_APP_INTERRUPT'
  | 'PUSH'
  | 'SYSTEM_NOTIFICATION';

export type DeliveryDecisionV1 = {
  schemaId: typeof DELIVERY_POLICY_SCHEMA;
  version: 1;
  channel: DeliveryChannelV1;
  authorized: boolean;
  staySilent: boolean;
  reasonZh: string;
  interruptCandidateIsNotNotificationAuthorization: true;
  decidedBy: 'HARNESS_DELIVERY_POLICY';
  autoApplyClosed: true;
  autoCancelClosed: true;
  autoRerouteClosed: true;
};

/**
 * 独立裁定渠道：Candidate.surfaceLevel 只作输入证据，不能直接定 channel。
 */
export function decideDeliveryChannel(input: {
  entry: SelectSurfacePilotResult;
  candidate: InterventionCandidateV1;
  attention: UserAttentionContextV1;
  /** L1 Utility 通过后才可申请 L2 */
  l1UtilityPassed?: boolean;
  /** Notification Readiness Gate — 当前应恒 false */
  notificationReadinessPassed?: boolean;
}): DeliveryDecisionV1 {
  const base = {
    schemaId: DELIVERY_POLICY_SCHEMA,
    version: 1 as const,
    interruptCandidateIsNotNotificationAuthorization: true as const,
    decidedBy: 'HARNESS_DELIVERY_POLICY' as const,
    autoApplyClosed: true as const,
    autoCancelClosed: true as const,
    autoRerouteClosed: true as const,
  };

  if (!input.entry.ok) {
    return {
      ...base,
      channel: 'NONE',
      authorized: false,
      staySilent: true,
      reasonZh: '未进入 Surface Pilot → 保持沉默（继续 Shadow）',
    };
  }

  /** Push / System Notification 需独立 Gate；当前关闭 */
  if (input.notificationReadinessPassed) {
    return {
      ...base,
      channel: 'NONE',
      authorized: false,
      staySilent: true,
      reasonZh:
        'Notification Readiness 即使声称通过，本阶段仍强制关闭 Push/System Notification',
    };
  }

  const att = input.attention.state;
  if (att === 'DRIVING' || att === 'NAVIGATING') {
    return {
      ...base,
      channel: 'NONE',
      authorized: false,
      staySilent: true,
      reasonZh: `Attention=${att} → 保持沉默（安全）`,
    };
  }
  if (att === 'BACKGROUND') {
    return {
      ...base,
      channel: 'NONE',
      authorized: false,
      staySilent: true,
      reasonZh: 'BACKGROUND → 禁止 Surface（亦非 Push 授权）',
    };
  }

  /** L2 仅小范围 canary：需 L1 utility 过 + INTERRUPT_CANDIDATE + APP_ACTIVE */
  if (
    input.l1UtilityPassed &&
    input.candidate.surfaceLevel === 'INTERRUPT_CANDIDATE' &&
    att === 'APP_ACTIVE'
  ) {
    return {
      ...base,
      channel: 'L2_IN_APP_INTERRUPT',
      authorized: true,
      staySilent: false,
      reasonZh:
        'Delivery Policy 授权 L2 IN_APP_INTERRUPT Canary（非 Candidate 自决渠道）',
    };
  }

  /** L1 PASSIVE：仅打开 App 时展示，不抢占 */
  if (
    input.entry.level === 'L1_PASSIVE' &&
    input.attention.justOpenedApp &&
    (att === 'APP_ACTIVE' || att === 'APP_FOREGROUND_IDLE') &&
    input.candidate.surfaceLevel !== 'DO_NOT_SURFACE'
  ) {
    return {
      ...base,
      channel: 'L1_PASSIVE_IN_APP',
      authorized: true,
      staySilent: false,
      reasonZh:
        'L1 PASSIVE：用户打开 TripNARA 时被动展示；不主动抢占注意力',
    };
  }

  return {
    ...base,
    channel: 'NONE',
    authorized: false,
    staySilent: true,
    reasonZh:
      'Delivery Policy 决定保持沉默（条件不满足 L1/L2；Candidate 不能强行出渠）',
  };
}
