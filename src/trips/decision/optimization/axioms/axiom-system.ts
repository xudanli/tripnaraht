// src/trips/decision/optimization/axioms/axiom-system.ts
/**
 * TripNARA 公理系统
 * 
 * 七条核心公理定义了 TripNARA 的决策理论基础：
 * 
 * 1. 标准化公理 (Normalization Axiom)
 * 2. 分层组合公理 (Hierarchical Composition Axiom)
 * 3. 硬约束优先公理 (Feasibility Precedence Axiom)
 * 4. 不确定性一致公理 (Uncertainty Consistency Axiom)
 * 5. 稳健性优先公理 (Robustness Axiom)
 * 6. 自适应一致公理 (Adaptive Consistency Axiom)
 * 7. 多智能体一致性公理 (Multi-Agent Consistency Axiom)
 * 
 * 系统本质：
 * Risk-Constrained Hierarchical Utility Maximizer
 * with Adaptive Parameters and Multi-Operator Search
 */

// ============================================================================
// 公理一：标准化公理 (Normalization Axiom)
// ============================================================================

/**
 * 标准化公理：所有可优化指标必须映射到 [0,1] 区间
 * 
 * 形式化：Scoreᵢ : (Plan, WorldState) → [0,1]
 * 
 * 语义：
 * - 0 = 完全不可接受
 * - 1 = 理论最优
 * - 单调一致（越大越好）
 */
export interface NormalizedScore {
  /** 分数值，必须在 [0,1] 范围内 */
  readonly value: number;
  
  /** 分数来源标识 */
  readonly source: string;
  
  /** 标准化方法 */
  readonly normalizationMethod: 'LINEAR' | 'SIGMOID' | 'MINMAX' | 'ZSCORE_CLIPPED';
  
  /** 原始值（标准化前） */
  readonly rawValue?: number;
  
  /** 原始值范围（用于可逆计算） */
  readonly rawRange?: { min: number; max: number };
}

/**
 * 创建标准化分数（带验证）
 */
export function createNormalizedScore(
  value: number,
  source: string,
  method: NormalizedScore['normalizationMethod'] = 'LINEAR',
  rawValue?: number,
  rawRange?: { min: number; max: number },
): NormalizedScore {
  // 公理一强制：分数必须在 [0,1]
  if (value < 0 || value > 1) {
    throw new AxiomViolationError(
      'AXIOM_1_NORMALIZATION',
      `分数 ${value} 违反标准化公理：必须在 [0,1] 范围内`,
      { value, source },
    );
  }
  
  return { value, source, normalizationMethod: method, rawValue, rawRange };
}

/**
 * 标准化函数库
 */
export const Normalizers = {
  /** 线性标准化：(x - min) / (max - min) */
  linear: (x: number, min: number, max: number): number => {
    if (max === min) return 0.5;
    return Math.max(0, Math.min(1, (x - min) / (max - min)));
  },
  
  /** Sigmoid 标准化：1 / (1 + exp(-k*(x-x0))) */
  sigmoid: (x: number, x0: number, k: number = 1): number => {
    return 1 / (1 + Math.exp(-k * (x - x0)));
  },
  
  /** 反向标准化：将"越小越好"转换为"越大越好" */
  invert: (score: number): number => 1 - score,
  
  /** Z-score 裁剪标准化 */
  zscoreClipped: (x: number, mean: number, std: number, clipRange: number = 3): number => {
    const z = std > 0 ? (x - mean) / std : 0;
    const clipped = Math.max(-clipRange, Math.min(clipRange, z));
    return (clipped + clipRange) / (2 * clipRange);
  },
};

// ============================================================================
// 公理二：分层组合公理 (Hierarchical Composition Axiom)
// ============================================================================

/**
 * 分层组合公理：总效用必须通过分层线性组合构成
 * 
 * 形式化：
 * - 子指标：DimensionScoreₖ = Σ αₖⱼ × subScoreⱼ,  Σαₖⱼ = 1
 * - 总效用：Utility = Σ βₖ × DimensionScoreₖ,  Σβₖ = 1
 */

/** 维度层级 */
export type DimensionTier = 'PRIMARY' | 'SECONDARY' | 'TERTIARY';

/** 维度定义 */
export interface DimensionDefinition {
  /** 维度 ID */
  id: string;
  
  /** 维度名称 */
  name: string;
  
  /** 维度层级 */
  tier: DimensionTier;
  
  /** 父维度（仅次级维度需要） */
  parentDimensionId?: string;
  
