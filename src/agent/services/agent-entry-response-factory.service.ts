import { Injectable, Optional } from '@nestjs/common';
import { RouteType, RouterReason, UIStatus } from '../interfaces/router.interface';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { DecisionLogEntry, OrchestrationStep, SubAgentType } from '../interfaces/trip-plan.interface';
import type { RuntimeBranchDirective } from '../../governance/activation/runtime/runtime-branch-directive.types';
import type { StructuredGovernanceRuntimeTraceV1 } from '../../governance/activation/runtime/build-structured-governance-runtime-trace.util';
import { RouteAndRunResponseAssemblerService } from './route-and-run-response-assembler.service';
import { JepaProjectorService } from './jepa-projector.service';
import { TradeoffEngineService } from './tradeoff-engine.service';
import { TravelTimeRouterService } from './travel-time-router.service';
import { NegotiationSessionStoreService } from './negotiation-session-store.service';

@Injectable()
export class AgentEntryResponseFactoryService {
  constructor(
    @Optional() private readonly responseAssembler?: RouteAndRunResponseAssemblerService,
    @Optional() private readonly negotiationSessions?: NegotiationSessionStoreService,
  ) {}

  private getAssembler(): RouteAndRunResponseAssemblerService {
    return (
      this.responseAssembler ??
      new RouteAndRunResponseAssemblerService(
        new JepaProjectorService(),
        new TradeoffEngineService(undefined, new TravelTimeRouterService(), undefined, undefined, undefined, undefined),
        undefined,
        this.negotiationSessions,
      )
    );
  }

  createMissingTripIdErrorResponse(
    request: RouteAndRunRequestDto,
    startTime: number,
  ): RouteAndRunResponseDto {
    const latency = Date.now() - startTime;

    const decisionLog: DecisionLogEntry[] = [
      {
        request_id: request.request_id,
        step: 'INTAKE' as OrchestrationStep,
        actor: 'Router' as SubAgentType,
        inputs_summary: `缺少 trip_id: ${request.message}`,
        outputs_summary: '返回错误提示',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          error_code: 'MISSING_TRIP_ID',
        },
      },
    ];

