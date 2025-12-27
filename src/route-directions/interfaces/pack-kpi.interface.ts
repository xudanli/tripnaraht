// src/route-directions/interfaces/pack-kpi.interface.ts
/**
 * 国家 Pack KPI 验收接口
 * 
 * P1.4: 国家 Pack KPI 验收
 * 
 * KPI定义：
 * 1. RouteDirection KPI：
 *    - distinct personality（独特个性）
 *    - different constraint combinations（不同约束组合）
 * 2. 用户偏好 KPI：
 *    - different results across countries/directions（不同国家/方向下产生不同结果）
 */

/**
 * RouteDirection 独特性指标
 */
export interface RouteDirectionPersonalityKPI {
  /** RouteDirection ID */
  routeDirectionId: string;
  /** RouteDirection 名称 */
  name: string;
  /** 标签独特性得分（0-100） */
  tagUniquenessScore: number;
  /** 约束独特性得分（0-100） */
  constraintUniquenessScore: number;
  /** 风险画像独特性得分（0-100） */
  riskProfileUniquenessScore: number;
  /** 综合独特性得分（0-100） */
  overallPersonalityScore: number;
  /** 独特性分析 */
  analysis: {
    /** 独特标签（与其他RouteDirection不同的标签） */
    uniqueTags: string[];
    /** 独特约束（与其他RouteDirection不同的约束） */
    uniqueConstraints: string[];
    /** 独特风险特征（与其他RouteDirection不同的风险特征） */
    uniqueRiskFeatures: string[];
  };
}

/**
 * 约束组合多样性指标
 */
export interface ConstraintCombinationKPI {
  /** 约束组合总数 */
  totalCombinations: number;
  /** 唯一约束组合数 */
  uniqueCombinations: number;
  /** 约束组合多样性得分（0-100） */
  diversityScore: number;
  /** 约束组合详情 */
  combinations: Array<{
    /** 约束组合ID */
    id: string;
    /** 约束组合描述 */
    description: string;
    /** 使用该组合的RouteDirection数量 */
    routeDirectionCount: number;
    /** 约束值 */
    constraints: {
      hard?: Record<string, any>;
      soft?: Record<string, any>;
    };
  }>;
}

/**
 * 用户偏好差异化指标
 */
export interface UserPreferenceDifferentiationKPI {
  /** 测试场景总数 */
  totalScenarios: number;
  /** 产生不同结果的场景数 */
  differentiatedScenarios: number;
  /** 差异化得分（0-100） */
  differentiationScore: number;
  /** 测试场景详情 */
  scenarios: Array<{
    /** 场景ID */
    scenarioId: string;
    /** 场景描述 */
    description: string;
    /** 用户偏好 */
    preferences: {
      pace?: 'relaxed' | 'moderate' | 'intense';
      riskTolerance?: 'low' | 'medium' | 'high';
      intents?: Record<string, number>;
    };
    /** 不同国家/方向下的选择结果 */
    results: Array<{
      /** 国家代码 */
      countryCode: string;
      /** 选择的RouteDirection ID */
      selectedRouteDirectionId: string;
      /** 选择的RouteDirection 名称 */
      selectedRouteDirectionName: string;
      /** 得分 */
      score: number;
    }>;
    /** 是否产生差异化结果 */
    isDifferentiated: boolean;
    /** 差异化原因 */
    differentiationReason?: string;
  }>;
}

/**
 * Pack KPI 验收结果
 */
export interface PackKPIAcceptanceResult {
  /** Pack 国家代码 */
  countryCode: string;
  /** Pack 国家名称 */
  countryName: string;
  /** 验收时间 */
  acceptanceTime: string;
  /** 是否通过验收 */
  passed: boolean;
  /** 总体得分（0-100） */
  overallScore: number;
  /** RouteDirection 独特性 KPI */
  personalityKPI: {
    /** 平均独特性得分 */
    averagePersonalityScore: number;
    /** 最低独特性得分 */
    minPersonalityScore: number;
    /** 最高独特性得分 */
    maxPersonalityScore: number;
    /** 是否通过（平均得分 >= 60） */
    passed: boolean;
    /** 详细指标 */
    details: RouteDirectionPersonalityKPI[];
  };
  /** 约束组合多样性 KPI */
  constraintCombinationKPI: {
    /** 多样性得分 */
    diversityScore: number;
    /** 是否通过（多样性得分 >= 70） */
    passed: boolean;
    /** 详细指标 */
    details: ConstraintCombinationKPI;
  };
  /** 用户偏好差异化 KPI */
  userPreferenceDifferentiationKPI: {
    /** 差异化得分 */
    differentiationScore: number;
    /** 是否通过（差异化得分 >= 70） */
    passed: boolean;
    /** 详细指标 */
    details: UserPreferenceDifferentiationKPI;
  };
  /** 问题和建议 */
  issues: string[];
  recommendations: string[];
}
