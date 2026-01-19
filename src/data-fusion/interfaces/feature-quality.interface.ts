// src/data-fusion/interfaces/feature-quality.interface.ts

import { DataSourceConfig } from './data-fusion.interface';

/**
 * 特征质量等级
 */
export type FeatureQualityLevel = 
  | 'EXCELLENT'  // 优秀（>= 0.9）
  | 'GOOD'       // 良好（>= 0.7）
  | 'FAIR'       // 一般（>= 0.5）
  | 'POOR'       // 较差（>= 0.3）
  | 'CRITICAL';  // 严重（< 0.3）

/**
 * 特征质量报告
 */
export interface FeatureQualityReport {
  /** 特征名称 */
  featureName: string;
  /** 特征值 */
  featureValue: any;
  /** 总体质量分数（0-1） */
  overallQuality: number;
  /** 质量等级 */
  qualityLevel: FeatureQualityLevel;
  /** 可靠性分数（0-1） */
  reliability: number;
  /** 完整性分数（0-1） */
  completeness: number;
  /** 时效性分数（0-1） */
  timeliness: number;
  /** 可追溯性分数（0-1） */
  traceability: number;
  /** 一致性分数（0-1） */
  consistency: number;
  /** 问题列表 */
  issues: Array<{
    type: 'RELIABILITY' | 'COMPLETENESS' | 'TIMELINESS' | 'TRACEABILITY' | 'CONSISTENCY';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    description: string;
    recommendation?: string;
  }>;
  /** 改进建议 */
  recommendations: string[];
  /** 评估时间戳 */
  assessedAt: string;
}

/**
 * 特征质量评估配置
 */
export interface FeatureQualityAssessmentConfig {
  /** 可靠性权重（默认0.25） */
  reliabilityWeight?: number;
  /** 完整性权重（默认0.20） */
  completenessWeight?: number;
  /** 时效性权重（默认0.20） */
  timelinessWeight?: number;
  /** 可追溯性权重（默认0.20） */
  traceabilityWeight?: number;
  /** 一致性权重（默认0.15） */
  consistencyWeight?: number;
  /** 可靠性阈值（默认0.7） */
  reliabilityThreshold?: number;
  /** 完整性阈值（默认0.8） */
  completenessThreshold?: number;
  /** 时效性阈值（秒，默认3600） */
  timelinessThresholdSeconds?: number;
  /** 是否启用详细评估（默认true） */
  enableDetailedAssessment?: boolean;
}
