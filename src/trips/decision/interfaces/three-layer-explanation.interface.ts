// src/trips/decision/interfaces/three-layer-explanation.interface.ts

/**
 * 三层解释结构接口定义
 * 
 * 基于 AI_REASONING_SYSTEM_COMPLIANCE.md 的要求：
 * - 第一层：结论（用户可理解）
 * - 第二层：原因（为什么这样）
 * - 第三层：依据（数据来源、证据链）
 */

import { ExtendedDataSourceInfo } from '../../../data-quality/interfaces/source-annotation.interface';

/**
 * 证据链项
 */
export interface EvidenceChainItem {
  /** 步骤编号 */
  step: number;
  /** 操作类型 */
  operation: string;
  /** 输入 */
  input: string;
  /** 输出 */
  output: string;
  /** 方法 */
  method: string;
  /** 数据来源 */
  dataSource?: ExtendedDataSourceInfo;
}

/**
 * 三层解释结构
 */
export interface ThreeLayerExplanation {
  /** 第一层：结论 */
  layer1_conclusion: {
    /** 结论陈述 */
    statement: string;
    /** 置信度（0-1） */
    confidence: number;
  };

  /** 第二层：原因 */
  layer2_reason: {
    /** 主要因素 */
    primaryFactors: string[];
    /** 次要因素（可选） */
    contributingFactors?: string[];
    /** 完整的原因说明 */
    explanation: string;
  };

  /** 第三层：依据 */
  layer3_evidence: {
    /** 数据来源列表 */
    dataSources: ExtendedDataSourceInfo[];
    /** 计算方法说明（可选） */
    calculationMethod?: string;
    /** 模型假设 */
    assumptions: string[];
    /** 模型限制 */
    limitations: string[];
    /** 证据链 */
    evidenceChain: EvidenceChainItem[];
  };
}

/**
 * 用户友好的解释展示
 */
export interface UserFriendlyExplanation {
  /** 简短结论（一句话） */
  shortConclusion: string;
  /** 详细解释（可展开） */
  detailedExplanation: ThreeLayerExplanation;
  /** 是否可展开查看详情 */
  expandable: boolean;
}