  /** 维度权重（归一化后） */
  weight: number;
  
  /** 计算方法 */
  calculationMethod: 'WEIGHTED_SUM' | 'GEOMETRIC_MEAN' | 'MIN' | 'MAX';
  
  /** 子维度列表 */
  subDimensions?: DimensionDefinition[];
}

/**
 * 分层效用结构
 * 
 * 顶层维度（βₖ 权重）：
 * - SAFETY: 安全维度
 * - EXPERIENCE: 体验维度
 * - EFFICIENCY: 效率维度
 * - PHILOSOPHY: 哲学维度
 * 
 * 次级维度（αₖⱼ 权重）在各顶层维度下
 */
export interface HierarchicalUtilityStructure {
  /** 顶层维度 */
  topLevelDimensions: {
    SAFETY: {
      weight: number; // β₁
      subDimensions: {
        physicalSafety: { weight: number; score: NormalizedScore };
        weatherSafety: { weight: number; score: NormalizedScore };
        terrainSafety: { weight: number; score: NormalizedScore };
        complianceSafety: { weight: number; score: NormalizedScore };
      };
    };
    EXPERIENCE: {
      weight: number; // β₂
      subDimensions: {
        poiCoverage: { weight: number; score: NormalizedScore };
        experienceQuality: { weight: number; score: NormalizedScore };
        scenicValue: { weight: number; score: NormalizedScore };
      };
    };
    EFFICIENCY: {
      weight: number; // β₃
      subDimensions: {
        timeEfficiency: { weight: number; score: NormalizedScore };
        budgetEfficiency: { weight: number; score: NormalizedScore };
        fatigueManagement: { weight: number; score: NormalizedScore };
        pacingBalance: { weight: number; score: NormalizedScore };
      };
    };
    PHILOSOPHY: {
      weight: number; // β₄
      subDimensions: {
        routePhilosophyAlignment: { weight: number; score: NormalizedScore };
        structuralIntegrity: { weight: number; score: NormalizedScore };
      };
    };
  };
}

/**
 * 验证分层权重归一化
 */
export function validateHierarchicalWeights(structure: HierarchicalUtilityStructure): void {
  // 验证顶层权重和为 1
  const topLevelSum = 
    structure.topLevelDimensions.SAFETY.weight +
    structure.topLevelDimensions.EXPERIENCE.weight +
    structure.topLevelDimensions.EFFICIENCY.weight +
    structure.topLevelDimensions.PHILOSOPHY.weight;
  
  if (Math.abs(topLevelSum - 1) > 0.001) {
    throw new AxiomViolationError(
      'AXIOM_2_HIERARCHY',
      `顶层权重和 ${topLevelSum} 不等于 1，违反分层组合公理`,
      { topLevelSum },
    );
  }
  
  // 验证各子维度权重和为 1
  for (const [dimName, dim] of Object.entries(structure.topLevelDimensions)) {
    const subWeightSum = Object.values(dim.subDimensions)
      .reduce((sum, sub) => sum + sub.weight, 0);
    
    if (Math.abs(subWeightSum - 1) > 0.001) {
      throw new AxiomViolationError(
        'AXIOM_2_HIERARCHY',
        `维度 ${dimName} 的子权重和 ${subWeightSum} 不等于 1`,
        { dimension: dimName, subWeightSum },
      );
    }
  }
}

/**
 * 计算分层效用（符合公理二）
 */
export function computeHierarchicalUtility(structure: HierarchicalUtilityStructure): number {
  validateHierarchicalWeights(structure);
  
  let totalUtility = 0;
  
  for (const dim of Object.values(structure.topLevelDimensions)) {
    // 计算维度分数 = Σ αₖⱼ × subScoreⱼ
    let dimensionScore = 0;
    for (const sub of Object.values(dim.subDimensions)) {
      dimensionScore += sub.weight * sub.score.value;
    }
    
    // 累加到总效用 = Σ βₖ × DimensionScoreₖ
    totalUtility += dim.weight * dimensionScore;
  }
  
  return totalUtility;
}

// ============================================================================
// 公理三：硬约束优先公理 (Feasibility Precedence Axiom)
// ============================================================================

/**
 * 硬约束优先公理：违反硬约束的计划不得通过效用补偿
 * 
 * 形式化：
 * Utility(plan, state) = -∞ if violatesHardConstraint else weightedScore
 */

/** 硬约束违规结果 */
export interface HardConstraintViolation {
  constraintId: string;
  constraintType: string;
  description: string;
  severity: 'CRITICAL' | 'SEVERE';
  evidenceRefs: string[];
}