    return {
      request_id: request.request_id,
      route: {
        route: RouteType.SYSTEM2_REASONING,
        confidence: 1.0,
        reasons: [RouterReason.MISSING_INFO],
        required_capabilities: [],
        consent_required: false,
        budget: {
          max_seconds: 60,
          max_steps: 8,
          max_browser_steps: 0,
        },
        ui_hint: {
          mode: 'slow',
          status: UIStatus.AWAITING_CONFIRMATION,
          message: '需要选择行程',
        },
      },
      result: {
        status: 'FAILED',
        answer_text: '智能体统一入口只为具体行程服务，请提供 trip_id。如果您想规划新行程，请使用规划工作台。',
        payload: {
          timeline: [],
          dropped_items: [],
          candidates: [],
          evidence: [],
          robustness: null,
          redirectInfo: {
            redirect_to: '/planning-workbench/execute',
            redirect_reason: 'MISSING_TRIP_ID',
            original_request: {
              message: request.message.substring(0, 200),
              user_id: request.user_id,
              trip_id: request.trip_id || undefined,
            },
          },
        },
      },
      explain: {
        decision_log: decisionLog,
        simplified_explanation: this.getAssembler().buildSimplifiedExplanation(decisionLog, undefined),
      },
      observability: {
        latency_ms: latency,
        router_ms: latency,
        system_mode: 'SYSTEM1',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
        is_replayed: false,
        trace: {
          orchestration: {
            resolved: {
              mode: 'LEGACY',
              reason: 'Missing trip_id, returning error',
              matchedRules: ['TRIP_ID_REQUIRED'],
            },
          },
          timestamp: new Date().toISOString(),
        },
      },
    };
  }

  createReadonlyModeRestrictionResponse(
    request: RouteAndRunRequestDto,
    startTime: number,
  ): RouteAndRunResponseDto {
    const latency = Date.now() - startTime;

    const decisionLog: DecisionLogEntry[] = [
      {
        request_id: request.request_id,
        step: 'INTAKE' as OrchestrationStep,
        actor: 'Router' as SubAgentType,
        inputs_summary: `只读模式限制: ${request.message}`,
        outputs_summary: '重定向到规划工作台',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          entry_point: request.options?.entry_point,
          readonly_mode: true,
          redirect_reason: 'READONLY_MODE_RESTRICTION',
        },
      },
    ];

    return {
      request_id: request.request_id,
      route: {
        route: RouteType.SYSTEM2_REASONING,
        confidence: 1.0,
        reasons: [RouterReason.HIGH_RISK_ACTION],
        required_capabilities: [],
        consent_required: false,
        budget: {
          max_seconds: 60,
          max_steps: 8,
          max_browser_steps: 0,
        },
        ui_hint: {
          mode: 'slow',
          status: UIStatus.REDIRECT_REQUIRED,
          message: '行程详情页只支持查询操作',
        },
      },
      result: {
        status: 'REDIRECT_REQUIRED',
        answer_text: '行程详情页只支持查询操作，如需修改请前往规划工作台。',
        payload: {
          timeline: [],
          dropped_items: [],
          candidates: [],
          evidence: [],
          robustness: null,
          redirectInfo: {
            redirect_to: '/planning-workbench/execute',
            redirect_reason: 'READONLY_MODE_RESTRICTION',
            original_request: {
              message: request.message.substring(0, 200),
              user_id: request.user_id,
              trip_id: request.trip_id || undefined,
            },
          },
        },
      },
      explain: {
        decision_log: decisionLog,
        simplified_explanation: this.getAssembler().buildSimplifiedExplanation(decisionLog, undefined),
      },
      observability: {
        latency_ms: latency,
        router_ms: latency,
        system_mode: 'REDIRECT',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
        is_replayed: false,
        trace: {
          orchestration: {
            resolved: {
              mode: 'LEGACY',
              reason: 'Readonly mode restriction, redirecting to planning workbench',
              matchedRules: ['READONLY_MODE_CHECK'],
            },
          },
          timestamp: new Date().toISOString(),
        },
      },
    };
  }

  createRedirectToPlanningWorkbenchResponse(
    request: RouteAndRunRequestDto,
    startTime: number,
  ): RouteAndRunResponseDto {
    const latency = Date.now() - startTime;

    const decisionLog: DecisionLogEntry[] = [
      {
        request_id: request.request_id,
        step: 'INTAKE' as OrchestrationStep,
        actor: 'Router' as SubAgentType,
        inputs_summary: `检测到规划请求: ${request.message}`,
        outputs_summary: '重定向到规划工作台',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          redirect_reason: 'PLANNING_REQUEST_DETECTED',
        },
      },
    ];

    return {
      request_id: request.request_id,
      route: {
        route: RouteType.SYSTEM2_REASONING,
        confidence: 1.0,
        reasons: [RouterReason.REDIRECT_TO_PLANNING_WORKBENCH],
        required_capabilities: ['planning'],
        consent_required: false,
        budget: {
          max_seconds: 60,
          max_steps: 8,
          max_browser_steps: 0,
        },
        ui_hint: {
          mode: 'slow',
          status: UIStatus.REDIRECT_REQUIRED,
          message: '需要前往规划工作台',
        },
      },
      result: {
        status: 'REDIRECT_REQUIRED',
        answer_text: '行程规划功能已迁移到规划工作台，请使用 POST /planning-workbench/execute 接口。',
        payload: {
          timeline: [],
          dropped_items: [],
          candidates: [],
          evidence: [],
          robustness: null,
          redirectInfo: {
            redirect_to: '/planning-workbench/execute',
            redirect_reason: 'PLANNING_REQUEST_DETECTED',
            original_request: {
              message: request.message.substring(0, 200),
              user_id: request.user_id,
              trip_id: request.trip_id || undefined,
            },
          },
        },
      },
      explain: {
        decision_log: decisionLog,
        simplified_explanation: this.getAssembler().buildSimplifiedExplanation(decisionLog, undefined),
      },
      observability: {
        latency_ms: latency,
        router_ms: latency,
        system_mode: 'REDIRECT',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
        is_replayed: false,
        trace: {
          orchestration: {
            resolved: {
              mode: 'LEGACY',
              reason: 'Planning request detected, redirecting to planning workbench',
              matchedRules: ['PLANNING_REQUEST_INTERCEPT'],
            },
          },
          timestamp: new Date().toISOString(),
        },
      },
    };
  }

  /** orchestration_replay_anchor_snapshot_id 已设置但 Redis 快照层不可用 */
  createReplayMemoryPersistenceUnavailableResponse(
    request: RouteAndRunRequestDto,
    startTime: number,
  ): RouteAndRunResponseDto {
    const latency = Date.now() - startTime;
    return {
      request_id: request.request_id,
      route: {
        route: RouteType.SYSTEM2_REASONING,
        confidence: 1.0,
        reasons: [RouterReason.MISSING_INFO],
        required_capabilities: [],
        consent_required: false,
        budget: { max_seconds: 30, max_steps: 1, max_browser_steps: 0 },
        ui_hint: { mode: 'slow', status: UIStatus.AWAITING_CONFIRMATION, message: '回放不可用' },
      },
      result: {
        status: 'FAILED',
        answer_text:
          'replay 需要记忆快照持久化（Redis）；当前宿主未配置 MemorySnapshotPersistence，无法装载 orchestration_replay_anchor_snapshot_id。',
        payload: {
          timeline: [],
          dropped_items: [],
          candidates: [],
          evidence: [],
          robustness: null,
          error_code: 'REPLAY_MEMORY_PERSISTENCE_UNAVAILABLE',
        } as any,
      },
      explain: { decision_log: [] } as any,
      observability: {
        latency_ms: latency,
        router_ms: 0,
        system_mode: 'SYSTEM2',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
        is_replayed: false,
      } as any,
    };
  }

  /** 指定 snapshot_id 在 Redis 中不存在或 body 与存储不一致 */
  createReplayMemorySnapshotNotFoundResponse(
    request: RouteAndRunRequestDto,
    startTime: number,
    snapshotId: string,
  ): RouteAndRunResponseDto {
    const latency = Date.now() - startTime;
    return {
      request_id: request.request_id,
      route: {
        route: RouteType.SYSTEM2_REASONING,
        confidence: 1.0,
        reasons: [RouterReason.MISSING_INFO],
        required_capabilities: [],
        consent_required: false,
        budget: { max_seconds: 30, max_steps: 1, max_browser_steps: 0 },
        ui_hint: { mode: 'slow', status: UIStatus.AWAITING_CONFIRMATION, message: '快照未找到' },
      },
      result: {
        status: 'FAILED',
        answer_text: `未找到与 orchestration_replay_anchor_snapshot_id 对齐的冻结记忆快照：${snapshotId}`,
        payload: {
          timeline: [],
          dropped_items: [],
          candidates: [],
          evidence: [],
          robustness: null,
          error_code: 'REPLAY_MEMORY_SNAPSHOT_NOT_FOUND',
        } as any,
      },
      explain: { decision_log: [] } as any,
      observability: {
        latency_ms: latency,
        router_ms: 0,
        system_mode: 'SYSTEM2',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
        is_replayed: false,
      } as any,
    };
  }

  /** Governance Activation: require_confirmation → runtime short-circuit (orchestration boundary). */
  createGovernanceRuntimeNeedsConfirmationResponse(
    request: RouteAndRunRequestDto,
    startTime: number,
    directive: RuntimeBranchDirective,
    trace?: StructuredGovernanceRuntimeTraceV1,
  ): RouteAndRunResponseDto {
    const latency = Date.now() - startTime;
    const decisionLog: DecisionLogEntry[] = [
      {
        request_id: request.request_id,
        step: 'INTAKE' as OrchestrationStep,
        actor: 'Orchestrator' as SubAgentType,
        inputs_summary: `governance branch=${directive.branchType}`,
        outputs_summary: 'NEED_USER_CONFIRM: governance require_confirmation activation',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          governance_runtime: true,
          source_activation_ids: directive.sourceActivationIds,
        },
      },
    ];
    return {
      request_id: request.request_id,
      route: {
        route: RouteType.SYSTEM2_REASONING,
        confidence: 1.0,
        reasons: [RouterReason.HIGH_RISK_ACTION],
        required_capabilities: [],
        consent_required: true,
        budget: { max_seconds: 30, max_steps: 2, max_browser_steps: 0 },
        ui_hint: { mode: 'slow', status: UIStatus.AWAITING_CONFIRMATION, message: '需要您确认治理侧约束' },
      },
      result: {
        status: 'NEED_CONFIRMATION',
        answer_text:
          '治理运行时发现需人工确认的高基数或敏感策略组合；请确认是否继续本轮自动编排，或收紧约束后再试。',
        payload: {
          timeline: [],
          dropped_items: [],
          candidates: [],
          evidence: [],
          robustness: null,
          governance_runtime_branch: directive,
        } as any,
      },
      explain: {
        decision_log: decisionLog,
        simplified_explanation: this.getAssembler().buildSimplifiedExplanation(decisionLog, undefined),
      },
      observability: {
        latency_ms: latency,
        router_ms: latency,
        system_mode: 'SYSTEM2',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
        is_replayed: false,
        governance_runtime_trace_v1: trace,
        trace: {
          orchestration: {
            resolved: {
              mode: 'GOVERNANCE_RUNTIME',
              reason: 'require_confirmation',
              matchedRules: ['GOVERNANCE_ACTIVATION_ROUTER'],
            },
          },
          timestamp: new Date().toISOString(),
        },
      } as any,
    };
  }

  /** Governance Activation: suppress_execution → deny execution stage at orchestration boundary. */
  createGovernanceRuntimeSuppressedExecutionResponse(
    request: RouteAndRunRequestDto,
    startTime: number,
    directive: RuntimeBranchDirective,
    trace?: StructuredGovernanceRuntimeTraceV1,
  ): RouteAndRunResponseDto {
    const latency = Date.now() - startTime;
    const decisionLog: DecisionLogEntry[] = [
      {
        request_id: request.request_id,
        step: 'INTAKE' as OrchestrationStep,
        actor: 'Orchestrator' as SubAgentType,
        inputs_summary: `governance branch=${directive.branchType}`,
        outputs_summary: 'EXECUTION_SUPPRESSED: governance suppress_execution activation',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          governance_runtime: true,
          source_activation_ids: directive.sourceActivationIds,
        },
      },
    ];
    return {
      request_id: request.request_id,
      route: {
        route: RouteType.SYSTEM2_REASONING,
        confidence: 1.0,
        reasons: [RouterReason.HIGH_RISK_ACTION],
        required_capabilities: [],
        consent_required: false,
        budget: { max_seconds: 30, max_steps: 1, max_browser_steps: 0 },
        ui_hint: { mode: 'slow', status: UIStatus.FAILED, message: '执行已被治理层抑制' },
      },
      result: {
        status: 'FAILED',
        answer_text:
          '治理运行时在近期账本中检测到 halt 级执行姿态；已在本轮阻止自动编排扩线，请先解除阻塞或走受控重规划。',
        payload: {
          timeline: [],
          dropped_items: [],
          candidates: [],
          evidence: [],
          robustness: null,
          error_code: 'GOVERNANCE_EXECUTION_SUPPRESSED',
          governance_runtime_branch: directive,
        } as any,
      },
      explain: {
        decision_log: decisionLog,
        simplified_explanation: this.getAssembler().buildSimplifiedExplanation(decisionLog, undefined),
      },
      observability: {
        latency_ms: latency,
        router_ms: latency,
        system_mode: 'SYSTEM2',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
        is_replayed: false,
        governance_runtime_trace_v1: trace,
        trace: {
          orchestration: {
            resolved: {
              mode: 'GOVERNANCE_RUNTIME',
              reason: 'suppress_execution',
              matchedRules: ['GOVERNANCE_ACTIVATION_ROUTER'],
            },
          },
          timestamp: new Date().toISOString(),
        },
      } as any,
    };
  }
}

