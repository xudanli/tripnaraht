// src/trips/decision/data-quality/data-quality.model.ts

/**
 * 数据可用性分级 + 降级策略
 * 
 * 从 demo 到平台的分水岭：显式化数据质量
 */

export type DataConfidence = 'high' | 'medium' | 'low' | 'unknown';

export type DataSource = 
  | 'api_verified'      // API 直接返回
  | 'database_cached'   // 数据库缓存
  | 'user_provided'     // 用户输入
  | 'inferred'          // 推断/估算
  | 'default'           // 默认值
  | 'unknown';          // 未知

export interface DataQuality {
  confidence: DataConfidence;
  freshness?: number;   // 数据新鲜度（秒，从上次更新到现在）
  source: DataSource;
  lastUpdatedAt?: string; // ISO datetime
}

export interface ActivityCandidateQuality {
  // 各字段的数据质量
  openingHours?: DataQuality;
  duration?: DataQuality;
  cost?: DataQuality;
  location?: DataQuality;
  travelTime?: DataQuality;
  weatherSensitivity?: DataQuality;
}

/**
 * 依据等级：A（强约束可验证）/B（弱约束推断）/C（未知假设）
 */
export type PlanReliabilityLevel = 'A' | 'B' | 'C';

export interface PlanReliability {
  level: PlanReliabilityLevel;
  reasons: string[];
  missingDataFields: string[];
  assumptions: Array<{
    field: string;
    assumption: string;
    impact: 'low' | 'medium' | 'high';
  }>;
}

/**
 * 降级策略配置
 */
export interface DegradationStrategy {
  // 开放时间未知时的处理
  unknownOpeningHours: 'assume_open' | 'mark_verify' | 'exclude';
  
  // travel time 不可靠时的处理
  unreliableTravelTime: {
    bufferMultiplier: number;  // 缓冲倍数（默认 1.5）
    reduceDensity: boolean;    // 是否减少塞点密度
  };
  
  // 天气不确定时的处理
  uncertainWeather: {
    outdoorActivityPenalty: number;  // 户外活动降权（0-1）
    preferIndoorAlternatives: boolean;
  };
}

/**
 * 默认降级策略
 */
export const DEFAULT_DEGRADATION_STRATEGY: DegradationStrategy = {
  unknownOpeningHours: 'mark_verify',
  unreliableTravelTime: {
    bufferMultiplier: 1.5,
    reduceDensity: true,
  },
  uncertainWeather: {
    outdoorActivityPenalty: 0.3,
    preferIndoorAlternatives: true,
  },
};

/**
 * 评估数据质量
 */
export function assessDataQuality(
  source: DataSource,
  freshness?: number
): DataConfidence {
  if (source === 'api_verified' && (!freshness || freshness < 3600)) {
    return 'high';
  }
  if (source === 'database_cached' && freshness && freshness < 86400) {
    return 'medium';
  }
  if (source === 'inferred' || source === 'default') {
    return 'low';
  }
  if (source === 'unknown') {
    return 'unknown';
  }
  return 'medium';
}

/**
 * 评估计划可靠性
 */
export function assessPlanReliability(
  qualityMap: Record<string, DataQuality>
): PlanReliability {
  const reasons: string[] = [];
  const missingDataFields: string[] = [];
  const assumptions: Array<{
    field: string;
    assumption: string;
    impact: 'low' | 'medium' | 'high';
  }> = [];

  let hasHighConfidence = false;
  let hasLowConfidence = false;

  for (const [field, quality] of Object.entries(qualityMap)) {
    if (quality.confidence === 'unknown') {
      missingDataFields.push(field);
      assumptions.push({
        field,
        assumption: getDefaultAssumption(field),
        impact: getFieldImpact(field),
      });
    } else if (quality.confidence === 'high') {
      hasHighConfidence = true;
    } else if (quality.confidence === 'low') {
      hasLowConfidence = true;
      reasons.push(`${field} 数据置信度较低 (${quality.source})`);
    }
  }

  let level: PlanReliabilityLevel;
  if (missingDataFields.length === 0 && hasHighConfidence && !hasLowConfidence) {
    level = 'A';
    reasons.push('所有关键数据均可用且可靠');
  } else if (missingDataFields.length <= 2 && hasHighConfidence) {
    level = 'B';
    reasons.push('大部分数据可用，部分字段需要推断');
  } else {
    level = 'C';
    reasons.push('关键数据缺失，计划基于假设生成');
  }

  return {
    level,
    reasons,
    missingDataFields,
    assumptions,
  };
}

function getDefaultAssumption(field: string): string {
  const assumptions: Record<string, string> = {
    openingHours: '假设全天开放，需现场确认',
    duration: '使用平均停留时长估算',
    cost: '使用历史平均价格估算',
    travelTime: '使用距离估算，可能不准确',
    weatherSensitivity: '假设为中等敏感度',
  };
  return assumptions[field] || '使用默认值';
}

function getFieldImpact(field: string): 'low' | 'medium' | 'high' {
  const highImpact = ['openingHours', 'travelTime'];
  const mediumImpact = ['duration', 'cost'];
  
  if (highImpact.includes(field)) return 'high';
  if (mediumImpact.includes(field)) return 'medium';
  return 'low';
}