/** 可行性检查结果 */
export interface FeasibilityCheckResult {
  /** 是否可行 */
  isFeasible: boolean;
  
  /** 硬约束违规列表（任何违规 = 不可行） */
  hardViolations: HardConstraintViolation[];
  
  /** 可行性概率（概率模式下） */
  feasibilityProbability?: number;
}

/**
 * 公理三：计算带可行性的效用
 * 
 * 如果违反硬约束，返回 -Infinity
 */
export function computeUtilityWithFeasibility(
  baseUtility: number,
  feasibility: FeasibilityCheckResult,
): number {
  if (!feasibility.isFeasible) {
    // 公理三核心：硬约束违规 = -∞
    return -Infinity;
  }
  return baseUtility;
}

// ============================================================================
// 公理四：不确定性一致公理 (Uncertainty Consistency Axiom)
// ============================================================================

/**
 * 不确定性一致公理：概率层必须包装确定性层，而非替代
 * 
 * 形式化：E[U(plan)] = E_s[Utility(plan, s)]
 * 其中 Utility(plan, s) 必须等价于 Phase 1 的输出
 */

/** 通用世界状态样本（公理四使用） */
export interface GenericWorldStateSample {
  /** 样本 ID */
  sampleId: string;
  
  /** 确定性世界状态 */
  deterministicState: any; // WorldModelContext
  
  /** 采样权重 */
  weight: number;
}

/**
 * 公理四：计算期望效用（概率层包装确定性层）
 * 
 * @param samples 世界状态样本
 * @param utilityFn 确定性效用函数（Phase 1 的 evaluate）
 */
