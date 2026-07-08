/** Sprint 4B — 研究支付 SKU 与法务文案 SSOT */

import { ForbiddenException } from '@nestjs/common';

export const RESEARCH_PAYMENT_LEGAL = {
  productStatus: 'PRODUCT_IN_DEVELOPMENT',
  depositTitle: '研究可退订金',
  depositBody:
    'TripNARA 探索规划产品尚在开发中。订金用于验证真实付费意愿，不构成最终服务合同。' +
    '你可在研究结束后随时申请全额退款，无需说明理由，退款通常在 5–10 个工作日内原路返回。',
  priceLockBody:
    '价格锁定仅表示你对研究阶段展示的价格区间感兴趣；不构成报价承诺。正式产品上线后将另行通知。',
  noScarcity: true,
  refundPolicy: 'UNCONDITIONAL_FULL_REFUND',
} as const;

export const RESEARCH_DEPOSIT_SKU = {
  skuId: 'research_deposit_v1',
  amountCents: 1900,
  currency: 'usd',
  displayAmount: '$19',
  refundable: true,
} as const;

export function isResearchPaymentEnabled(): boolean {
  return process.env.RESEARCH_PAYMENT_COMMITMENT_ENABLED === '1';
}

/** 无 Stripe 密钥时允许沙箱模拟（仅 dev/staging） */
export function isResearchPaymentSandboxMode(): boolean {
  return (
    process.env.RESEARCH_PAYMENT_SANDBOX_MODE === '1' ||
    process.env.NODE_ENV !== 'production'
  ) && !process.env.STRIPE_SECRET_KEY;
}

export function assertResearchPaymentEnabled() {
  if (!isResearchPaymentEnabled()) {
    throw new ForbiddenException('RESEARCH_PAYMENT_COMMITMENT_ENABLED is not set');
  }
}
