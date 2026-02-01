// src/trips/readiness/types/readiness-findings.types.ts

/**
 * Readiness Findings Types
 * 
 * 定义 Readiness Checker 的输出结果
 * 这些结果会被编译成决策层的约束
 */

import { ActionLevel, ReadinessCategory, RuleSeverity, HazardType, Task, LocalizedString, UserQuestion } from './readiness-pack.types';

/**
 * 前端兼容的用户问题格式
 * 简化版本，用于 API 响应
 */
export interface FrontendUserQuestion {
  id: string;                          // 问题ID（必填）
  text: string | { zh: string; en: string }; // 问题文本（必填，支持国际化）
  type: 'single' | 'multiple' | 'text'; // 问题类型：单选、多选、文本输入
  required?: boolean;                   // 是否必填（默认 true）
  options?: Array<string | { zh: string; en: string }>; // 选项列表（单选/多选时必填）
  placeholder?: string | { zh: string; en: string }; // 文本输入时的占位符
  validation?: {                        // 验证规则（可选）
    minLength?: number;                  // 最小长度
    maxLength?: number;                  // 最大长度
    pattern?: string;                    // 正则表达式
  };
}

export interface ReadinessFindingItem {
  id: string; // rule id
  category: ReadinessCategory;
  severity: RuleSeverity;
  level: ActionLevel;
  message: string;
  tasks?: Task[];
  /**
   * 用户问题（向后兼容）
   * 支持两种格式：
   * 1. 字符串数组（旧格式）：["您是否有冰川活动经验？"]
   * 2. 结构化格式（新格式）：UserQuestion[] 或 FrontendUserQuestion[]
   * 
   * 如果规则中有 userDecision，会优先转换为结构化格式
   */
  askUser?: string[] | FrontendUserQuestion[];
  evidence?: Array<{
    sourceId: string;
    sectionId?: string;
    quote?: string;
  }>;
}

export interface ReadinessFinding {
  destinationId: string;
  packId: string;
  packVersion: string;
  
  blockers: ReadinessFindingItem[]; // level === 'blocker'
  must: ReadinessFindingItem[]; // level === 'must'
  should: ReadinessFindingItem[]; // level === 'should'
  optional: ReadinessFindingItem[]; // level === 'optional'
  
  risks: Array<{
    type: HazardType;
    severity: RuleSeverity;
    summary: string;
    mitigations: string[];
    /**
     * 🆕 风险量化指标（可选）
     */
    quantification?: RiskQuantification;
  }>;
  
  missingInfo?: string[]; // 需要用户提供的信息
}

export interface ReadinessDisclaimer {
  /**
   * 免责声明消息
   * 告知用户本检查结果仅供参考，实际要求以官方机构为准
   */
  message: string;
  
  /**
   * 数据最后更新时间
   * 格式：ISO 8601 datetime
   * 来源：所有Pack的lastReviewedAt中的最新日期
   */
  lastUpdated?: string;
  
  /**
   * 数据来源列表
   * 例如：['pack.is.iceland', 'facts.NZ']
   */
  dataSources?: string[];
  
  /**
   * 用户必须自行验证的事项
   * 例如：['签证要求', '保险覆盖范围']
   */
  userActionRequired?: string[];
}

/**
 * 信任指标（用于建立用户信任）
 */
export interface TrustMetrics {
  /**
   * 能力信任（Capability Trust）
   * 展示系统的能力和准确性
   */
  capability: {
    score: number; // 0-1，能力信任分数
    factors: Array<{
      type: 'DATA_SOURCE' | 'GEO_FEATURES' | 'RULE_ACCURACY' | 'EVIDENCE_QUALITY';
      description: LocalizedString;
      score: number; // 0-1
    }>;
    explanation: LocalizedString; // 能力信任解释
  };

  /**
   * 善意信任（Benevolence Trust）
   * 展示系统的意图和动机（为用户安全着想）
   */
  benevolence: {
    score: number; // 0-1，善意信任分数
    factors: Array<{
      type: 'SAFETY_FOCUS' | 'USER_BENEFIT' | 'TRANSPARENCY' | 'LIMITATIONS_DISCLOSED';
      description: LocalizedString;
      score: number; // 0-1
    }>;
    explanation: LocalizedString; // 善意信任解释
  };

  /**
   * 可预测性信任（Predictability Trust）
   * 展示系统行为的一致性和可预测性
   */
  predictability: {
    score: number; // 0-1，可预测性信任分数
    factors: Array<{
      type: 'RULE_TRANSPARENCY' | 'CONSISTENCY' | 'EXPLAINABILITY';
      description: LocalizedString;
      score: number; // 0-1
    }>;
    explanation: LocalizedString; // 可预测性信任解释
  };

  /**
   * 总体信任分数
   */
  overall: number; // 0-1，总体信任分数（三个维度的加权平均）
}

/**
 * 风险量化指标
 */
export interface RiskQuantification {
  /**
   * 风险评分（0-1）
   * 0 = 无风险，1 = 极端风险
   */
  score: number;

  /**
   * 风险概率（0-1，可选）
   * 如果基于统计数据，提供概率值
   * 例如：0.05 表示 5% 的概率
   */
  probability?: number;

  /**
   * 量化指标（可选）
   * 例如：失温风险："15-30 分钟"（暴露时间）
   * 例如：水温风险："2-4°C"（水温范围）
   */
  metrics?: Array<{
    name: LocalizedString; // 指标名称，如 "暴露时间"、"水温"
    value: LocalizedString; // 指标值，如 "15-30 分钟"、"2-4°C"
    unit?: LocalizedString; // 单位，如 "分钟"、"°C"
    description?: LocalizedString; // 指标说明
  }>;

  /**
   * 风险对比（可选）
   * 与其他目的地或基准的对比
   */
  comparison?: {
    baseline: LocalizedString; // 基准，如 "冰岛平均水温"
    difference: LocalizedString; // 差异，如 "低 5-8°C"
    context?: LocalizedString; // 上下文说明
  };

  /**
   * 风险等级说明
   * 解释该风险等级的含义
   */
  levelExplanation?: LocalizedString;

  /**
   * 时间范围（可选）
   * 风险发生的时间窗口
   */
  timeWindow?: {
    start?: string; // ISO date or time
    end?: string; // ISO date or time
    description?: LocalizedString; // 时间窗口说明
  };

  /**
   * 地理范围（可选）
   * 风险影响的地理区域
   */
  geographicScope?: {
    description: LocalizedString; // 地理范围说明
    affectedAreas?: string[]; // 受影响区域列表
  };
}

export interface ReadinessCheckResult {
  findings: ReadinessFinding[];
  summary: {
    totalBlockers: number;
    totalMust: number;
    totalShould: number;
    totalOptional: number;
    totalRisks: number;
  };
  /**
   * 免责声明和责任边界
   * 必须包含在API响应中，前端必须显示给用户
   */
  disclaimer?: ReadinessDisclaimer;
  /**
   * 信任指标（可选，用于建立用户信任）
   */
  trustMetrics?: TrustMetrics;
}