export function computeExpectedUtility(
  samples: GenericWorldStateSample[],
  utilityFn: (state: any) => number,
): number {
  if (samples.length === 0) return 0;
  
  let weightedSum = 0;
  let totalWeight = 0;
  
  for (const sample of samples) {
    // 关键：使用与 Phase 1 相同的效用函数
    const utility = utilityFn(sample.deterministicState);
    weightedSum += utility * sample.weight;
    totalWeight += sample.weight;
  }
  
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

// ============================================================================
// 公理五：稳健性优先公理 (Robustness Axiom)
// ============================================================================

/**
 * 稳健性优先公理：最优方案定义为在可行约束下最大化稳健期望效用
 * 
 * 形式化：
 * Choose plan* such that:
 *   max E[U]
 *   subject to:
 *     P_feasible ≥ θ₁
 *     P(U < τ) ≤ θ₂
 * 
 * 其中：
 * - θ₁ = 最小可行概率
 * - θ₂ = 最大可接受下行风险
 * - τ = 中性效用阈值
 */

/** 风险约束配置 */
export interface RobustnessConstraints {
  /** θ₁: 最小可行概率 (0.7-1.0) */
  minFeasibilityProbability: number;
  
  /** θ₂: 最大可接受下行风险 (0-0.3) */
  maxDownsideRisk: number;
  
  /** τ: 中性效用阈值 (0.4-0.6) */
  neutralUtilityThreshold: number;
}

/** 默认风险约束 */
export const DEFAULT_ROBUSTNESS_CONSTRAINTS: RobustnessConstraints = {
  minFeasibilityProbability: 0.85,
  maxDownsideRisk: 0.15,
  neutralUtilityThreshold: 0.5,
};

/** 稳健性评估结果 */
export interface RobustnessEvaluation {
  /** 期望效用 E[U] */
  expectedUtility: number;
  
  /** 可行概率 P_feasible */
  feasibilityProbability: number;
  
  /** 下行风险 P(U < τ) */
  downsideRisk: number;
  
  /** 是否满足稳健性约束 */
  satisfiesRobustnessConstraints: boolean;
  
  /** 违反的约束 */
  violatedConstraints: string[];
  
  /** 效用分布统计 */
  utilityDistribution: {
    mean: number;
    std: number;
    percentile5: number;
    percentile25: number;
    median: number;
    percentile75: number;
    percentile95: number;
  };
}

/**
 * 公理五：评估稳健性
 */
export function evaluateRobustness(
  utilities: number[],
  feasibilityProb: number,
  constraints: RobustnessConstraints = DEFAULT_ROBUSTNESS_CONSTRAINTS,
): RobustnessEvaluation {
  const sorted = [...utilities].sort((a, b) => a - b);
  const n = sorted.length;
  
  const mean = utilities.reduce((a, b) => a + b, 0) / n;
  const variance = utilities.reduce((sum, u) => sum + (u - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  
  // 计算下行风险：P(U < τ)
  const belowThreshold = utilities.filter(u => u < constraints.neutralUtilityThreshold).length;
  const downsideRisk = belowThreshold / n;
  
  // 检查约束
  const violatedConstraints: string[] = [];
  
  if (feasibilityProb < constraints.minFeasibilityProbability) {
    violatedConstraints.push(`P_feasible (${feasibilityProb.toFixed(2)}) < θ₁ (${constraints.minFeasibilityProbability})`);
  }
  
  if (downsideRisk > constraints.maxDownsideRisk) {
    violatedConstraints.push(`P(U<τ) (${downsideRisk.toFixed(2)}) > θ₂ (${constraints.maxDownsideRisk})`);
  }
  
  return {
    expectedUtility: mean,
    feasibilityProbability: feasibilityProb,
    downsideRisk,
    satisfiesRobustnessConstraints: violatedConstraints.length === 0,
    violatedConstraints,
    utilityDistribution: {
      mean,
      std,
      percentile5: sorted[Math.floor(n * 0.05)] ?? sorted[0],
      percentile25: sorted[Math.floor(n * 0.25)] ?? sorted[0],
      median: sorted[Math.floor(n * 0.5)] ?? sorted[0],
      percentile75: sorted[Math.floor(n * 0.75)] ?? sorted[n - 1],
      percentile95: sorted[Math.floor(n * 0.95)] ?? sorted[n - 1],
    },
  };
}

// ============================================================================
// 公理六：自适应一致公理 (Adaptive Consistency Axiom)
// ============================================================================

/**
 * 自适应一致公理：系统允许学习偏好参数，但不得改变决策结构
 * 
 * 可学习：
 * - 维度权重 β
 * - 子指标权重 α
 * - 风险容忍阈值 θ₁, θ₂, τ
 * 
 * 不可学习：
 * - Score 的定义函数结构
 * - 硬约束逻辑
 * - 公理五的决策形式
 */

/** 可学习参数边界 */
export interface LearnableParameterBounds {
  /** 维度权重边界 */
  dimensionWeights: {
    min: number; // 通常 0
    max: number; // 通常 1
  };
  
  /** 风险阈值边界 */
  riskThresholds: {
    theta1: { min: number; max: number }; // 可行概率：[0.7, 1.0]
    theta2: { min: number; max: number }; // 下行风险：[0, 0.3]
    tau: { min: number; max: number };    // 效用阈值：[0.4, 0.6]
  };
}

/** 默认可学习参数边界 */
export const DEFAULT_LEARNABLE_BOUNDS: LearnableParameterBounds = {
  dimensionWeights: { min: 0, max: 1 },
  riskThresholds: {
    theta1: { min: 0.7, max: 1.0 },
    theta2: { min: 0, max: 0.3 },
    tau: { min: 0.4, max: 0.6 },
  },
};

/**
 * 验证参数更新是否符合公理六
 */
export function validateParameterUpdate(
  paramName: string,
  newValue: number,
  bounds: { min: number; max: number },
): void {
  if (newValue < bounds.min || newValue > bounds.max) {
    throw new AxiomViolationError(
      'AXIOM_6_ADAPTIVE',
      `参数 ${paramName} 的值 ${newValue} 超出允许范围 [${bounds.min}, ${bounds.max}]`,
      { paramName, newValue, bounds },
    );
  }
}

/**
 * 验证权重向量归一化
 */
export function validateWeightNormalization(weights: number[], tolerance: number = 0.001): void {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > tolerance) {
    throw new AxiomViolationError(
      'AXIOM_6_ADAPTIVE',
      `权重和 ${sum} 不等于 1，违反归一化约束`,
      { weights, sum },
    );
  }
}

// ============================================================================
// 公理七：多智能体一致性公理 (Multi-Agent Consistency Axiom)
// ============================================================================

/**
 * 多智能体一致性公理：所有决策子智能体必须在同一效用与约束空间内行动
 * 
 * 智能体角色：
 * - Abu: ConstraintValidator + Feasible Space Projector
 * - Dre: LocalSearchOperator
 * - Neptune: Variance Minimizer under fixed E[U]
 * 
 * 交互条件：
 * 1. 顺序独立性：固定执行顺序 Abu → Dre → Neptune
 * 2. 单调改进原则：U_new ≥ U_old or P_feasible_new ≥ P_feasible_old
 * 3. 收敛保证：候选数量有限，不允许递归嵌套
 */

/** 智能体角色定义 */
export type AgentRole = 
  | 'CONSTRAINT_VALIDATOR'    // Abu
  | 'LOCAL_SEARCH_OPERATOR'   // Dre
  | 'VARIANCE_MINIMIZER';     // Neptune

/** 智能体操作结果 */
export interface AgentOperationResult {
  /** 操作者 */
  agent: AgentRole;
  
  /** 操作前效用 */
  utilityBefore: number;
  
  /** 操作后效用 */
  utilityAfter: number;
  
  /** 操作前可行性 */
  feasibilityBefore: boolean;
  
  /** 操作后可行性 */
  feasibilityAfter: boolean;
  
  /** 是否满足单调改进 */
  satisfiesMonotonicImprovement: boolean;
  
  /** 操作描述 */
  operationDescription: string;
}

/**
 * 验证智能体操作符合公理七
 */
export function validateAgentOperation(result: AgentOperationResult): void {
  // 单调改进原则
  const utilityImproved = result.utilityAfter >= result.utilityBefore;
  const feasibilityImproved = result.feasibilityAfter || !result.feasibilityBefore;
  
  if (!utilityImproved && !feasibilityImproved) {
    throw new AxiomViolationError(
      'AXIOM_7_MULTI_AGENT',
      `智能体 ${result.agent} 操作违反单调改进原则`,
      {
        agent: result.agent,
        utilityBefore: result.utilityBefore,
        utilityAfter: result.utilityAfter,
        feasibilityBefore: result.feasibilityBefore,
        feasibilityAfter: result.feasibilityAfter,
      },
    );
  }
}

/** 智能体执行顺序 */
export const AGENT_EXECUTION_ORDER: AgentRole[] = [
  'CONSTRAINT_VALIDATOR',   // Abu first: 保证可行
  'LOCAL_SEARCH_OPERATOR',  // Dre second: 优化效用
  'VARIANCE_MINIMIZER',     // Neptune last: 平滑结构
];

// ============================================================================
// 公理违规错误
// ============================================================================

export type AxiomId = 
  | 'AXIOM_1_NORMALIZATION'
  | 'AXIOM_2_HIERARCHY'
  | 'AXIOM_3_FEASIBILITY'
  | 'AXIOM_4_UNCERTAINTY'
  | 'AXIOM_5_ROBUSTNESS'
  | 'AXIOM_6_ADAPTIVE'
  | 'AXIOM_7_MULTI_AGENT';

export class AxiomViolationError extends Error {
  constructor(
    public readonly axiomId: AxiomId,
    message: string,
    public readonly context: Record<string, any> = {},
  ) {
    super(`[${axiomId}] ${message}`);
    this.name = 'AxiomViolationError';
  }
}

// ============================================================================
// 系统本质定义
// ============================================================================

/**
 * TripNARA 系统本质：
 * 
 * argmax_plan E_s[U(plan, s)]
 * subject to:
 *   P_feasible ≥ θ₁
 *   P(U < τ) ≤ θ₂
 * 
 * 所有 Abu、Dre、Neptune、Monte Carlo、权重学习
 * 都只是这个公式的实现手段。
 */
export interface SystemEssence {
  /** 优化目标 */
  objective: 'MAXIMIZE_EXPECTED_UTILITY';
  
  /** 约束条件 */
  constraints: {
    feasibilityConstraint: 'P_feasible >= θ₁';
    downsideRiskConstraint: 'P(U < τ) <= θ₂';
  };
  
  /** 实现手段 */
  implementation: {
    utilityComputation: 'HierarchicalWeightedSum';
    uncertaintyHandling: 'MonteCarloSampling';
    constraintEnforcement: 'AbuValidator';
    localSearch: 'DreOperator';
    varianceMinimization: 'NeptuneBalancer';
    parameterLearning: 'GradientDescentOrBayesian';
  };
}

export const TRIPNARA_ESSENCE: SystemEssence = {
  objective: 'MAXIMIZE_EXPECTED_UTILITY',
  constraints: {
    feasibilityConstraint: 'P_feasible >= θ₁',
    downsideRiskConstraint: 'P(U < τ) <= θ₂',
  },
  implementation: {
    utilityComputation: 'HierarchicalWeightedSum',
    uncertaintyHandling: 'MonteCarloSampling',
    constraintEnforcement: 'AbuValidator',
    localSearch: 'DreOperator',
    varianceMinimization: 'NeptuneBalancer',
    parameterLearning: 'GradientDescentOrBayesian',
  },
};
