/**
 * route_and_run.options.intent_mode — 与 RouteDecision / 观测字段对齐。
 * AUTO：沿用服务端推断（关键词 + trip 内咨询分流等）。
 */
export const INTENT_MODE_VALUES = ['AUTO', 'TRIP_PLANNING', 'DATA_LOOKUP', 'GENERIC_QA'] as const;

export type IntentMode = (typeof INTENT_MODE_VALUES)[number];
