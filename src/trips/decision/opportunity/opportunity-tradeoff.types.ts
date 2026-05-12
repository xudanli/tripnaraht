/**
 * Opportunity Economics — 静态迁移权衡（不含 fatigue / mobility budget）。
 */

export interface OpportunityTradeoffInput {
  /** 机会增益，0–1 */
  opportunityGain: number;
  driveDeltaMinutes: number;
  /** 住宿扰动，0–1 */
  lodgingDisruptionCost: number;
  /** 下游时间链挤压，0–1 */
  downstreamPlanImpactScore: number;
}

export interface OpportunityTradeoffResult {
  tradeoffScore: number;
  recommendation: 'MIGRATE' | 'STAY';
  confidence: number;
  rationale: string[];
}
