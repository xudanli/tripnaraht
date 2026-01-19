// src/data-quality/interfaces/confidence-annotation.interface.ts

/**
 * 置信度标注接口定义
 * 
 * 基于 AI_REASONING_SYSTEM_COMPLIANCE.md 的P2要求：
 * - 信息可信度标注（A/B/C/D等级）
 * - 为所有信息添加来源和置信度
 * - 不确定信息的标注
 */

import { ExtendedDataSourceInfo, VerificationLevel } from './source-annotation.interface';

/**
 * 置信度等级（A/B/C/D）
 */
export type ConfidenceLevel = 'A' | 'B' | 'C' | 'D';

/**
 * 置信度等级定义
 */
export interface ConfidenceLevelDefinition {
  /** 等级 */
  level: ConfidenceLevel;
  /** 等级名称 */
  name: string;
  /** 置信度范围 */
  confidenceRange: {
    min: number;
    max: number;
  };
  /** 描述 */
  description: string;
  /** 使用建议 */
  usageGuidance: string;
}

/**
 * 不确定信息类型
 */
export type UncertaintyType = 
  | 'MISSING_DATA'        // 数据缺失
  | 'OUTDATED_DATA'       // 数据过期
  | 'ESTIMATED_VALUE'     // 估算值
  | 'LLM_GENERATED'       // LLM生成
  | 'LOW_CONFIDENCE'      // 低置信度
  | 'CONFLICTING_SOURCES' // 来源冲突
  | 'PARTIAL_VERIFICATION'; // 部分验证

/**
 * 不确定信息标注
 */
export interface UncertaintyAnnotation {
  /** 不确定类型 */
  type: UncertaintyType;
  /** 不确定程度（0-1） */
  degree: number;
  /** 原因 */
  reason: string;
  /** 影响范围 */
  impact: string[];
  /** 缓解措施 */
  mitigation?: string[];
}

/**
 * 增强的置信度标注信息
 */
export interface EnhancedConfidenceAnnotation {
  /** 置信度等级（A/B/C/D） */
  confidenceLevel: ConfidenceLevel;
  /** 置信度分数（0-1） */
  confidenceScore: number;
  /** 数据来源信息 */
  source: ExtendedDataSourceInfo;
  /** 验证等级 */
  verificationLevel: VerificationLevel;
  /** 不确定信息标注（如果有） */
  uncertainty?: UncertaintyAnnotation;
  /** 置信度理由 */
  confidenceReason: string;
  /** 用户可见的置信度说明 */
  userFriendlyDescription: string;
}

/**
 * 带置信度标注的数据
 */
export interface ConfidenceAnnotatedData<T = any> {
  /** 数据值 */
  value: T;
  /** 字段名 */
  fieldName: string;
  /** 置信度标注 */
  confidence: EnhancedConfidenceAnnotation;
  /** 是否显示给用户 */
  shouldDisplay: boolean;
  /** 显示建议 */
  displaySuggestion?: {
    showConfidence: boolean;
    showSource: boolean;
    showUncertainty: boolean;
    warningMessage?: string;
  };
}

/**
 * 批量置信度标注结果
 */
export interface BatchConfidenceAnnotationResult {
  /** 标注的数据 */
  annotatedData: Record<string, ConfidenceAnnotatedData>;
  /** 标注统计 */
  statistics: {
    totalFields: number;
    annotatedFields: number;
    levelA: number;
    levelB: number;
    levelC: number;
    levelD: number;
    uncertainFields: number;
    llmGeneratedFields: number;
  };
  /** 总体置信度 */
  overallConfidence: {
    averageScore: number;
    averageLevel: ConfidenceLevel;
    lowestLevel: ConfidenceLevel;
  };
  /** 标注时间戳 */
  annotatedAt: Date;
}

/**
 * 置信度标注配置
 */
export interface ConfidenceAnnotationConfig {
  /** 是否显示低置信度信息 */
  showLowConfidence: boolean;
  /** 是否显示LLM生成内容 */
  showLLMGenerated: boolean;
  /** 最小置信度阈值 */
  minConfidenceThreshold: number;
  /** 是否要求来源验证 */
  requireSourceVerification: boolean;
}
