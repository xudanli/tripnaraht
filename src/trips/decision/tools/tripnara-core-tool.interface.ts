// src/trips/decision/tools/tripnara-core-tool.interface.ts
/**
 * TripNARA Core Tool Interface
 * 
 * 将 TripNARA 核心决策引擎封装成可以被 LangGraph / DeepAgents 调用的工具
 * 
 * 设计原则：
 * - 保持 Hard Core 的确定性逻辑不变
 * - 提供标准化的工具调用接口（兼容 MCP / OpenAPI）
 * - 让 LangGraph 作为"调度员"而非"驾驶员"
 */

import { RoutePlanDraft } from '../shared/world-model.types';

/**
 * TripNARA Core Tool 输入参数
 * 
 * 从用户查询中提取的参数，映射到 WorldModelContext
 */
export interface TripNaraCoreToolInput {
  /** 国家代码 */
  countryCode: string;
  
  /** 月份（1-12） */
  month: number;
  
  /** 路线方向 ID */
  routeDirectionId: string;
  
  /** 用户能力参数（从 HumanCapabilityModel 投影） */
  humanCapability: {
    maxDailyAscentM?: number;
    rollingAscent3DaysM?: number;
    maxSlopePct?: number;
    preferredPace?: 'SLOW' | 'MEDIUM' | 'FAST';
    riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
    highAltitudeExperience?: 'NONE' | 'BASIC' | 'ADVANCED';
    /** 特殊限制（例如：膝盖不好） */
    specialConstraints?: string[];
  };
  
  /** 初始路线计划（可选，如果已有草案） */
  initialPlan?: RoutePlanDraft;
  
  /** 元数据（用于 LangGraph 传递上下文） */
  metadata?: Record<string, any>;
}

/**
 * TripNARA Core Tool 输出结果
 */
export interface TripNaraCoreToolOutput {
  /** 是否允许 */
  allowed: boolean;
  
  /** 最终计划（如果被拒绝则为 null） */
  plan: RoutePlanDraft | null;
  
  /** 决策动作 */
  action: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
  
  /** 决策日志（用于解释和调试） */
  logs: Array<{
    persona: 'ABU' | 'DR_DRE' | 'NEPTUNE';
    action: string;
    explanation: string;
    decisionSource: 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC';
  }>;
  
  /** 可读的解释（用于 Narrator Agent） */
  explanation: string;
  
  /** 元数据（用于 LangGraph 传递上下文） */
  metadata?: Record<string, any>;
}

/**
 * TripNARA Core Tool 接口
 * 
 * 这个接口将被 LangGraph 作为 Tool 调用
 */
export interface ITripNaraCoreTool {
  /**
   * 执行路线决策
   * 
   * @param input 工具输入参数
   * @returns 工具输出结果
   */
  execute(input: TripNaraCoreToolInput): Promise<TripNaraCoreToolOutput>;
  
  /**
   * 获取工具描述（用于 LangGraph Tool 注册）
   */
  getDescription(): string;
  
  /**
   * 获取工具参数 Schema（用于 LangGraph Tool 注册）
   */
  getSchema(): Record<string, any>;
}

/**
 * Tool 错误类型
 */
export class TripNaraCoreToolError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_INPUT' | 'EXECUTION_FAILED' | 'TIMEOUT',
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'TripNaraCoreToolError';
  }
}

