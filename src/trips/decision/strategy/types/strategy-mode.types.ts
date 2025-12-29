// src/trips/decision/strategy/types/strategy-mode.types.ts
/**
 * Planning Strategy Mode Types
 * 
 * 规划策略模式：顶层输入，影响三人格的权重和决策
 */

/**
 * 策略模式
 */
export type StrategyMode =
  | 'SURVIVAL'      // 生存优先：安全、低风险、低复杂度
  | 'COMFORT'       // 舒适优先：少折腾，多休息
  | 'PHOTOGRAPHY'   // 摄影优先：黄金时刻、视野、少人
  | 'BUDGET'        // 预算优先：便宜
  | 'TIME'          // 时间优先：少折返，高效率
  | 'ADVENTURE';    // 冒险优先：强体验、容忍风险

/**
 * 策略参数
 */
export interface StrategyParams {
  /** 策略模式 */
  mode: StrategyMode;
  
  /** 三人格权重 */
  weights: {
    /** 安全官权重（Abu） */
    abu: number;
    /** 节奏官权重（Dr.Dre） */
    drDre: number;
    /** 修复官权重（Neptune） */
    neptune: number;
    /** 成本权重 */
    cost: number;
    /** 体验权重 */
    experience: number;
    /** 时间效率权重 */
    timeEfficiency: number;
  };
  
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 策略模式配置（默认权重映射）
 */
export const STRATEGY_MODE_WEIGHTS: Record<StrategyMode, StrategyParams['weights']> = {
  SURVIVAL: {
    abu: 0.5,
    drDre: 0.3,
    neptune: 0.2,
    cost: 0.2,
    experience: 0.3,
    timeEfficiency: 0.3,
  },
  COMFORT: {
    abu: 0.3,
    drDre: 0.5,  // 更注重节奏舒适
    neptune: 0.2,
    cost: 0.3,
    experience: 0.4,
    timeEfficiency: 0.2,
  },
  PHOTOGRAPHY: {
    abu: 0.3,
    drDre: 0.3,  // 放宽节奏约束，允许更长 Day
    neptune: 0.4, // 更积极地调整 POI，追求 vantage point
    cost: 0.2,
    experience: 0.6,
    timeEfficiency: 0.2,
  },
  BUDGET: {
    abu: 0.3,
    drDre: 0.3,
    neptune: 0.4,
    cost: 0.8,  // 成本权重最高
    experience: 0.3,
    timeEfficiency: 0.3,
  },
  TIME: {
    abu: 0.3,
    drDre: 0.4,
    neptune: 0.3,
    cost: 0.3,
    experience: 0.3,
    timeEfficiency: 0.8,  // 时间效率权重最高
  },
  ADVENTURE: {
    abu: 0.2,  // 降低安全约束
    drDre: 0.3,
    neptune: 0.5,  // 更积极修复，追求强体验
    cost: 0.2,
    experience: 0.8,  // 体验权重最高
    timeEfficiency: 0.3,
  },
};

/**
 * 从用户关键词提取策略模式
 */
export function extractStrategyModeFromKeywords(keywords: string[]): StrategyMode | null {
  const lowerKeywords = keywords.map(k => k.toLowerCase());
  
  // 优先级顺序（从最具体到最通用）
  if (lowerKeywords.some(k => k.includes('摄影') || k.includes('拍照') || k.includes('photo'))) {
    return 'PHOTOGRAPHY';
  }
  if (lowerKeywords.some(k => k.includes('穷游') || k.includes('便宜') || k.includes('budget') || k.includes('cheap'))) {
    return 'BUDGET';
  }
  if (lowerKeywords.some(k => k.includes('时间紧') || k.includes('快') || k.includes('time') || k.includes('efficient'))) {
    return 'TIME';
  }
  if (lowerKeywords.some(k => k.includes('冒险') || k.includes('刺激') || k.includes('adventure') || k.includes('extreme'))) {
    return 'ADVENTURE';
  }
  if (lowerKeywords.some(k => k.includes('舒适') || k.includes('轻松') || k.includes('comfort') || k.includes('relax'))) {
    return 'COMFORT';
  }
  if (lowerKeywords.some(k => k.includes('安全') || k.includes('稳妥') || k.includes('safe') || k.includes('survival'))) {
    return 'SURVIVAL';
  }
  
  return null;
}

/**
 * 创建策略参数
 */
export function createStrategyParams(mode: StrategyMode, customWeights?: Partial<StrategyParams['weights']>): StrategyParams {
  const defaultWeights = STRATEGY_MODE_WEIGHTS[mode];
  
  return {
    mode,
    weights: {
      ...defaultWeights,
      ...customWeights,
    },
  };
}

