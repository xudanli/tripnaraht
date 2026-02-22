// src/agent/context-engine/types/context-package.types.ts
/**
 * Context Package Types
 * 
 * TripNARA 的"上下文编译器"输出结构
 */

/**
 * Context Block（上下文块）
 */
export interface ContextBlock {
  /** 块的唯一标识 */
  key: string;
  
  /** 块类型 */
  type: BlockType;
  
  /** 给 LLM 的短文本 */
  text: string;
  
  /** 结构化 JSON 数据（可选） */
  data?: Record<string, any>;
  
  /** 优先级 (0-100) */
  priority: number;
  
  /** 可见性：public（可进 prompt）或 private（仅状态） */
  visibility: 'public' | 'private';
  
  /** 来源信息 */
  provenance: BlockProvenance;
  
  /** Token 估算（用于预算管理） */
  estimatedTokens?: number;
  
  /** 证据溯源（用于 RAG 可信度评估，P0 新增） */
  evidence?: BlockEvidence[];
  
  /** 数据来源类型（P0 新增） */
  dataSource?: BlockDataSource;
  
  /** 最后验证时间（ISO 8601 格式，P0 新增） */
  lastVerifiedAt?: string;
}

/**
 * Block 类型
 */
export type BlockType =
  | 'WORLD_MODEL'        // 世界模型摘要
  | 'COUNTRY_VISA'       // 签证/证件要求
  | 'COUNTRY_DRONE'      // 无人机规则
  | 'COUNTRY_ROAD_RULES' // 道路规则
  | 'COUNTRY_MONEY'      // 货币/支付习惯
  | 'COUNTRY_SAFETY'     // 安全信息
  | 'COUNTRY_WEATHER'    // 天气窗口
  | 'COUNTRY_TRANSPORT'  // 当地交通
  | 'COUNTRY_BOOKING'    // 预订规范
  | 'ABU_RULES'          // Abu 的硬规则
  | 'DRDRE_RULES'        // Dr.Dre 的节奏规则
  | 'NEPTUNE_RULES'      // Neptune 的哲学规则
  | 'PLAN_SUMMARY'       // 计划摘要
  | 'PLAN_DAY'           // 某天的计划片段
  | 'PLAN_SEGMENT'       // 某段路的计划片段
  | 'DECISION_LOG'       // 决策日志摘要
  | 'REJECTION_LOG'      // 拒绝日志
  | 'TOOL_OUTPUT'        // 工具输出摘要
  | 'USER_PROFILE'       // 用户画像
  | 'CONSTRAINTS'        // 约束条件
  | 'METADATA'           // 元数据
  | 'API_DOCUMENTATION'  // API 接口文档
  | 'SYSTEM_CAPABILITY'; // 系统能力说明

/**
 * Block 来源信息
 */
export interface BlockProvenance {
  /** 来源类型 */
  source: 'skill' | 'pack' | 'db' | 'memory' | 'computed';
  
  /** 来源标识（skill 名称、pack ID、表名等） */
  identifier: string;
  
  /** 版本（可选） */
  version?: string;
  
  /** 时间戳 */
  timestamp: string;
}

/**
 * Block 证据条目（用于 RAG 可信度评估）
 */
export interface BlockEvidence {
  /** 证据来源（如 "Iceland Road Administration API", "Human Expert Review"） */
  source: string;
  
  /** 验证时间（ISO 8601 格式） */
  verifiedAt: string;
  
  /** 置信度 (0-1) */
  confidence: number;
  
  /** 证据 URL（可选） */
  url?: string;
  
  /** 审核人（可选，用于人工审核） */
  reviewer?: string;
  
  /** 其他元数据（可选） */
  metadata?: Record<string, any>;
}

/**
 * Block 数据来源类型
 */
export type BlockDataSource = 'API' | 'POSTGIS' | 'HUMAN' | 'MIXED' | 'COMPUTED' | 'PACK';

/**
 * Context Package（上下文包）
 */
export interface ContextPackage {
  /** Package ID */
  id: string;
  
  /** Trip ID */
  tripId?: string;
  
  /** 规划阶段 */
  phase: string;
  
  /** 当前 Agent */
  agent: string;
  
  /** 用户请求 */
  userQuery: string;
  
  /** 上下文块列表 */
  blocks: ContextBlock[];
  
  /** 总 Token 数（估算） */
  totalTokens: number;
  
  /** Token 预算 */
  tokenBudget: number;
  
  /** 是否已压缩 */
  compressed: boolean;
  
  /** 创建时间 */
  createdAt: string;
  
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * Context Package 构建选项
 */
export interface ContextPackageOptions {
  /** Trip ID */
  tripId?: string;
  
  /** 用户 ID（Phase 2.2 优化: 用于个性化学习） */
  userId?: string;
  
  /** 规划阶段 */
  phase: string;
  
  /** 当前 Agent */
  agent: string;
  
  /** 用户请求 */
  userQuery: string;
  
  /** Token 预算（默认 6000 * 0.6 = 3600） */
  tokenBudget?: number;
  
  /** 是否包含私有块（默认 false，只包含 public） */
  includePrivate?: boolean;
  
  /** 需要包含的主题块（可选） */
  requiredTopics?: string[];
  
  /** 需要排除的主题块（可选） */
  excludeTopics?: string[];
  
  /** 是否包含 API 文档（默认 false） */
  includeApiDocs?: boolean;
  
  /** 需要的 API 文档类别（可选） */
  apiDocCategories?: ApiDocCategory[];

  /** 是否包含工具选择（Context Orchestrator 统一调度 tools.select，默认 true） */
  includeToolSelection?: boolean;

  /** 分段规划：当前目标日索引（1-based），仅注入当天 + 前日摘要 */
  targetDayIndex?: number;
  /** 分段规划：前几日压缩摘要（DaySummary[]），供 buildPlanBlocks 按需注入 */
  previousDaysSummary?: Array<{ day: number; date: string; itemCount: number; keyLocations: string[] }>;

  /**
   * 目的地国家代码（ISO 3166-1 alpha-2，如 'IS', 'JP'）
   * 当 tripId 不可用时（如 from-natural-language 创建行程前）可传入，用于构建国家包块
   */
  destinationCountryCode?: string;
}

/**
 * API 文档类别
 */
export type ApiDocCategory =
  | 'ROLL'              // ROLL 架构 API
  | 'ADMIN'             // 后台管理 API
  | 'CONTEXT'           // Context Engine API
  | 'TRAINING'          // 训练相关 API
  | 'AGENT'             // Agent 相关 API
  | 'TRIPS'             // 行程相关 API
  | 'DECISION'          // 决策相关 API
  | 'ALL';              // 所有 API

/**
 * Context Package 投影（用于 LangGraph State）
 */
export interface ContextProjection {
  /** 公开块（可进 prompt） */
  publicBlocks: ContextBlock[];
  
  /** 私有状态对象（不进 prompt） */
  privateState: {
    /** 工具原始输出引用 */
    toolRawOutputs: Record<string, string>; // toolId -> filePath/refId
    
    /** Debug 日志引用 */
    debugLogs: string[]; // filePath/refId[]
    
    /** 内部评分详情 */
    internalScores?: Record<string, any>;
    
    /** 用户隐私字段 */
    privateFields?: Record<string, any>;
    
    /** 长列表 POI */
    poiLists?: Record<string, string>; // listId -> filePath/refId
  };
  
  /** 总 Token 数 */
  totalTokens: number;
  
  /** 是否超预算 */
  overBudget: boolean;
}