// src/agent/services/agent.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { AgentState } from '../interfaces/agent-state.interface';
import { RouterOutput, RouteType, RouterReason, UIStatus } from '../interfaces/router.interface';
import { RouterService } from './router.service';
import { AgentStateService } from './agent-state.service';
import { System1ExecutorService } from './system1-executor.service';
import { OrchestratorService } from './orchestrator.service';
import { DAGOrchestratorService } from '../plan-execute/orchestrator.service';
import { ClaudeOrchestratorService } from './claude-orchestrator.service';
import { EventTelemetryService } from './event-telemetry.service';
import { RequestDeduplicationService } from './request-deduplication.service';
import { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import { TokenCalculator } from '../utils/token-calculator.util';
import { AgentContext } from '../interfaces/claude-orchestration.interface';

/**
 * Agent Service
 * 
 * 统一入口服务：协调 Router、System1、System2
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private router: RouterService,
    private stateService: AgentStateService,
    private system1Executor: System1ExecutorService,
    private orchestrator: OrchestratorService,
    @Optional() private dagOrchestrator?: DAGOrchestratorService,
    @Optional() private claudeOrchestrator?: ClaudeOrchestratorService,
    private eventTelemetry?: EventTelemetryService,
    private requestDeduplication?: RequestDeduplicationService,
  ) {}

  /**
   * 路由并执行
   */
  async routeAndRun(request: RouteAndRunRequestDto): Promise<RouteAndRunResponseDto> {
    const startTime = Date.now();
    this.logger.debug(`Processing request: ${request.request_id}`);

    try {
      // 0. Feature Flag: 使用 Claude 编排（如果启用）
      const envFlag = process.env.USE_CLAUDE_ORCHESTRATION === 'true' || 
                      process.env.USE_CLAUDE_ORCHESTRATION === '"true"';
      const requestFlag = request.options?.use_claude_orchestration === true;
      const useClaudeOrchestration = envFlag || requestFlag;
      
      this.logger.debug(`[AgentService] Claude 编排检查: envFlag=${envFlag}, requestFlag=${requestFlag}, useClaudeOrchestration=${useClaudeOrchestration}, claudeOrchestrator=${!!this.claudeOrchestrator}`);
      
      if (useClaudeOrchestration && this.claudeOrchestrator) {
        this.logger.log(`[AgentService] ✅ 使用 Claude 编排模式: request_id=${request.request_id}`);
        return await this.routeAndRunWithClaude(request, startTime);
      } else if (useClaudeOrchestration && !this.claudeOrchestrator) {
        this.logger.warn(`[AgentService] ⚠️ Claude 编排已启用，但 ClaudeOrchestratorService 未注入`);
      }

      // 0. 检查请求去重（如果是短时间内相同的请求，复用之前的结果）
      if (this.requestDeduplication && !request.options?.dry_run) {
        const requestHash = this.requestDeduplication.generateRequestHash(request);
        const cachedResponse = this.requestDeduplication.checkDuplicate(requestHash);
        
        if (cachedResponse) {
          // 更新 request_id 为当前请求的 ID
          const dedupedResponse: RouteAndRunResponseDto = {
            ...cachedResponse,
            request_id: request.request_id,
            observability: {
              ...cachedResponse.observability,
              latency_ms: Date.now() - startTime, // 更新为实际的去重查找时间
            },
          };
          
          this.logger.debug(`Request deduplication: reusing cached result for request ${request.request_id}`);
          return dedupedResponse;
        }
      }
      // 1. 创建初始状态
      const initialState = this.stateService.createInitialState(
        request.message,
        request.user_id,
        request.trip_id,
        request.options
      );

      // 2. 路由决策
      const routerStartTime = Date.now();
      const routeOutput = await this.router.route(
        request.message,
        {
          tripId: request.trip_id,
          recentMessages: request.conversation_context?.recent_messages,
          userId: request.user_id,
        },
        initialState.request_id
      );
      const routerMs = Date.now() - routerStartTime;

      // 更新状态中的 router_ms
      let state = this.stateService.update(initialState.request_id, {
        observability: {
          ...initialState.observability,
          router_ms: routerMs,
        },
      });

      // 3. 检查 webbrowse 授权
      if (routeOutput.route === RouteType.SYSTEM2_WEBBROWSE && !request.options?.allow_webbrowse) {
        // 记录 webbrowse_blocked 事件
        if (this.eventTelemetry) {
          this.eventTelemetry.recordWebbrowseBlocked(
            initialState.request_id,
            'User consent not provided',
            { route: routeOutput.route, consent_required: routeOutput.consent_required }
          );
        }
        
        // 降级到 System2_REASONING
        routeOutput.route = RouteType.SYSTEM2_REASONING;
        routeOutput.confidence = 0.7;
        routeOutput.reasons = [RouterReason.NO_API];
        routeOutput.consent_required = false;
        
        if (this.eventTelemetry) {
          this.eventTelemetry.recordFallbackTriggered(
            initialState.request_id,
            RouteType.SYSTEM2_WEBBROWSE,
            RouteType.SYSTEM2_REASONING,
            'Webbrowse blocked due to missing consent',
            { original_route: RouteType.SYSTEM2_WEBBROWSE }
          );
        }
      }

      // 4. 根据路由执行
      let result: any;
      let answerText = '';

      if (routeOutput.route.startsWith('SYSTEM1')) {
        // System 1 快速路径
        const system1Result = await this.system1Executor.execute(routeOutput.route, state);
        result = system1Result.result;
        answerText = system1Result.answerText;
        
        state = this.stateService.update(state.request_id, {
          result: {
            ...state.result,
            status: system1Result.success ? 'READY' : 'NEED_MORE_INFO',
          },
        });
      } else {
        // System 2 慢速路径（Plan-and-Execute Agent）
        // 使用新的 DAG Orchestrator 替代 ReAct 循环
        if (this.dagOrchestrator) {
          // 使用 Plan-and-Execute Agent (并行编排器)
          state = await this.executeSystem2PlanAndExecute(state, routeOutput.budget, request);
        } else {
          // 降级：使用原有的 ReAct 循环
          this.logger.warn('DAGOrchestratorService 未可用，降级使用 ReAct 循环');
          state = await this.orchestrator.execute(state, routeOutput.budget);
        }
        
        // 从状态中提取结果
        result = {
          timeline: state.result.timeline,
          dropped_items: state.result.dropped_items,
          candidates: [],
          evidence: [],
          robustness: state.compute.robustness,
        };
        
        answerText = this.generateAnswerText(state);
      }

      // 4. 计算 token 数量
      const tokensEst = TokenCalculator.estimateTotalTokens(
        request.message,
        answerText,
        {
          route: routeOutput,
          result: result,
          state: {
            trip: state.trip,
            memory: state.memory,
            compute: state.compute,
            result: state.result,
          },
        }
      );

      // 5. 构建响应
      const latency = Date.now() - startTime;
      const response: RouteAndRunResponseDto = {
        request_id: request.request_id,
        route: routeOutput,
        result: {
          status: this.mapStateStatusToResultStatus(state.result.status),
          answer_text: answerText,
          payload: {
            ...result,
            // 🕵️ HITL: 如果状态是 SUSPENDED，在 payload 中包含 suspensionInfo
            ...(state.result.status === 'SUSPENDED' && state.result.suspensionInfo
              ? { suspensionInfo: state.result.suspensionInfo }
              : {}),
          },
        },
        explain: {
          decision_log: state.react.decision_log,
        },
        observability: {
          latency_ms: latency,
          router_ms: routerMs,
          system_mode: routeOutput.route.startsWith('SYSTEM1') ? 'SYSTEM1' : 'SYSTEM2',
          tool_calls: state.observability.tool_calls,
          browser_steps: state.observability.browser_steps,
          tokens_est: tokensEst,
          cost_est_usd: state.observability.cost_est_usd,
          fallback_used: state.observability.fallback_used,
        },
      };

      this.logger.debug(`Request completed: ${request.request_id}, latency: ${latency}ms`);

      // 缓存响应（用于请求去重）
      if (this.requestDeduplication && !request.options?.dry_run) {
        const requestHash = this.requestDeduplication.generateRequestHash(request);
        this.requestDeduplication.cacheResponse(requestHash, response);
      }

      // 记录 agent_complete 事件
      if (this.eventTelemetry) {
        this.eventTelemetry.recordAgentComplete(
          request.request_id,
          response.result.status,
          latency,
          tokensEst,
          state.observability.cost_est_usd,
          {
            route: routeOutput.route,
            system_mode: response.observability.system_mode,
            tool_calls: response.observability.tool_calls,
            browser_steps: response.observability.browser_steps,
          }
        );
      }

      return response;
    } catch (error: any) {
      this.logger.error(`Agent service error: ${error?.message || String(error)}`, error?.stack);
      throw error;
    }
  }

  /**
   * 映射状态状态到结果状态
   */
  private mapStateStatusToResultStatus(
    stateStatus: AgentState['result']['status']
  ): 'OK' | 'NEED_MORE_INFO' | 'NEED_CONSENT' | 'NEED_CONFIRMATION' | 'FAILED' | 'TIMEOUT' {
    const mapping: Record<AgentState['result']['status'], 'OK' | 'NEED_MORE_INFO' | 'NEED_CONSENT' | 'NEED_CONFIRMATION' | 'FAILED' | 'TIMEOUT'> = {
      READY: 'OK',
      DRAFT: 'NEED_MORE_INFO',
      NEED_MORE_INFO: 'NEED_MORE_INFO',
      NEED_CONSENT: 'NEED_CONSENT',
      SUSPENDED: 'NEED_CONFIRMATION', // 🕵️ HITL: SUSPENDED 映射到 NEED_CONFIRMATION
      FAILED: 'FAILED',
      TIMEOUT: 'TIMEOUT',
    };
    return mapping[stateStatus] || 'FAILED';
  }

  /**
   * 生成答案文本
   */
  private generateAnswerText(state: AgentState): string {
    if (state.result.status === 'READY') {
      if (state.result.timeline && state.result.timeline.length > 0) {
        return `已为您规划好行程，包含 ${state.result.timeline.length} 个节点。`;
      }
      return '处理完成。';
    }

    if (state.result.status === 'NEED_MORE_INFO') {
      return '需要更多信息才能完成规划，请提供日期、人数、城市或预算等信息。';
    }

    // 🕵️ HITL: 处理 SUSPENDED 状态
    if (state.result.status === 'SUSPENDED') {
      const suspensionInfo = state.result.suspensionInfo;
      if (suspensionInfo) {
        return `操作需要您的确认：${suspensionInfo.summary}。请查看审批请求（ID: ${suspensionInfo.approvalId}）。`;
      }
      return '操作需要您的确认，请查看审批请求。';
    }

    if (state.result.status === 'FAILED') {
      return '无法完成规划，请检查约束条件或联系客服。';
    }

    if (state.result.status === 'TIMEOUT') {
      return '处理超时，请稍后重试或简化请求。';
    }

    return '正在处理中...';
  }

  /**
   * 执行 System 2 Plan-and-Execute Agent
   * 
   * 使用 DAG Orchestrator 替代 ReAct 循环
   */
  private async executeSystem2PlanAndExecute(
    state: AgentState,
    budget: {
      max_seconds: number;
      max_steps: number;
      max_browser_steps: number;
    },
    request: RouteAndRunRequestDto,
  ): Promise<AgentState> {
    if (!this.dagOrchestrator) {
      throw new Error('DAGOrchestratorService 未可用');
    }

    this.logger.log(`[Agent] 使用 Plan-and-Execute Agent 执行 System2 任务`);

    try {
      // 1. 调用 DAG Orchestrator（传递 tripId 等上下文信息）
      const dagResult = await this.dagOrchestrator.run(
        state.request_id,
        request.message,
        {
          tripId: request.trip_id,
          userId: request.user_id,
          requestId: request.request_id,
        },
      );

      // 2. 将 DAG 结果转换回 AgentState
      const updatedState = this.convertDAGResultToAgentState(state, dagResult);

      // 3. 更新状态
      return this.stateService.update(state.request_id, updatedState);
    } catch (error: any) {
      this.logger.error(`Plan-and-Execute Agent 执行失败: ${error.message}`, error.stack);
      
      // 降级：标记为失败
      return this.stateService.update(state.request_id, {
        result: {
          ...state.result,
          status: 'FAILED',
          explanations: [
            ...(state.result.explanations || []),
            `Plan-and-Execute Agent 执行失败: ${error.message}`,
          ],
        },
      });
    }
  }

  /**
   * 将 DAG 编排结果转换回 AgentState
   */
  private convertDAGResultToAgentState(
    originalState: AgentState,
    dagResult: any,
  ): Partial<AgentState> {
    // 根据 DAG 结果更新 AgentState
    const explanations: string[] = [
      ...(originalState.result.explanations || []),
      dagResult.summary || 'Plan-and-Execute Agent 执行完成',
    ];

    // 从 memory 中提取关键信息
    const memoryKeys = Object.keys(dagResult.memory || {});
    const completedTasks = dagResult.plan?.filter((t: any) => t.status === 'completed') || [];

    // 构建解释
    if (completedTasks.length > 0) {
      explanations.push(`成功执行 ${completedTasks.length} 个任务`);
    }

    // 确定最终状态
    let finalStatus: AgentState['result']['status'] = 'READY';
    if (dagResult.status === 'failed') {
      finalStatus = 'FAILED';
    } else if (dagResult.status === 'timeout' || dagResult.status === 'deadlock') {
      finalStatus = 'TIMEOUT';
    } else if (dagResult.status === 'done') {
      finalStatus = 'READY';
    }

    // 检查是否有审批挂起
    const suspendedTask = dagResult.plan?.find((t: any) => 
      t.result && t.result.includes('SUSPENDED')
    );
    if (suspendedTask) {
      finalStatus = 'SUSPENDED';
    }

    // 扩展 memory（使用类型断言，因为 memory 类型是严格的）
    const updatedMemory = { ...originalState.memory };
    (updatedMemory as any).dagResult = {
      taskCount: dagResult.plan?.length || 0,
      completedCount: completedTasks.length,
      memoryKeys,
      status: dagResult.status,
    };

    return {
      result: {
        ...originalState.result,
        status: finalStatus,
        explanations,
      },
      memory: updatedMemory as typeof originalState.memory,
      observability: {
        ...originalState.observability,
        tool_calls: (originalState.observability.tool_calls || 0) + (dagResult.plan?.length || 0),
      },
    };
  }

  /**
   * 使用 Claude 编排的路由和执行
   */
  private async routeAndRunWithClaude(
    request: RouteAndRunRequestDto,
    startTime: number,
  ): Promise<RouteAndRunResponseDto> {
    if (!this.claudeOrchestrator) {
      throw new Error('ClaudeOrchestratorService 未可用');
    }

    try {
      // 构建 Agent 上下文
      const context: AgentContext = {
        requestId: request.request_id,
        userId: request.user_id,
        tripId: request.trip_id,
        conversationHistory: request.conversation_context?.recent_messages,
        userPreferences: {},
      };

      // 使用 Claude 编排
      const orchestrationResult = await this.claudeOrchestrator.orchestrate(request, context);

      // 检查是否是 System 1 路径
      const route = orchestrationResult.result?.routingDecision?.route || RouteType.SYSTEM2_REASONING;
      const isSystem1 = route.startsWith('SYSTEM1');

      // 如果是 System 1 路径，需要调用 System1Executor 执行
      if (isSystem1 && orchestrationResult.success) {
        this.logger.debug(`[AgentService] Claude 编排返回 System 1 路径: ${route}`);
        
        // 创建临时状态用于 System 1 执行
        const tempState = this.stateService.createInitialState(
          request.message,
          request.user_id,
          request.trip_id,
          request.options
        );

        // 调用 System1Executor 执行
        const system1Result = await this.system1Executor.execute(route as RouteType, tempState);
        
        // 构建响应（结合 Claude 编排的决策日志）
        const latency = Date.now() - startTime;
        return {
          request_id: request.request_id,
          route: {
            route: route as RouteType,
            confidence: orchestrationResult.result?.routingDecision?.confidence || 0.8,
            reasons: [RouterReason.LLM_DECISION],
            required_capabilities: orchestrationResult.result?.routingDecision?.requiredCapabilities || [],
            consent_required: false,
            budget: orchestrationResult.result?.routingDecision?.budget || {
              max_seconds: 3,
              max_steps: 1,
              max_browser_steps: 0,
            },
            ui_hint: {
              mode: 'fast',
              status: system1Result.success ? UIStatus.DONE : UIStatus.FAILED,
              message: system1Result.success ? '处理完成' : '处理失败',
            },
          },
          result: {
            status: system1Result.success ? 'OK' : 'FAILED',
            answer_text: system1Result.answerText,
            payload: {
              timeline: system1Result.result?.timeline || [],
              dropped_items: system1Result.result?.dropped_items || [],
              candidates: system1Result.result?.candidates || [],
              evidence: system1Result.result?.evidence || [],
              robustness: system1Result.result?.robustness || null,
            },
          },
          explain: {
            decision_log: orchestrationResult.decisionLog || [],
          },
          observability: {
            latency_ms: latency,
            router_ms: 0, // Claude 编排包含路由决策
            system_mode: 'SYSTEM1',
            tool_calls: 1,
            browser_steps: 0,
            tokens_est: 0,
            cost_est_usd: 0,
            fallback_used: false,
          },
        };
      }

      // System 2 路径：使用编排结果
      const latency = Date.now() - startTime;
      const response: RouteAndRunResponseDto = {
        request_id: request.request_id,
        route: {
          route: route as RouteType,
          confidence: orchestrationResult.result?.routingDecision?.confidence || 0.8,
          reasons: [RouterReason.LLM_DECISION],
          required_capabilities: orchestrationResult.result?.routingDecision?.requiredCapabilities || [],
          consent_required: orchestrationResult.result?.routingDecision?.consentRequired || false,
          budget: orchestrationResult.result?.routingDecision?.budget || {
            max_seconds: 60,
            max_steps: 8,
            max_browser_steps: 0,
          },
          ui_hint: {
            mode: isSystem1 ? 'fast' : 'slow',
            status: orchestrationResult.success ? UIStatus.DONE : UIStatus.FAILED,
            message: orchestrationResult.success ? '处理完成' : '处理失败',
          },
        },
        result: {
          status: orchestrationResult.success ? 'OK' : 'FAILED',
          answer_text: orchestrationResult.answerText,
          payload: {
            timeline: [],
            dropped_items: [],
            candidates: [],
            evidence: [],
            robustness: null,
            // 扩展 payload 以包含编排结果（使用类型断言）
            ...(orchestrationResult.result ? { orchestrationResult: orchestrationResult.result } : {}),
          } as any,
        },
        explain: {
          decision_log: orchestrationResult.decisionLog || [],
        },
        observability: {
          latency_ms: latency,
          router_ms: 0, // Claude 编排包含路由决策
          system_mode: isSystem1 ? 'SYSTEM1' : 'SYSTEM2',
          tool_calls: orchestrationResult.stepsExecuted.length,
          browser_steps: 0,
          tokens_est: TokenCalculator.estimateTotalTokens(
            request.message,
            orchestrationResult.answerText,
            {
              orchestrationResult: orchestrationResult.result,
              stepsExecuted: orchestrationResult.stepsExecuted,
              decisionLog: orchestrationResult.decisionLog,
            }
          ),
          cost_est_usd: orchestrationResult.totalCost || 0,
          fallback_used: false,
        },
      };

      return response;
    } catch (error: any) {
      this.logger.error(`[AgentService] Claude 编排失败: ${error?.message || String(error)}`, error?.stack);
      
      // 降级到原有逻辑
      this.logger.warn('[AgentService] Claude 编排失败，降级使用原有路由逻辑');
      // 移除 Feature Flag，重新执行原有逻辑
      const fallbackRequest = {
        ...request,
        options: {
          ...request.options,
          use_claude_orchestration: false,
        },
      };
      return this.routeAndRun(fallbackRequest);
    }
  }
}

