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
  ACTION_PREVIEW_SIGNATURE_MISSING: 'ACTION_PREVIEW_SIGNATURE_MISSING',
  ACTION_PREVIEW_SIGNATURE_MISMATCH: 'ACTION_PREVIEW_SIGNATURE_MISMATCH',
  RESOURCE_STALE_RECOMPUTE: 'RESOURCE_STALE_RECOMPUTE',
  MISSING_IDEMPOTENCY_KEY: 'MISSING_IDEMPOTENCY_KEY',
  MISSING_REQUIRED_EVIDENCE: 'MISSING_REQUIRED_EVIDENCE',
  BOOK_ADD_MISSING_REQUIRED_FIELDS: 'BOOK_ADD_MISSING_REQUIRED_FIELDS',
  PHYSICAL_VALIDATOR_BLOCKED: 'PHYSICAL_VALIDATOR_BLOCKED',
  PHYSICAL_VALIDATOR_VERSION_MISMATCH: 'PHYSICAL_VALIDATOR_VERSION_MISMATCH',
} as const;

export type ActionRejectReasonCode =
  (typeof ACTION_REJECT_REASON_CODES)[keyof typeof ACTION_REJECT_REASON_CODES];

/**
 * 编排器在特定系统条件下注入的「系统动作」标识（非 ActionRegistry 可执行动词）。
 * 供审计、UI 与 Agent 解析：例如空草案时禁止继续产出行程级建议。
 */
export const SYSTEM_ORCHESTRATOR_ACTIONS = {
  PLAN_GEN_EMPTY_DRAFT_HALT: 'SYSTEM.plan_gen_empty_draft.request_relax_constraints',
} as const;

export type SystemOrchestratorAction =
  (typeof SYSTEM_ORCHESTRATOR_ACTIONS)[keyof typeof SYSTEM_ORCHESTRATOR_ACTIONS];

/**
 * Frontend / agent contract: after INTERRUPT_WITH_SUGGESTION, replay action preview with the same
 * `action_id` and `action_input` replaced by `healed_action_input` from `suggested_healing_options[]`.
 */
export const HEALING_ONE_CLICK_ACTION_ID = 'PREVIEW_WITH_HEALED_INPUT_V1' as const;

export const ACTION_REJECT_REASON_MESSAGES: Record<ActionRejectReasonCode, string> = {
  HIGH_RISK_REQUIRES_CONFIRMATION_TOKEN: 'High-risk action requires confirmation token.',
  UNSUPPORTED_ACTION_MAPPING: 'Action type and target type mapping is not supported.',
  ACTION_NOT_REGISTERED: 'Mapped action is not registered in ActionRegistry.',
  ACTION_EXECUTION_FAILED: 'Action execution failed at runtime.',
  ACTION_PRECONDITION_FAILED: 'Action precondition check failed.',
  ACTION_PREVIEW_SIGNATURE_MISSING:
    'Missing preview context_signature. Please call preview again and re-submit commit with the signature.',
  ACTION_PREVIEW_SIGNATURE_MISMATCH:
    'Preview is stale (signature mismatch). Please re-run preview to re-evaluate consequences before commit.',
  RESOURCE_STALE_RECOMPUTE:
    'Resource snapshot changed since preview (price/availability/budget). Please re-run preview before commit.',
  MISSING_IDEMPOTENCY_KEY:
    'Missing idempotency_key for financial or booking side effect. Provide idempotency_key and retry commit.',
  MISSING_REQUIRED_EVIDENCE:
    'Required evidence is missing for financial side effect. Attach EvidenceCard-compliant evidence and retry.',
  BOOK_ADD_MISSING_REQUIRED_FIELDS: 'BOOK add action requires placeId, tripDayId, startTime, and endTime.',
  PHYSICAL_VALIDATOR_BLOCKED: 'Physical domain validation blocked this action (road closure, feasibility, or ontology conflict).',
  PHYSICAL_VALIDATOR_VERSION_MISMATCH:
    'Physical validator version mismatch with preview. Please call preview again and resubmit with the current validator version.',
};
