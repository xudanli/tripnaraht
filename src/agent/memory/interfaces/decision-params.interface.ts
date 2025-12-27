// src/agent/memory/interfaces/decision-params.interface.ts

/**
 * DecisionParams: Agent 真正使用的决策参数
 * 
 * 这是 UserTravelProfile 映射后的产物，直接作用于决策引擎
 */

export interface DecisionParams {
  // RouteDirection 层权重
  routeDirectionBias: {
    difficultyWeight: number;    // 难度权重
    sceneryWeight: number;        // 风景权重
    adventureWeight: number;      // 冒险权重
    stabilityWeight: number;      // 稳定性权重
  };

  // 约束层（DEM / 地形 / 节奏）
  constraints: {
    maxDailyAscentM?: number;     // 每日最大爬升（米）
    maxElevationM?: number;       // 最大海拔（米）
    maxSlopePct?: number;          // 最大坡度（百分比）
    bufferTimeMin?: number;       // 缓冲时间（分钟）
    avoidRapidAscent?: boolean;   // 是否避免快速上升
  };

  // 策略偏好权重
  strategyPreference: {
    abuWeight: number;             // Abu 策略权重（保守）
    drDreWeight: number;           // Dr.Dre 策略权重（结构调整）
    neptuneWeight: number;         // Neptune 策略权重（修复）
  };

  // 修复倾向
  repairPolicy: {
    preferSplitDays: boolean;      // 优先拆天
    preferAltRoute: boolean;       // 优先替代路线
    preferRestDay: boolean;        // 优先休息日
  };
}

/**
 * 创建默认决策参数
 */
export function createDefaultDecisionParams(): DecisionParams {
  return {
    routeDirectionBias: {
      difficultyWeight: 0.5,
      sceneryWeight: 0.5,
      adventureWeight: 0.5,
      stabilityWeight: 0.5,
    },
    constraints: {},
    strategyPreference: {
      abuWeight: 0.33,
      drDreWeight: 0.33,
      neptuneWeight: 0.34,
    },
    repairPolicy: {
      preferSplitDays: false,
      preferAltRoute: false,
      preferRestDay: false,
    },
  };
}

/**
 * 归一化决策参数（确保权重在合理范围内）
 */
export function normalizeDecisionParams(params: DecisionParams): DecisionParams {
  // 归一化策略权重（总和为 1）
  const strategySum = params.strategyPreference.abuWeight +
    params.strategyPreference.drDreWeight +
    params.strategyPreference.neptuneWeight;
  
  if (strategySum > 0) {
    params.strategyPreference.abuWeight /= strategySum;
    params.strategyPreference.drDreWeight /= strategySum;
    params.strategyPreference.neptuneWeight /= strategySum;
  }

  // 归一化 RouteDirection 权重（总和为 1）
  const biasSum = params.routeDirectionBias.difficultyWeight +
    params.routeDirectionBias.sceneryWeight +
    params.routeDirectionBias.adventureWeight +
    params.routeDirectionBias.stabilityWeight;
  
  if (biasSum > 0) {
    params.routeDirectionBias.difficultyWeight /= biasSum;
    params.routeDirectionBias.sceneryWeight /= biasSum;
    params.routeDirectionBias.adventureWeight /= biasSum;
    params.routeDirectionBias.stabilityWeight /= biasSum;
  }

  // 限制约束值在合理范围内
  if (params.constraints.maxDailyAscentM) {
    params.constraints.maxDailyAscentM = Math.max(0, Math.min(2000, params.constraints.maxDailyAscentM));
  }
  if (params.constraints.maxElevationM) {
    params.constraints.maxElevationM = Math.max(0, Math.min(8000, params.constraints.maxElevationM));
  }
  if (params.constraints.maxSlopePct) {
    params.constraints.maxSlopePct = Math.max(0, Math.min(50, params.constraints.maxSlopePct));
  }
  if (params.constraints.bufferTimeMin) {
    params.constraints.bufferTimeMin = Math.max(0, Math.min(120, params.constraints.bufferTimeMin));
  }

  return params;
}

