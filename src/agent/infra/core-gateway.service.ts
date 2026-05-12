// src/agent/infra/core-gateway.service.ts
/**
 * CoreGateway - 核心动作触发入口
 * 
 * 职责：
 * - 接收来自入口层 (PlanningAssistant/JourneyAssistant) 的动作请求
 * - 校验动作合法性
 * - 附加 traceId
 * - 路由到对应的 CoreAgent
 * - 统一预算管理
 * 
 * 架构位置：Agent Infra 层
 * 
 * 设计原则：
 * - 入口层只能通过 CoreGateway 触发核心动作
 * - 入口层不能直接调用 Tools/Skills
 * - 所有核心动作都必须经过此网关
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PlanningWorkbenchAgentService } from '../services/planning-workbench-agent.service';
import { ExecutionAgentService } from '../services/execution-agent.service';
import { TripDetailAgentService } from '../services/trip-detail-agent.service';

// ============== 类型定义 ==============

/**
 * 核心动作类型
 */
export type CoreActionType =
  // 规划动作
  | 'generatePlan'        // 生成方案
  | 'comparePlans'        // 对比方案
  | 'evaluatePlan'        // 评估方案
  | 'selectPlan'          // 选择方案
  // 执行动作
  | 'applyChangeIntent'   // 应用变更意图
  | 'rollback'            // 回滚
  | 'checkpoint'          // 创建检查点
  // 诊断动作
  | 'diagnose'            // 诊断行程状态
  | 'getTripStatus';      // 获取行程状态

/**
 * 动作预算
 */
export interface ActionBudget {
  maxDurationMs: number;
  maxLlmTokens: number;
  maxToolCalls: number;
  priority: 'low' | 'normal' | 'high' | 'critical';
}

/**
 * 核心动作请求
 */
export interface CoreAction {
  type: CoreActionType;
  payload: Record<string, unknown>;
  context: {
    userId: string;
    sessionId: string;
    traceId?: string;
    budget?: Partial<ActionBudget>;
  };
}

/**
 * 核心动作响应
 */
export interface CoreActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  
  // 元数据
  meta: {
    traceId: string;
    actionType: CoreActionType;
    durationMs: number;
    budgetUsed: {
      durationMs: number;
      llmTokens: number;
      toolCalls: number;
    };
    degraded: boolean;
  };
}

/**
 * 变更意图
 */
export interface ChangeIntent {
  intentId: string;
  type: 'destination' | 'schedule' | 'activity' | 'accommodation' | 'transport' | 'cancel' | 'add';
  target: {
    itemId?: string;
    dayIndex?: number;
    timeSlot?: string;
  };
  from?: unknown;
  to: unknown;
  constraints: {
    mustKeep?: string[];
    budget?: number;
    timeLimit?: string;
  };
  reason: string;
  urgency: 'low' | 'normal' | 'high' | 'immediate';
  userConfirmed: boolean;
}

// 默认预算配置
const DEFAULT_ACTION_BUDGETS: Record<CoreActionType, ActionBudget> = {
  // 规划动作 - 允许较长时间
  generatePlan: { maxDurationMs: 8000, maxLlmTokens: 4000, maxToolCalls: 10, priority: 'normal' },
  comparePlans: { maxDurationMs: 5000, maxLlmTokens: 3000, maxToolCalls: 5, priority: 'normal' },
  evaluatePlan: { maxDurationMs: 5000, maxLlmTokens: 3000, maxToolCalls: 5, priority: 'normal' },
  selectPlan: { maxDurationMs: 2000, maxLlmTokens: 1000, maxToolCalls: 2, priority: 'normal' },
  
  // 执行动作 - 需要更快响应
  applyChangeIntent: { maxDurationMs: 5000, maxLlmTokens: 2000, maxToolCalls: 8, priority: 'high' },
  rollback: { maxDurationMs: 3000, maxLlmTokens: 500, maxToolCalls: 5, priority: 'critical' },
  checkpoint: { maxDurationMs: 1000, maxLlmTokens: 0, maxToolCalls: 1, priority: 'high' },
  
  // 诊断动作 - 纯数据，无 LLM
  diagnose: { maxDurationMs: 2000, maxLlmTokens: 0, maxToolCalls: 0, priority: 'normal' },
  getTripStatus: { maxDurationMs: 1000, maxLlmTokens: 0, maxToolCalls: 0, priority: 'normal' },
};

@Injectable()
export class CoreGatewayService {
  private readonly logger = new Logger(CoreGatewayService.name);
  
  // 动作统计
  private actionStats: Record<string, { count: number; totalDurationMs: number; failures: number }> = {};

  constructor(
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly planningWorkbench?: PlanningWorkbenchAgentService,
    @Optional() private readonly executionAgent?: ExecutionAgentService,
    @Optional() private readonly tripDetailAgent?: TripDetailAgentService,
  ) {
    this.logger.log('🚪 CoreGateway 已初始化');
    
    // 初始化统计
    Object.keys(DEFAULT_ACTION_BUDGETS).forEach(action => {
      this.actionStats[action] = { count: 0, totalDurationMs: 0, failures: 0 };
    });
  }

