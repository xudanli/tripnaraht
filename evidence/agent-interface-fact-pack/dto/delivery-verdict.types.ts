/**
 * 产品可感知交付裁决态（P0-1）。
 * 前端须先读 delivery_verdict，再决定 Banner / Confirm / Apply 可用性。
 */

import type { FlawedDraftDescriptorV1 } from './flawed-draft-v1.type';

export const DELIVERY_VERDICTS = [
  'VERIFIED',
  'VERIFIED_WITH_WARNINGS',
  'FLAWED_DRAFT',
  'BLOCKED',
  'FAILED',
] as const;

export type DeliveryVerdict = (typeof DELIVERY_VERDICTS)[number];

export type ResolveDeliveryVerdictInput = {
  resultStatus?: string | null;
  flawedDraft?: FlawedDraftDescriptorV1 | null;
  /** SOFT / 非 flawed 警告：如 gate ADJUST_REQUIRED 已在 flawed 描述符外单独提示 */
  hasSoftWarnings?: boolean;
};

/**
 * VERIFY 通过 ≠ 用户已确认 ≠ 已写库。
 * FLAWED_DRAFT 不得显示为「已验证方案」，且禁止 AUTO Apply。
 */
export function resolveDeliveryVerdict(input: ResolveDeliveryVerdictInput): DeliveryVerdict {
  const status = String(input.resultStatus ?? '').toUpperCase();

  if (status === 'FAILED' || status === 'TIMEOUT') {
    return 'FAILED';
  }
  if (status === 'BLOCKED') {
    return 'BLOCKED';
  }
  // NEED_* 对用户是阻断继续自动推进，归 BLOCKED（需处理）
  if (
    status === 'NEED_MORE_INFO' ||
    status === 'NEED_CONFIRMATION' ||
    status === 'NEED_CONSENT' ||
    status === 'NEED_USER_CONFIRMATION'
  ) {
    return 'BLOCKED';
  }

  if (input.flawedDraft?.is_flawed === true) {
    return 'FLAWED_DRAFT';
  }

  if (status === 'OK' || status === 'OK_WITH_BANNER' || status === 'SUCCESS' || status === '') {
    if (input.hasSoftWarnings === true) {
      return 'VERIFIED_WITH_WARNINGS';
    }
    return 'VERIFIED';
  }

  return 'FAILED';
}
