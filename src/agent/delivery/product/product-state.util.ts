/**
 * 统一 Product State — 将内部投影汇总为用户可理解的产品状态。
 * 不新增 SoT；只投影既有 Conversation / WorldState / Receipt 线索。
 */

import type { TripConversationContextSnapshotV1 } from '../conversation/conversation-turn-result.types';
import type { ConversationTurnResultV1 } from '../conversation/conversation-turn-result.types';
import type { V1JourneyId } from './v1-journey-contract.util';

export const PRODUCT_STATE_SCHEMA = 'nara.v1_product_state@v1' as const;

export type ProductStateV1 = {
  schemaId: typeof PRODUCT_STATE_SCHEMA;
  version: 1;
  tripId: string;
  /** 用户可见生命周期 */
  lifecycle: 'PLANNING' | 'TRAVELING' | 'COMPLETED' | 'UNKNOWN';
  planVersion: number | null;
  /** 页面是否建议刷新 */
  pageRefreshSuggested: boolean;
  refreshReasonZh?: string;
  openDecisionsCount: number;
  openRisksCount: number;
  latestJourneyId?: V1JourneyId;
  latestCardKinds: string[];
  latestReceiptId?: string;
  latestSummaryZh: string;
  /** 内部架构不对用户暴露 */
  hidesInternalArchitecture: true;
  capabilityReadyIsNotProductReady: true;
};

/**
 * 从 ConversationTurnResult + Context 投影 Product State。
 */
export function projectProductState(input: {
  turn?: ConversationTurnResultV1 | null;
  context?: TripConversationContextSnapshotV1 | null;
  tripId: string;
  latestJourneyId?: V1JourneyId;
  latestReceiptId?: string;
  applySucceeded?: boolean;
}): ProductStateV1 {
  const ctx = input.context ?? input.turn?.context;
  const cards = input.turn?.cards ?? [];
  const planVersion =
    ctx?.plan_version != null ? Number(ctx.plan_version) : null;

  const pageRefreshSuggested = !!input.applySucceeded || !!input.latestReceiptId;
  const openDecisionsCount = ctx?.open_decision_count ?? 0;
  const openRisksCount = ctx?.open_risk_count ?? 0;

  const cardTitle =
    cards[0] && 'title_zh' in cards[0]
      ? String((cards[0] as { title_zh?: string }).title_zh ?? '')
      : '';
  const latestSummaryZh =
    input.turn?.answer_text?.trim() ||
    cardTitle ||
    '行程状态';

  return {
    schemaId: PRODUCT_STATE_SCHEMA,
    version: 1,
    tripId: input.tripId,
    lifecycle: (ctx?.lifecycle as ProductStateV1['lifecycle']) ?? 'UNKNOWN',
    planVersion: Number.isFinite(planVersion as number) ? planVersion : null,
    pageRefreshSuggested,
    refreshReasonZh: pageRefreshSuggested
      ? 'Apply/Receipt 后建议刷新页面读模型（plan_version）'
      : undefined,
    openDecisionsCount,
    openRisksCount,
    latestJourneyId: input.latestJourneyId,
    latestCardKinds: cards.map((c) => c.kind),
    latestReceiptId: input.latestReceiptId,
    latestSummaryZh,
    hidesInternalArchitecture: true,
    capabilityReadyIsNotProductReady: true,
  };
}
