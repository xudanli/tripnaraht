/**
 * P1-4：ITINERARY_ADJUST AUTO / SEMI_AUTO 产品合同（确定性走廊，非 LLM 自由写库）。
 *
 * 冻结：
 * - LLM / NARRATE 不能直接写库
 * - AUTO 由授权 + 验证门控后的确定性走廊触发
 * - FLAWED_DRAFT 禁止 AUTO / SEMI_AUTO
 */

import type { ItineraryAdjustExecutionMode, ItineraryAdjustSubIntent } from '../utils/itinerary-adjust-auto-apply.util';
import { shouldBlockAutoApplyForFlawedDraft } from '../utils/itinerary-adjust-flawed-auto-block.util';

export const AUTO_CORRIDOR_PRODUCT_CONTRACT_VERSION = '1.0.0' as const;

export type AutoCorridorSupportedIntent = 'ITINERARY_ADJUST';

export type AutoCorridorUiFlagsV1 = {
  schemaId: 'tripnara.auto_corridor_ui@v1';
  version: 1;
  /** 是否允许展示「自动应用」控件 */
  show_auto_apply_control: boolean;
  /** 是否要求用户预授权 execution_mode */
  requires_preauth: boolean;
  /** FLAWED_DRAFT 等导致禁止自动写回 */
  auto_blocked: boolean;
  auto_block_reason?: string;
  /** 撤销提示：AUTO 落库后可通过 revision rollback / 再改排撤销 */
  revoke_hint_zh: string;
  /** 审计：应写入 decision_log / funnel */
  audit_required: boolean;
  persistence_target: 'trip_itinerary_item';
  execution_mode: ItineraryAdjustExecutionMode;
  sub_intent?: ItineraryAdjustSubIntent | string;
};

export const AUTO_CORRIDOR_PRODUCT_RULES = {
  supportedPrimaryIntent: 'ITINERARY_ADJUST' as AutoCorridorSupportedIntent,
  /** 请求 options.execution_mode 为产品预授权；缺省 ADVICE_ONLY */
  requiresExplicitExecutionModeForAuto: true,
  requiresBoundTrip: true,
  flawedDraftBlocksAuto: true,
  /** AUTO：strong_modification + highConfidence；SEMI_AUTO：poi_slot_fill + place_id 齐备 */
  autoSubIntents: ['strong_modification'] as const,
  semiAutoSubIntents: ['poi_slot_fill'] as const,
  persistenceTarget: 'trip_itinerary_item' as const,
  revokeVia: 'itinerary_revision_rollback_or_re_adjust' as const,
  llmCannotWriteDb: true,
} as const;

export function buildAutoCorridorUiFlagsV1(input: {
  metadata?: Record<string, unknown> | null;
  executionMode?: ItineraryAdjustExecutionMode;
  subIntent?: ItineraryAdjustSubIntent | string;
}): AutoCorridorUiFlagsV1 {
  const md = input.metadata ?? {};
  const executionMode =
    input.executionMode ??
    (md.itinerary_adjust_execution_mode as ItineraryAdjustExecutionMode | undefined) ??
    'ADVICE_ONLY';
  const subIntent =
    input.subIntent ??
    (typeof md.itinerary_adjust_sub_intent === 'string' ? md.itinerary_adjust_sub_intent : undefined);

  const flawedBlocked = shouldBlockAutoApplyForFlawedDraft(md);
  const autoApply = md.itinerary_adjust_auto_apply as { reason?: string; applied?: boolean } | undefined;
  const auto_blocked =
    flawedBlocked || autoApply?.reason === 'flawed_draft_forbidden' || executionMode === 'ADVICE_ONLY';

  return {
    schemaId: 'tripnara.auto_corridor_ui@v1',
    version: 1,
    show_auto_apply_control: !flawedBlocked && executionMode !== 'ADVICE_ONLY',
    requires_preauth: true,
    auto_blocked: flawedBlocked || autoApply?.reason === 'flawed_draft_forbidden',
    ...(flawedBlocked || autoApply?.reason === 'flawed_draft_forbidden'
      ? { auto_block_reason: 'flawed_draft_forbidden' }
      : {}),
    revoke_hint_zh:
      '若自动写入不符合预期，请使用行程修订回滚，或再次发起改排并确认后应用。',
    audit_required: true,
    persistence_target: 'trip_itinerary_item',
    execution_mode: executionMode,
    ...(subIntent ? { sub_intent: subIntent } : {}),
  };
}

/** 窄走廊是否允许尝试 AUTO（不含 tripsService 等运行时可用性） */
export function isAutoCorridorEligible(input: {
  primaryIntent?: string;
  boundTripId?: string | null;
  metadata?: Record<string, unknown> | null;
  requestExecutionMode?: 'ADVICE_ONLY' | 'SEMI_AUTO' | 'AUTO';
}): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.primaryIntent !== AUTO_CORRIDOR_PRODUCT_RULES.supportedPrimaryIntent) {
    reasons.push('intent_not_itinerary_adjust');
  }
  if (!String(input.boundTripId ?? '').trim()) {
    reasons.push('trip_not_bound');
  }
  if (shouldBlockAutoApplyForFlawedDraft(input.metadata)) {
    reasons.push('flawed_draft_forbidden');
  }
  if (
    AUTO_CORRIDOR_PRODUCT_RULES.requiresExplicitExecutionModeForAuto &&
    input.requestExecutionMode !== 'AUTO' &&
    input.requestExecutionMode !== 'SEMI_AUTO'
  ) {
    // 产品预授权：请求未声明 AUTO/SEMI_AUTO 时，走廊仍可能内部解析为 AUTO；
    // 此处仅标注「请求层未预授权」，由 resolveItineraryAdjustExecutionMode 做最终模式。
    reasons.push('request_execution_mode_not_auto');
  }
  return {
    eligible: !reasons.some((r) =>
      r === 'intent_not_itinerary_adjust' ||
      r === 'trip_not_bound' ||
      r === 'flawed_draft_forbidden',
    ),
    reasons,
  };
}
