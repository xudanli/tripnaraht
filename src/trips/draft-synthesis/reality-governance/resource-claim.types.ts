/**
 * 行程对某资源的占用请求（同一 resourceKey 下可多条竞争）。
 */
export interface ResourceClaim {
  claimId: string;
  tripId: string;
  /** 与 RealityResource.id 或复合键一致 */
  resourceId: string;
  /** 可选：时段键，如 2026-06-01|18:00|restaurant:42 */
  slotKey?: string;
  /** 0–1，Persona / VIP / 付费等级折叠 */
  priorityScore: number;
  /** 0–1，改签紧急度、临近出行等 */
  urgencyScore: number;
  /** Fairness：历史占用惩罚权重（越大越应礼让） */
  historicalLoadHint?: number;
}
