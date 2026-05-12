/**
 * P11 — **Execution Policy Calibration**（静态、版本化权重 —— 禁止运行时学习）。
 */

export interface ExecutionPolicy {
  id: string;
  version: '1';
  weights: {
    reliability: number;
    cost: number;
    daylightRisk: number;
    roadRisk: number;
    crossDayPenalty: number;
  };
}

/** Neptune / audit：策略打分后的确定性选择结果（非 ML）。 */
export interface SimulationPolicySelection {
  policyId: string;
  ranked: Array<{ variantId: string; policyScore: number }>;
  selectedVariantId: string;
  selectedPolicyScore: number;
}
