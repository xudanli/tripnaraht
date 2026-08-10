/**
 * Context Requirement Engine — 可执行操作枚举（P0）。
 * 比宽泛 Intent（TRIP_PLANNING）更细，用作上下文合同查找键。
 */

export const CRE_OPERATIONS = [
  'ASK_TRIP_QUESTION',
  'ADD_ACTIVITY_TO_DAY',
  'MOVE_ACTIVITY',
  'REPLACE_ACTIVITY',
  'OPTIMIZE_DAY',
  'OPTIMIZE_TRIP',
  'CHECK_EXECUTABILITY',
  'COMPARE_OPTIONS',
  'CHANGE_ACCOMMODATION',
  'REPLAN_DUE_TO_RISK',
  'UPLOAD_BOOKING',
  'GENERIC_UNKNOWN',
] as const;

export type CreOperation = (typeof CRE_OPERATIONS)[number];

export type CreExecutionLevel =
  | 'ANSWER_CONTEXT'
  | 'RECOMMENDATION_CONTEXT'
  | 'DRAFT_CONTEXT'
  | 'APPLY_CONTEXT'
  | 'EXECUTION_CONTEXT';
