/**
 * 前端可信交付契约（不暴露内部编排节点）。
 */

import type { TrustedPublicPhase } from '../trusted-delivery.constants';
import { TRUSTED_DELIVERY_SCHEMA_ID } from '../trusted-delivery.constants';
import type { DeliveryVerdict } from './delivery-verdict.types';

export type TrustedDeliveryTaskProgressV1 = {
  phase: TrustedPublicPhase;
  label_zh: string;
  percent?: number;
  message?: string;
};

export type TrustedDeliveryUserConfirmV1 = {
  required: boolean;
  kind?: 'clarification' | 'confirmation' | 'consent';
  summary_zh?: string;
};

export type TrustedDeliveryDegradedExplanationV1 = {
  present: boolean;
  summary_zh?: string;
  /** 用户可读原因，不含 KERNEL_* 等内部码 */
  reasons_zh?: string[];
};

export type TrustedDeliveryFlawedDisclosureV1 = {
  present: boolean;
  headline_zh?: string;
  reason_codes?: string[];
};

export type TrustedDeliveryAiOperationLogEntryV1 = {
  label_zh: string;
  summary?: string;
  duration_ms?: number;
};

export type TrustedDeliveryV1 = {
  schemaId: typeof TRUSTED_DELIVERY_SCHEMA_ID;
  version: 1;
  /** P0-1：产品可感知交付裁决；前端须先读本字段 */
  delivery_verdict: DeliveryVerdict;
  task_progress: TrustedDeliveryTaskProgressV1;
  user_confirm: TrustedDeliveryUserConfirmV1;
  degraded_explanation: TrustedDeliveryDegradedExplanationV1;
  flawed_disclosure: TrustedDeliveryFlawedDisclosureV1;
  ai_operation_log: TrustedDeliveryAiOperationLogEntryV1[];
};
