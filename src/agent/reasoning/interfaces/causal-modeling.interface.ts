// src/agent/reasoning/interfaces/causal-modeling.interface.ts

import { GraphNode, ReasoningGraph } from './graph-reasoning.interface';

/**
 * 因果关系类型
 */
export type CausalRelationType = 
  | 'DIRECT_CAUSE'      // 直接原因
  | 'INDIRECT_CAUSE'    // 间接原因
  | 'CONTRIBUTING_FACTOR'  // 贡献因素
  | 'CONFOUNDING_FACTOR';  // 混淆因素

/**
 * 因果关系强度
 */
export type CausalStrength = 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG';

/**
 * 因果关系
 */
export interface CausalRelation {
  id: string;
  cause: string;              // 原因节点ID
  effect: string;             // 结果节点ID
  type: CausalRelationType;
  strength: CausalStrength;
  confidence: number;         // 置信度（0-1）
  evidence?: string[];        // 证据节点ID列表
  explanation?: string;       // 因果关系说明
  metadata?: {
    correlation?: number;     // 相关性（-1到1）
    temporalOrder?: 'BEFORE' | 'SIMULTANEOUS' | 'AFTER';
    mechanism?: string;       // 机制说明
  };
}

/**
 * 因果链
 */
export interface CausalChain {
  id: string;
  nodes: string[];            // 节点ID序列
  relations: CausalRelation[]; // 因果关系序列
  strength: CausalStrength;   // 链的强度
  confidence: number;         // 链的置信度
  explanation: string;        // 因果链说明
}

/**
 * 因果推理结果
 */
export interface CausalReasoningResult {
  graph: ReasoningGraph;
  causalRelations: CausalRelation[];
  causalChains: CausalChain[];
  rootCauses: GraphNode[];   // 根本原因节点
  effects: GraphNode[];       // 结果节点
  overallConfidence: number;  // 总体置信度
  explanation: string;        // 推理解释
}

/**
 * 因果推理选项
 */
export interface CausalReasoningOptions {
  minStrength?: CausalStrength;  // 最小强度
  minConfidence?: number;        // 最小置信度
  maxChainLength?: number;       // 最大链长度
  includeIndirect?: boolean;    // 是否包含间接原因
}
