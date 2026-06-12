/**
 * 瑕疵草案交付契约 — SUCCESS + 未完全收敛时前端须显式标注。
 */

export type FlawedDraftReasonCode =
  | 'REPAIR_BUDGET_EXCEEDED'
  | 'GATE_ADJUST_REQUIRED'
  | 'UNRESOLVED_VERIFICATION'
  | 'VERIFY_PARTIAL'
  | 'UTILITY_DECAY_BYPASSED'
  | 'ALLOW_PARTIAL_GATE_RELAXED';

export interface FlawedDraftReasonV1 {
  code: FlawedDraftReasonCode;
  detail_zh?: string;
  detail_en?: string;
}

export interface FlawedDraftDescriptorV1 {
  schemaId: 'tripnara.flawed_draft@v1';
  version: 1;
  /** 为 true 时前端须展示「需人工确认」Banner，不可当作完全 VERIFIED 行程 */
  is_flawed: boolean;
  reasons: FlawedDraftReasonV1[];
  repair_count?: number;
  max_repair_count?: number;
  gate_status?: 'ALLOW' | 'ADJUST_REQUIRED' | 'BLOCK' | 'NEED_USER_CONFIRM';
  unresolved_verification_codes?: string[];
  /** 是否仍建议用户走 actionExecution / 澄清流 */
  user_action_recommended: boolean;
  headline_zh?: string;
  headline_en?: string;
}