  // ============== 核心方法 ==============

  /**
   * 执行核心动作（统一入口）
   */
  async execute<T = unknown>(action: CoreAction): Promise<CoreActionResult<T>> {
    const startTime = Date.now();
    const traceId = action.context.traceId || this.generateTraceId();
    
    this.logger.debug(`[${traceId}] 核心动作开始 | type=${action.type} | userId=${action.context.userId}`);
    
    // 合并预算
    const budget = this.resolveBudget(action.type, action.context.budget);
    
    // 更新统计
    if (this.actionStats[action.type]) {
      this.actionStats[action.type].count++;
    }

    try {
      // 校验动作
      const validationError = this.validateAction(action);
      if (validationError) {
        throw new Error(validationError);
      }

      // 路由到对应的 CoreAgent
      const result = await this.routeAction<T>(action, budget, traceId);
      
      const durationMs = Date.now() - startTime;
      
      // 更新统计
      if (this.actionStats[action.type]) {
        this.actionStats[action.type].totalDurationMs += durationMs;
      }

      this.logger.debug(`[${traceId}] 核心动作完成 | duration=${durationMs}ms`);

      return {
        success: true,
        data: result,
        meta: {
          traceId,
          actionType: action.type,
          durationMs,
          budgetUsed: {
            durationMs,
            llmTokens: 0, // TODO: 从 LLMExecutor 获取实际使用量
            toolCalls: 0, // TODO: 从 Orchestrator 获取实际使用量
          },
          degraded: false,
        },
      };

    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      
      // 更新失败统计
      if (this.actionStats[action.type]) {
        this.actionStats[action.type].failures++;
      }

      this.logger.error(`[${traceId}] 核心动作失败: ${error.message}`);

      return {
        success: false,
        error: {
          code: 'ACTION_FAILED',
          message: error.message,
          details: error.stack,
        },
        meta: {
          traceId,
          actionType: action.type,
          durationMs,
          budgetUsed: {
            durationMs,
            llmTokens: 0,
            toolCalls: 0,
          },
          degraded: false,
        },
      };
    }
  }

  /**
   * 便捷方法：生成方案
   *
   * `tripId`：若与持久化 `Trip` 对齐，应传 Prisma 主键；经 payload 送达 PlanningWorkbench，便于决策引擎 / ECO 账本绑定。
   */
  async generatePlan(params: {
    userId: string;
    sessionId: string;
    destination: string;
    preferences: Record<string, unknown>;
    constraints?: Record<string, unknown>;
    tripId?: string;
  }): Promise<CoreActionResult> {
    return this.execute({
      type: 'generatePlan',
      payload: params,
      context: {
        userId: params.userId,
        sessionId: params.sessionId,
      },
    });
  }

  /**
   * 便捷方法：应用变更意图
   */
  async applyChangeIntent(params: {
    userId: string;
    tripId: string;
    intent: ChangeIntent;
  }): Promise<CoreActionResult> {
    return this.execute({
      type: 'applyChangeIntent',
      payload: params,
      context: {
        userId: params.userId,
        sessionId: params.tripId,
        budget: { priority: params.intent.urgency === 'immediate' ? 'critical' : 'high' },
      },
    });
  }

  /**
   * 便捷方法：获取行程状态
   */
  async getTripStatus(params: {
    userId: string;
    tripId: string;
  }): Promise<CoreActionResult> {
    return this.execute({
      type: 'getTripStatus',
      payload: params,
      context: {
        userId: params.userId,
        sessionId: params.tripId,
      },
    });
  }

  /**
   * 便捷方法：诊断
   */
  async diagnose(params: {
    userId: string;
    tripId: string;
    diagnosticType?: 'health' | 'budget' | 'schedule' | 'full';
  }): Promise<CoreActionResult> {
    return this.execute({
      type: 'diagnose',
      payload: params,
      context: {
        userId: params.userId,
        sessionId: params.tripId,
      },
    });
  }

  /**
   * 获取动作统计
   */
  getStats() {
    const stats: Record<string, any> = {};
    
    for (const [action, data] of Object.entries(this.actionStats)) {
      stats[action] = {
        ...data,
        averageDurationMs: data.count > 0 ? Math.round(data.totalDurationMs / data.count) : 0,
        successRate: data.count > 0 
          ? ((data.count - data.failures) / data.count * 100).toFixed(2) + '%'
          : 'N/A',
      };
    }
    
    return stats;
  }

  // ============== 私有方法 ==============

  private validateAction(action: CoreAction): string | null {
    if (!action.type) {
      return '动作类型不能为空';
    }
    
    if (!action.context.userId) {
      return '用户ID不能为空';
    }
    
    if (!action.context.sessionId) {
      return '会话ID不能为空';
    }

    // 验证动作类型是否合法
    if (!DEFAULT_ACTION_BUDGETS[action.type]) {
      return `未知的动作类型: ${action.type}`;
    }

    return null;
  }

