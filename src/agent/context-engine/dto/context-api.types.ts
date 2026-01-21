// src/agent/context-engine/dto/context-api.types.ts
/**
 * Context API TypeScript 类型定义
 * 
 * 前端可直接导入使用这些类型定义
 */

/**
 * 统一响应格式
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

/**
 * Context Block
 */
export interface ContextBlock {
  key: string;
  type: BlockType;
  text: string;
  data?: Record<string, any>;
  priority: number;
  visibility: 'public' | 'private';
  provenance: BlockProvenance;
  estimatedTokens?: number;
  evidence?: BlockEvidence[];
  dataSource?: BlockDataSource;
  lastVerifiedAt?: string;
}

export type BlockType =
  | 'WORLD_MODEL'
  | 'COUNTRY_VISA'
  | 'COUNTRY_DRONE'
  | 'COUNTRY_ROAD_RULES'
  | 'COUNTRY_MONEY'
  | 'COUNTRY_SAFETY'
  | 'COUNTRY_WEATHER'
  | 'COUNTRY_TRANSPORT'
  | 'COUNTRY_BOOKING'
  | 'ABU_RULES'
  | 'DRDRE_RULES'
  | 'NEPTUNE_RULES'
  | 'PLAN_SUMMARY'
  | 'PLAN_DAY'
  | 'PLAN_SEGMENT'
  | 'DECISION_LOG'
  | 'REJECTION_LOG'
  | 'TOOL_OUTPUT'
  | 'USER_PROFILE'
  | 'CONSTRAINTS'
  | 'METADATA';

export interface BlockProvenance {
  source: 'skill' | 'pack' | 'db' | 'memory' | 'computed';
  identifier: string;
  version?: string;
  timestamp: string;
}

export interface BlockEvidence {
  source: string;
  verifiedAt: string;
  confidence: number;
  url?: string;
  reviewer?: string;
  metadata?: Record<string, any>;
}

export type BlockDataSource = 'API' | 'POSTGIS' | 'HUMAN' | 'MIXED' | 'COMPUTED' | 'PACK';

/**
 * Context Package
 */
export interface ContextPackage {
  id: string;
  tripId?: string;
  phase: string;
  agent: string;
  userQuery: string;
  blocks: ContextBlock[];
  totalTokens: number;
  tokenBudget: number;
  compressed: boolean;
  createdAt: string;
  metadata?: Record<string, any>;
}

/**
 * 构建 Context Package 请求
 */
export interface BuildContextPackageRequest {
  tripId?: string;
  phase: string;
  agent: string;
  userQuery: string;
  tokenBudget?: number;
  includePrivate?: boolean;
  requiredTopics?: string[];
  excludeTopics?: string[];
  useCache?: boolean;
}

/**
 * 构建 Context Package 响应
 */
export interface BuildContextPackageResponse {
  contextPackage: ContextPackage;
}

/**
 * 压缩 Context 请求
 */
export interface CompressContextRequest {
  blocks: ContextBlock[];
  tokenBudget: number;
  strategy?: 'aggressive' | 'conservative' | 'balanced';
  preserveKeys?: string[];
}

/**
 * 压缩 Context 响应
 */
export interface CompressContextResponse {
  compressedBlocks: ContextBlock[];
  stats: {
    originalBlocks: number;
    compressedBlocks: number;
    originalTokens: number;
    compressedTokens: number;
    reductionRatio: number;
    removedKeys: string[];
  };
}

/**
 * 投影状态请求
 */
export interface ProjectStateRequest {
  state: any; // TripState | LangGraphState
  includeFullState?: boolean;
  decisionLogLimit?: number;
  rejectionLogLimit?: number;
  tokenBudget?: number;
}

/**
 * 状态投影结果
 */
export interface StateProjection {
  public: PublicState;
  private: PrivateState;
  metadata: {
    projectedAt: string;
    tokenCount: number;
    truncated: boolean;
  };
}

export interface PublicState {
  user_intent: string;
  strategy_mode?: string;
  strategy_params_summary?: string;
  world_summary: {
    countryCode?: string;
    season?: string;
    routeDirectionId?: number;
    routeDirectionName?: string;
  };
  planning_phase: string;
  riskSignals?: string[];
  decisionLogSummary: Array<{
    agent: string;
    action: string;
    reasonCode: string;
    explanation: string;
    timestamp: string;
  }>;
  rejectionLogSummary?: string[];
  planSummary?: {
    totalDays: number;
    totalSegments: number;
    keyHighlights: string[];
  };
  topCountryBlocks?: string[];
}

export interface PrivateState {
  fullState?: any;
  fullLangGraphState?: any;
  toolRawOutputs: Record<string, any>;
  debugLogs: string[];
  internalScores?: Record<string, any>;
  privateFields?: Record<string, any>;
  longLists: {
    pois?: string;
    waypoints?: string;
    segments?: string;
    [key: string]: string | undefined;
  };
  largeFileRefs: {
    gpx?: string;
    geojson?: string;
    csv?: string;
    [key: string]: string | undefined;
  };
  intermediateResults?: Record<string, any>;
}

/**
 * 投影状态响应
 */
export interface ProjectStateResponse {
  projection: StateProjection;
}

/**
 * 写入回写请求
 */
export interface WriteBackRequest {
  tripRunId: string;
  attemptNumber: number;
  scratchpad: {
    planOutline?: string;
    openQuestions?: string[];
    constraintsAssumed?: string[];
    nextActions?: string[];
    failureNotes?: string;
  };
  decisionLogDelta?: any[];
  artifactsRefs?: Record<string, string>;
}

/**
 * 获取指标查询参数
 */
export interface GetMetricsQuery {
  tripId?: string;
  phase?: string;
  agent?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
}

/**
 * 指标记录
 */
export interface ContextMetricsRecord {
  id: string;
  tripId?: string;
  phase: string;
  agent: string;
  timestamp: string;
  tokens: {
    total: number;
    budget: number;
    overBudget: boolean;
    overBudgetRate: number;
  };
  blocks: {
    total: number;
    public: number;
    private: number;
    compressed: boolean;
    compressionRate?: number;
  };
  quality: {
    hitRate?: number;
    noiseRate: number;
    relevanceScore?: number;
    quality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  };
  performance: {
    buildTimeMs: number;
    cacheHit: boolean;
    skillsCalled: string[];
  };
  blockTypeDistribution: Record<string, number>;
  priorityDistribution: {
    high: number;
    medium: number;
    low: number;
  };
}

/**
 * 指标摘要
 */
export interface ContextMetricsSummary {
  timeRange: {
    start: string;
    end: string;
  };
  totalRecords: number;
  avgTokens: number;
  avgCompressionRate: number;
  avgHitRate?: number;
  avgNoiseRate: number;
  cacheHitRate: number;
  avgBuildTimeMs: number;
  qualityDistribution: {
    EXCELLENT: number;
    GOOD: number;
    FAIR: number;
    POOR: number;
  };
  topBlockTypes: Array<{ type: string; count: number }>;
}

/**
 * 获取指标响应
 */
export interface GetMetricsResponse {
  summary: ContextMetricsSummary;
  recent?: ContextMetricsRecord[];
}

/**
 * 错误码
 */
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  BUSINESS_ERROR = 'BUSINESS_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNSUPPORTED_ACTION = 'UNSUPPORTED_ACTION',
  UNAUTHORIZED = 'UNAUTHORIZED',
}
