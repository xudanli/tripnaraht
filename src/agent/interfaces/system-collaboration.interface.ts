// src/agent/interfaces/system-collaboration.interface.ts

import { RouteType } from './router.interface';
import { AgentState } from './agent-state.interface';
import { System1Result } from './system1-info-card.interface';

/**
 * System 1 和 System 2 的协作模式
 */
export type CollaborationMode = 
  | 'SEQUENTIAL'      // 顺序执行（当前模式）
  | 'PARALLEL'        // 并行执行（System 1快速启动，System 2后台计算）
  | 'SYSTEM1_ONLY'    // 仅System 1
  | 'SYSTEM2_ONLY';   // 仅System 2

/**
 * 冲突类型
 */
export type ConflictType =
  | 'RESULT_DIVERGENCE'      // 结果分歧（System 1和System 2给出不同结论）
  | 'CONFIDENCE_GAP'         // 置信度差距（System 1高置信但System 2低置信）
  | 'RISK_ASSESSMENT_GAP'    // 风险评估差距
  | 'RECOMMENDATION_GAP'     // 推荐建议差距
  | 'DATA_INCONSISTENCY'     // 数据不一致（使用了不同的数据源）
  | 'TIMING_CONFLICT';       // 时间冲突（System 1快速响应但System 2需要更多时间）

/**
 * 冲突严重程度
 */
export type ConflictSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * 冲突详情
 */
export interface Conflict {
  type: ConflictType;
  severity: ConflictSeverity;
  description: string;
  system1Value?: any;        // System 1的值
  system2Value?: any;        // System 2的值
  difference?: string;      // 差异说明
  recommendation?: string;  // 处理建议
  requiresUserAttention: boolean;  // 是否需要用户关注
}

/**
 * 差异解释
 */
export interface DifferenceExplanation {
  field: string;            // 差异字段
  system1Explanation: string;  // System 1的解释
  system2Explanation: string;  // System 2的解释
  reason: string;          // 差异原因
  recommendation: string;  // 建议
}

/**
 * System 1 执行结果（协作模式）
 */
export interface System1CollaborationResult {
  result: System1Result;
  executionTime: number;   // 执行时间（毫秒）
  confidence: number;      // 置信度
  dataSources: string[];   // 使用的数据源
  timestamp: string;       // 时间戳
}

/**
 * System 2 执行结果（协作模式）
 */
export interface System2CollaborationResult {
  result: any;            // System 2的结果
  executionTime: number;  // 执行时间（毫秒）
  confidence: number;      // 置信度
  reasoningChain: string[];  // 推理链
  dataSources: string[];   // 使用的数据源
  timestamp: string;      // 时间戳
}

/**
 * 协作执行结果
 */
export interface CollaborationResult {
  mode: CollaborationMode;
  system1Result?: System1CollaborationResult;
  system2Result?: System2CollaborationResult;
  conflicts: Conflict[];
  differences: DifferenceExplanation[];
  finalRecommendation: {
    primarySystem: 'SYSTEM1' | 'SYSTEM2' | 'BOTH';
    recommendation: string;
    confidence: number;
    explanation: string;
  };
  executionTimeline: {
    system1StartTime: number;
    system1EndTime?: number;
    system2StartTime: number;
    system2EndTime?: number;
    totalTime: number;
  };
  shouldShowSystem1First: boolean;  // 是否应该先显示System 1的结果
  system2Pending: boolean;          // System 2是否仍在执行中
}

/**
 * 协作配置
 */
export interface CollaborationConfig {
  enableParallelExecution: boolean;  // 是否启用并行执行
  system1Timeout: number;            // System 1超时时间（毫秒），默认3000
  system2Timeout: number;            // System 2超时时间（毫秒），默认60000
  conflictDetectionEnabled: boolean; // 是否启用冲突检测
  autoResolveConflicts: boolean;     // 是否自动解决冲突
  showSystem1First: boolean;         // 是否先显示System 1结果
}

/**
 * 协作请求
 */
export interface CollaborationRequest {
  userInput: string;
  state: AgentState;
  route1: RouteType;  // System 1的路由
  route2: RouteType;  // System 2的路由（如果启用）
  config?: Partial<CollaborationConfig>;
}