  private resolveBudget(actionType: CoreActionType, partialBudget?: Partial<ActionBudget>): ActionBudget {
    const baseBudget = DEFAULT_ACTION_BUDGETS[actionType];
    return {
      ...baseBudget,
      ...partialBudget,
    };
  }

  private async routeAction<T>(
    action: CoreAction,
    budget: ActionBudget,
    traceId: string,
  ): Promise<T> {
    switch (action.type) {
      // ========== 规划动作 -> PlanningWorkbench ==========
      case 'generatePlan':
      case 'comparePlans':
      case 'evaluatePlan':
      case 'selectPlan':
        return this.routeToPlanningCore<T>(action, budget, traceId);

      // ========== 执行动作 -> ExecutionAgent ==========
      case 'applyChangeIntent':
      case 'rollback':
      case 'checkpoint':
        return this.routeToExecutionCore<T>(action, budget, traceId);

      // ========== 诊断动作 -> TripDetailAgent ==========
      case 'diagnose':
      case 'getTripStatus':
        return this.routeToTripDetail<T>(action, budget, traceId);

      default:
        throw new Error(`不支持的动作类型: ${action.type}`);
    }
  }

  private async routeToPlanningCore<T>(
    action: CoreAction,
    budget: ActionBudget,
    traceId: string,
  ): Promise<T> {
    if (!this.planningWorkbench) {
      this.logger.warn(`[${traceId}] PlanningWorkbench 不可用，返回默认响应`);
      return this.getDefaultPlanningResponse(action) as T;
    }

    // 从 payload 中构建 PlanContext
    const payload = action.payload as Record<string, any>;
    const context = {
      destination: payload.destination || '',
      days: payload.days || 7,
      budget: payload.budget,
      travelers: payload.travelers,
      preferences: payload.preferences,
      constraints: payload.constraints,
    };

    // 调用 PlanningWorkbench
    const response = await this.planningWorkbench.execute({
      context,
      tripId: payload.tripId,
      existingPlanState: payload.existingPlanState,
      userAction: this.mapActionToUserAction(action.type),
    });

    return response as T;
  }

  private mapActionToUserAction(actionType: CoreActionType): 'generate' | 'compare' | 'commit' | 'adjust' | undefined {
    switch (actionType) {
      case 'generatePlan': return 'generate';
      case 'comparePlans': return 'compare';
      case 'selectPlan': return 'commit';
      case 'evaluatePlan': return 'adjust';
      default: return undefined;
    }
  }

  private async routeToExecutionCore<T>(
    action: CoreAction,
    budget: ActionBudget,
    traceId: string,
  ): Promise<T> {
    // 优先使用构造函数注入；若因循环依赖未注入，则运行时通过 ModuleRef 解析
    let executionAgent = this.executionAgent;
    if (!executionAgent) {
      try {
        executionAgent = this.moduleRef.get(ExecutionAgentService, { strict: false });
      } catch {
        executionAgent = undefined;
      }
    }
    if (!executionAgent) {
      this.logger.warn(`[${traceId}] ExecutionAgent 不可用，返回默认响应`);
      return this.getDefaultExecutionResponse(action) as T;
    }

    const payload = action.payload as Record<string, any>;

    // 调用 ExecutionAgent
    const response = await executionAgent.execute({
      tripId: action.context.sessionId,
      action: this.mapActionToExecAction(action.type),
      changeParams: action.type === 'applyChangeIntent' ? {
        changeType: payload.intent?.type || 'unknown',
        changeDetails: payload.intent,
      } : undefined,
    });

    return response as T;
  }

  private mapActionToExecAction(actionType: CoreActionType): 'remind' | 'handle_change' | 'fallback' | 'get_status' {
    switch (actionType) {
      case 'applyChangeIntent': return 'handle_change';
      case 'rollback': return 'fallback';
      case 'checkpoint': return 'get_status';
      default: return 'get_status';
    }
  }

  private async routeToTripDetail<T>(
    action: CoreAction,
    budget: ActionBudget,
    traceId: string,
  ): Promise<T> {
    if (!this.tripDetailAgent) {
      this.logger.warn(`[${traceId}] TripDetailAgent 不可用，返回默认响应`);
      return this.getDefaultDiagnosticResponse(action) as T;
    }

    const payload = action.payload as Record<string, any>;

    // 调用 TripDetailAgent
    const response = await this.tripDetailAgent.execute({
      tripId: payload.tripId || action.context.sessionId,
      action: action.type === 'diagnose' ? 'get_health' : 'get_status',
    });

    return response as T;
  }

  // ========== 默认响应（降级） ==========

  private getDefaultPlanningResponse(_action: CoreAction): unknown {
    return {
      success: false,
      message: '规划服务暂时不可用',
      degraded: true,
    };
  }

  private getDefaultExecutionResponse(_action: CoreAction): unknown {
    return {
      success: false,
      message: '执行服务暂时不可用',
      degraded: true,
    };
  }

  private getDefaultDiagnosticResponse(action: CoreAction): unknown {
    return {
      tripId: action.payload.tripId,
      status: 'unknown',
      message: '诊断服务暂时不可用',
      degraded: true,
    };
  }

  private generateTraceId(): string {
    return `core-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
