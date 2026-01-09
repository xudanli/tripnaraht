// src/agent/context-engine/types/trip-state-projection.types.ts
/**
 * TripState Projection Types
 * 
 * State Schema 投影：将全量 State 投影为 Public/Public 两部分
 */

import { TripState } from '../../../trips/decision/shared/trip-state.types';
import { LangGraphState } from '../../../trips/decision/orchestration/langgraph-orchestrator.interface';

/**
 * 公开状态（可进 prompt）
 */
export interface PublicState {
  /** 用户意图 */
  user_intent: string;
  
  /** 策略模式 */
  strategy_mode?: string;
  
  /** 策略参数摘要 */
  strategy_params_summary?: string;
  
  /** 世界模型上下文摘要 */
  world_summary: {
    countryCode?: string;
    season?: string;
    routeDirectionId?: number;
    routeDirectionName?: string;
  };
  
  /** 规划阶段 */
  planning_phase: string;
  
  /** 风险信号摘要 */
  riskSignals?: string[];
  
  /** 决策日志摘要（最近 N 条） */
  decisionLogSummary: Array<{
    agent: string;
    action: string;
    reasonCode: string;
    explanation: string;
    timestamp: string;
  }>;
  
  /** 拒绝日志摘要 */
  rejectionLogSummary?: string[];
  
  /** 计划摘要 */
  planSummary?: {
    totalDays: number;
    totalSegments: number;
    keyHighlights: string[];
  };
  
  /** 关键国家包块（已选中的主题块） */
  topCountryBlocks?: string[]; // 主题列表
}

/**
 * 私有状态（绝不进 prompt）
 */
export interface PrivateState {
  /** 完整的 TripState（用于内部计算） */
  fullState?: TripState;
  
  /** 完整的 LangGraphState（用于内部计算） */
  fullLangGraphState?: LangGraphState;
  
  /** 工具原始输出 */
  toolRawOutputs: Record<string, any>;
  
  /** Debug 日志 */
  debugLogs: string[];
  
  /** 内部评分详情 */
  internalScores?: Record<string, any>;
  
  /** 用户隐私字段 */
  privateFields?: Record<string, any>;
  
  /** 长列表（POI、路径点等） */
  longLists: {
    pois?: string; // filePath/refId
    waypoints?: string;
    segments?: string;
    [key: string]: string | undefined;
  };
  
  /** 大文件引用 */
  largeFileRefs: {
    gpx?: string;
    geojson?: string;
    csv?: string;
    [key: string]: string | undefined;
  };
  
  /** 中间计算结果 */
  intermediateResults?: Record<string, any>;
}

/**
 * 状态投影结果
 */
export interface StateProjection {
  /** 公开状态（可进 prompt） */
  public: PublicState;
  
  /** 私有状态（绝不进 prompt） */
  private: PrivateState;
  
  /** 投影元数据 */
  metadata: {
    projectedAt: string;
    tokenCount: number;
    truncated: boolean;
  };
}

/**
 * 投影配置
 */
export interface ProjectionConfig {
  /** 是否包含完整状态（默认 false，只包含摘要） */
  includeFullState?: boolean;
  
  /** 决策日志保留数量（默认 5） */
  decisionLogLimit?: number;
  
  /** 拒绝日志保留数量（默认 3） */
  rejectionLogLimit?: number;
  
  /** Token 预算（用于自动裁剪） */
  tokenBudget?: number;
}