// src/trips/decision/orchestration/langgraph-orchestrator.interface.ts
/**
 * LangGraph 编排器接口
 * 
 * 设计原则：
 * - LangGraph 作为"调度员"而非"驾驶员"
 * - 保护 Hard Core（Abu / Dr.Dre / Neptune）的确定性逻辑
 * - 负责多 Agent 协作、状态管理、分支控制
 * 
 * 注意：这是接口设计，实际实现需要：
 * 1. 安装 @langchain/langgraph 或类似库
 * 2. 在 Priority 2 阶段实施
 */

/**
 * LangGraph Agent 类型
 */
export type LangGraphAgentType =
  | 'PLANNER' // 意图识别、任务拆解
  | 'NARRATOR' // 结果润色、故事层文案
  | 'COMPLIANCE' // 合规检查（RAG + 文档库）
  | 'LOCAL_INSIGHT' // 本地洞察（RAG 负责）
  | 'CORE_DECISION'; // TripNARA Core Tool（封装调用）

/**
 * 规划阶段
 */
export type PlanningPhase = 'DRAFTING' | 'SAFETY_CHECK' | 'PACING_ADJUSTMENT' | 'FINALIZING';

/**
 * LangGraph 节点状态
 */
export interface LangGraphState {
  /** 用户查询 */
  userQuery: string;
  
  /** 提取的参数 */
  extractedParams?: {
    countryCode?: string;
    month?: number;
    routeDirectionId?: string;
    humanCapability?: Record<string, any>;
    specialConstraints?: string[];
    /** 策略模式（从用户查询中提取） */
    strategyMode?: import('../strategy/types/strategy-mode.types').StrategyMode;
  };
  
  /** 规划阶段 */
  planningPhase?: PlanningPhase;
  
  /** 策略模式 */
  strategyMode?: import('../strategy/types/strategy-mode.types').StrategyMode;
  
  /** TripNARA Core Tool 的输入 */
  coreToolInput?: any;
  
  /** TripNARA Core Tool 的输出 */
  coreToolOutput?: any;
  
  /** 合规检查结果 */
  complianceResult?: {
    requiresPermit: boolean;
    requiresGuide: boolean;
    valid: boolean;
    evidence: string[];
  };
  
  /** 最终响应 */
  finalResponse?: string;
  
  /** 错误信息 */
  error?: string;
  
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * LangGraph 节点配置
 */
export interface LangGraphNodeConfig {
  /** 节点 ID */
  id: string;
  
  /** Agent 类型 */
  agentType: LangGraphAgentType;
  
  /** 节点描述 */
  description: string;
  
  /** 前置条件（哪些节点必须完成） */
  dependsOn?: string[];
  
  /** 是否允许并行执行 */
  parallel?: boolean;
}

/**
 * LangGraph 编排器接口
 */
export interface ILangGraphOrchestrator {
  /**
   * 执行编排流程
   */
  execute(userQuery: string, context?: Record<string, any>): Promise<LangGraphState>;

  /**
   * 注册 Agent
   */
  registerAgent(
    agentType: LangGraphAgentType,
    agent: any // LangGraph Agent 实例
  ): void;

  /**
   * 获取编排图结构（用于可视化）
   */
  getGraphStructure(): {
    nodes: LangGraphNodeConfig[];
    edges: Array<{ from: string; to: string; condition?: string }>;
  };
}

/**
 * Planner Agent 接口
 * 
 * 职责：意图识别、任务拆解、参数提取
 */
export interface IPlannerAgent {
  /**
   * 分析用户查询（集成 Context Engineer）
   */
  analyzeQuery(state: LangGraphState): Promise<{
    intent: string;
    extractedParams: LangGraphState['extractedParams'];
    nextStep: 'CORE_DECISION' | 'COMPLIANCE_CHECK' | 'LOCAL_INSIGHT';
  }>;
}

/**
 * Narrator Agent 接口
 * 
 * 职责：结果润色、故事层文案生成
 */
export interface INarratorAgent {
  /**
   * 生成可读解释（集成 Context Engineer）
   */
  generateExplanation(
    coreToolOutput: any,
    state?: LangGraphState,
    complianceResult?: LangGraphState['complianceResult']
  ): Promise<string>;
}

/**
 * Compliance Agent 接口
 * 
 * 职责：合规检查（基于 RAG + 文档库）
 */
export interface IComplianceAgent {
  /**
   * 检查合规性
   */
  checkCompliance(
    countryCode: string,
    routeDirectionId: string,
    userParams: any
  ): Promise<LangGraphState['complianceResult']>;
}

