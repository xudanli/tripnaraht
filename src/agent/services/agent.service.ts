// src/agent/services/agent.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { AgentState } from '../interfaces/agent-state.interface';
import { RouterOutput, RouteType, RouterReason } from '../interfaces/router.interface';
import { RouterService } from './router.service';
import { AgentStateService } from './agent-state.service';
import { System1ExecutorService } from './system1-executor.service';
import { OrchestratorService } from './orchestrator.service';
import { EventTelemetryService } from './event-telemetry.service';
import { RequestDeduplicationService } from './request-deduplication.service';
import { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import { TokenCalculator } from '../utils/token-calculator.util';

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
        // System 2 慢速路径（ReAct）
        state = await this.orchestrator.execute(state, routeOutput.budget);
        
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
          payload: result,
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

    if (state.result.status === 'FAILED') {
      return '无法完成规划，请检查约束条件或联系客服。';
    }

    if (state.result.status === 'TIMEOUT') {
      return '处理超时，请稍后重试或简化请求。';
    }

    return '正在处理中...';
  }
}

