/** 旅行 Action / 本体动词：MODIFY、SELECT 为 ADJUST 的别名；PAY 为支付意图（落 trip.apply_user_edit 等） */
export const TRAVEL_ACTION_TYPE_VALUES = [
  'BOOK',
  'CANCEL',
  'ADJUST',
  'NOTIFY',
  'OPTIMIZE',
  'MODIFY',
  'SELECT',
  'PAY',
] as const;

export type TravelActionType = (typeof TRAVEL_ACTION_TYPE_VALUES)[number];

/** Action commit 返回的 travel_ontology.merge_policy 固定值（客户端合并语义） */
export const TRAVEL_ONTOLOGY_MERGE_POLICY = 'deep_merge_verbs_committed_union' as const;
export type TravelOntologyMergePolicy = typeof TRAVEL_ONTOLOGY_MERGE_POLICY;

export const ACTION_REJECT_REASON_CODES = {
  HIGH_RISK_REQUIRES_CONFIRMATION_TOKEN: 'HIGH_RISK_REQUIRES_CONFIRMATION_TOKEN',
  UNSUPPORTED_ACTION_MAPPING: 'UNSUPPORTED_ACTION_MAPPING',
  ACTION_NOT_REGISTERED: 'ACTION_NOT_REGISTERED',
  ACTION_EXECUTION_FAILED: 'ACTION_EXECUTION_FAILED',
  ACTION_PRECONDITION_FAILED: 'ACTION_PRECONDITION_FAILED',
  BOOK_ADD_MISSING_REQUIRED_FIELDS: 'BOOK_ADD_MISSING_REQUIRED_FIELDS',
} as const;

export type ActionRejectReasonCode =
  (typeof ACTION_REJECT_REASON_CODES)[keyof typeof ACTION_REJECT_REASON_CODES];

export const ACTION_REJECT_REASON_MESSAGES: Record<ActionRejectReasonCode, string> = {
  HIGH_RISK_REQUIRES_CONFIRMATION_TOKEN: 'High-risk action requires confirmation token.',
  UNSUPPORTED_ACTION_MAPPING: 'Action type and target type mapping is not supported.',
  ACTION_NOT_REGISTERED: 'Mapped action is not registered in ActionRegistry.',
  ACTION_EXECUTION_FAILED: 'Action execution failed at runtime.',
  ACTION_PRECONDITION_FAILED: 'Action precondition check failed.',
  BOOK_ADD_MISSING_REQUIRED_FIELDS: 'BOOK add action requires placeId, tripDayId, startTime, and endTime.',
};
