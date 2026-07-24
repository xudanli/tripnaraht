/**
 * Decision Outcome Normalization — 结构化结果，降低满意度噪声
 */

export interface DecisionNormalizedOutcome {
  /** 原始满意度 1–5 或 0–1 */
  satisfaction?: number;
  /** 用户是否表达后悔 */
  regret?: boolean;
  /** 若重来是否会改变选择 */
  recommendation_would_change?: boolean;
  /** 行程摩擦分 0–1（越高越不顺） */
  trip_friction_score?: number;
  /** 自由文本反馈（辅助，非主信号） */
  feedback?: string;
  fulfilledAt?: string;
  fulfillmentRecordId?: string;
}
