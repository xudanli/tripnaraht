// src/data-fusion/interfaces/data-fusion.interface.ts

import { DataSourceInfo } from '../../data-quality/interfaces/data-quality-dimensions.interface';

/**
 * 数据冲突类型
 */
export type DataConflictType = 
  | 'VALUE_MISMATCH'      // 值不匹配
  | 'TYPE_MISMATCH'       // 类型不匹配
  | 'RANGE_MISMATCH'      // 范围不匹配
  | 'TEMPORAL_MISMATCH'   // 时间不匹配
  | 'SPATIAL_MISMATCH'    // 空间不匹配
  | 'LOGICAL_CONTRADICTION'; // 逻辑矛盾

/**
 * 冲突严重程度
 */
export type ConflictSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * 数据冲突
 */
export interface DataConflict {
  field: string;
  type: DataConflictType;
  severity: ConflictSeverity;
  sources: Array<{
    sourceId: string;
    sourceName: string;
    value: any;
    reliability: number;
    timestamp?: string;
  }>;
  description: string;
  impact: string[];
  resolutionStrategy?: 'RELIABILITY_WEIGHTED' | 'PRIORITY_SELECTION' | 'CONTEXT_BASED' | 'AVERAGE' | 'MANUAL';
}

/**
 * 冲突报告
 */
export interface ConflictReport {
  conflicts: DataConflict[];
  totalConflicts: number;
  criticalConflicts: number;
  highConflicts: number;
  mediumConflicts: number;
  lowConflicts: number;
  affectedFields: string[];
  summary: string;
}

/**
 * 融合策略
 */
export type FusionStrategy = 
  | 'RELIABILITY_WEIGHTED'  // 可靠性加权融合
  | 'PRIORITY_SELECTION'    // 优先级选择
  | 'CONTEXT_BASED'         // 情景化选择
  | 'AVERAGE'               // 平均值
  | 'MEDIAN'                // 中位数
  | 'MODE'                  // 众数
  | 'CONSENSUS';            // 共识

/**
 * 融合数据
 */
export interface FusedData {
  value: any;
  confidence: number;      // 融合后的置信度（0-1）
  strategy: FusionStrategy;
  sources: string[];        // 参与融合的数据源ID
  metadata: {
    fusionTimestamp: string;
    conflictCount: number;
    resolutionDetails: Array<{
      field: string;
      strategy: FusionStrategy;
      selectedValue: any;
      rejectedValues: Array<{ sourceId: string; value: any; reason: string }>;
    }>;
  };
}

/**
 * 数据源配置
 */
export interface DataSourceConfig {
  sourceId: string;
  sourceName: string;
  data: any;
  reliability: number;      // 可靠性得分（0-1）
  priority: number;         // 优先级（数字越大优先级越高）
  timestamp?: string;
  sourceInfo?: DataSourceInfo;
  context?: Record<string, any>;  // 数据源上下文
}

/**
 * 融合配置
 */
export interface FusionConfig {
  defaultStrategy?: FusionStrategy;
  reliabilityThreshold?: number;  // 最小可靠性阈值
  conflictResolutionStrategy?: 'AUTO' | 'MANUAL' | 'HYBRID';
  enableConflictDetection?: boolean;
  context?: Record<string, any>;  // 融合上下文
}

/**
 * 融合结果
 */
export interface FusionResult {
  fusedData: FusedData;
  conflictReport?: ConflictReport;
  qualityMetrics: {
    completeness: number;
    accuracy: number;
    consistency: number;
    overallQuality: number;
  };
  recommendations: string[];
}
