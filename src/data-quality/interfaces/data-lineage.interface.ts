// src/data-quality/interfaces/data-lineage.interface.ts

/**
 * 数据血统追踪接口定义
 * 
 * 基于 DATA_MODELING_COMPLIANCE.md 的P2要求：
 * - LineageTree结构
 * - 处理步骤记录
 * - 用户友好的解释生成
 */

import { ExtendedDataSourceInfo } from './source-annotation.interface';

/**
 * 数据源节点
 */
export interface DataSourceNode {
  /** 数据源ID */
  sourceId: string;
  /** 数据源类型 */
  type: string;
  /** 数据内容（可以是摘要） */
  data: any;
  /** 可靠性（0-1） */
  reliability: number;
  /** 数据新鲜度 */
  freshness: {
    timestamp: string;
    age: string; // 例如："2小时前"
    isStale: boolean;
  };
  /** 数据来源信息 */
  sourceInfo: ExtendedDataSourceInfo;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 处理步骤
 */
export interface ProcessingStep {
  /** 步骤编号 */
  step: number;
  /** 操作名称 */
  operation: string;
  /** 输入数据源ID列表 */
  input: string[]; // 引用dataSource中的sourceId
  /** 输出结果 */
  output: any;
  /** 处理方法 */
  method: string;
  /** 处理参数 */
  parameters?: Record<string, any>;
  /** 处理时间戳 */
  timestamp: string;
  /** 处理耗时（毫秒） */
  duration?: number;
  /** 依赖的步骤 */
  dependencies?: number[];
}

/**
 * 数据血统树
 */
export interface LineageTree {
  /** 数据源节点 */
  dataSources: Record<string, DataSourceNode>;
  /** 处理步骤列表 */
  processingSteps: ProcessingStep[];
  /** 最终输出值 */
  finalOutput: any;
  /** 最终置信度 */
  confidence: number;
  /** 假设 */
  assumptions: string[];
  /** 限制 */
  limitations: string[];
  /** 元数据 */
  metadata?: {
    createdAt: string;
    updatedAt: string;
    version: string;
  };
}

/**
 * 用户友好的解释
 */
export interface UserFriendlyExplanation {
  /** 简短总结 */
  summary: string;
  /** 详细解释 */
  detailedExplanation: string;
  /** 数据来源说明 */
  sourceExplanation: string;
  /** 处理过程说明 */
  processExplanation: string;
  /** 置信度说明 */
  confidenceExplanation: string;
  /** 可视化表示（可选） */
  visualization?: {
    type: 'TREE' | 'FLOW' | 'TIMELINE';
    data: any;
  };
}

/**
 * 数据血统查询选项
 */
export interface LineageQueryOptions {
  /** 是否包含详细数据 */
  includeData?: boolean;
  /** 是否包含处理步骤详情 */
  includeSteps?: boolean;
  /** 是否生成用户友好解释 */
  generateExplanation?: boolean;
  /** 最大深度 */
  maxDepth?: number;
}
