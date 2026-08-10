/**
 * ConversationTurnResult — 统一领域输出层 schema 冻结。
 * Chat / iOS 只渲染本信封；禁止渠道侧各自理解业务对象。
 */

export const CONVERSATION_TURN_RESULT_SCHEMA_ID =
  'tripnara.conversation_turn_result@v1' as const;

export const CONVERSATION_TURN_RESULT_VERSION = 1 as const;

export const CONVERSATION_CARD_KINDS = [
  'trip_fact',
  'change_draft',
  'decision_options',
  'gate_risk',
  'import_preview',
  'team_action',
  'apply_receipt',
] as const;

export type ConversationCardKind = (typeof CONVERSATION_CARD_KINDS)[number];

export const CONVERSATION_LIFECYCLES = [
  'PLANNING',
  'TRAVELING',
  'COMPLETED',
  'UNKNOWN',
] as const;

export type ConversationLifecycle = (typeof CONVERSATION_LIFECYCLES)[number];

export const CONVERSATION_ACTION_KINDS = [
  'client_navigation',
  'route_and_run_message',
  'confirm_negotiation',
  'decision_consent',
  'select_decision_option',
  'apply_itinerary_adjust',
  'rollback',
  'notify_members',
  'open_guide_to_plan',
] as const;

export type ConversationActionKind = (typeof CONVERSATION_ACTION_KINDS)[number];

/** TripConversationContextSnapshot */
export const TRIP_CONVERSATION_CONTEXT_SCHEMA_ID =
  'tripnara.trip_conversation_context@v1' as const;
