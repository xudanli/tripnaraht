/**
 * 系统级可学习参数（跨 Trip 聚合；部署后影响下游 Policy）。
 */
export interface SystemPolicyWeights {
  /** 与 Persona 引擎权重逐元素相乘后再归一化；默认 1 不改变行为 */
  engineWeights: {
    llm: number;
    algo: number;
    solver: number;
  };

  /** 与 Persona.constraintSensitivity 逐元素相乘后再排序 */
  constraintWeights: {
    distance: number;
    fatigue: number;
    timing: number;
    cost: number;
  };

  /**
   * 人格类型 → 额外倍率（FOODIE 表现好则 FOODIE 维权重略升）。
   * 缺省键视为 1。
   */
  personaWeights: Record<string, number>;

  /** 乐观锁 / 观测 */
  schemaVersion?: number;
}
