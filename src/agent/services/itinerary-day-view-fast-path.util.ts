/**
 * 查看指定日行程 — 入口快路径。
 *
 * 必须在 DecisionRuntimeKernel.prepare（Memory Hydrate / Ledger / Governance / DOS）之前命中，
 * 否则「读库短路」仍会先付 ~3s 记忆装载税（见 DOS-AUDIT duration ≫ latency）。
 */

import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { DecisionLogEntry } from '../interfaces/trip-plan.interface';
import {
  attachConversationTurnToRouteAndRunResponse,
} from '../delivery/conversation';
import type { TripConversationContextSnapshotV1 } from '../delivery/conversation/conversation-turn-result.types';
import { resolveRouteAndRunUserMessage } from '../utils/resolve-route-and-run-message.util';
import { detectItineraryDayViewIntent } from '../utils/itinerary-day-view.util';
import { runItineraryDayViewPath } from '../routing/lightweight-path.runner';
import type { LightweightTripLookupHost } from '../routing/lightweight-path.host';
import {
  applyAgentTaskContractInPlace,
  projectAgentTaskContractForTrace,
  readAgentTaskContract,
} from '../harness/compile-agent-task-contract.util';
import {
  buildAgentTurnTrace,
  projectAgentTurnTraceForObservability,
} from '../harness/hardening/agent-turn-trace.util';

export type ItineraryDayViewFastPathHost = {
  logger?: {
    log?: (msg: string) => void;
    warn?: (msg: string) => void;
    debug?: (msg: string) => void;
  };
  claudeOrchestrator?: {
    tripsService?: {
      findOne(tripId: string, userId?: string): Promise<unknown>;
    };
    logger?: LightweightTripLookupHost['logger'];
  };
};

function resolveTripLookupHost(
  agent: ItineraryDayViewFastPathHost | undefined,
): LightweightTripLookupHost | null {
  const trips = agent?.claudeOrchestrator?.tripsService;
  if (!trips?.findOne) return null;
  const fallbackLogger = {
    log: (msg: string) => {
      void msg;
    },
    warn: (msg: string) => {
      void msg;
    },
    debug: (msg: string) => {
      void msg;
    },
  };
  const logger =
    agent?.claudeOrchestrator?.logger ?? agent?.logger ?? fallbackLogger;
  return {
    logger: {
      log: logger.log?.bind(logger) ?? fallbackLogger.log,
      warn: logger.warn?.bind(logger) ?? fallbackLogger.warn,
      debug: logger.debug?.bind(logger) ?? fallbackLogger.debug,
    },
    findTripForLightweight: (tripId, userId) =>
      trips.findOne(tripId, userId) as ReturnType<
        NonNullable<LightweightTripLookupHost['findTripForLightweight']>
      >,
  };
}

function leanTripContext(tripId?: string | null) {
  return {
    schema_id: 'tripnara.trip_conversation_context@v1' as const,
    trip_id: String(tripId ?? ''),
    lifecycle: 'UNKNOWN' as const,
    today_ymd: new Date().toISOString().slice(0, 10),
    unresolved_risks_zh: [] as string[],
    open_decisions_zh: [] as string[],
  };
}

function buildDayViewResponse(params: {
  request: RouteAndRunRequestDto;
  startTime: number;
  answerText: string;
  success: boolean;
  dateIso?: string;
  dayNumber?: number;
  contractTrace?: Record<string, unknown>;
  turnTrace?: Record<string, unknown>;
}): RouteAndRunResponseDto {
  const latencyMs = Date.now() - params.startTime;
  const titleZh =
    params.dayNumber != null ? `第 ${params.dayNumber} 天行程` : '当日安排';
  /**
   * 契约对齐：`orchestration_mode_final` 只能是 LEGACY|CLAUDE_DYNAMIC|CLAUDE_SM|DEDUP。
   * 自定义 FAST_PATH 字符串会导致 iOS 严格 enum decode 失败 →「服务器返回无法解析」。
   */
  const response = {
    request_id: params.request.request_id,
    route: {
      route: 'SYSTEM1_API',
      confidence: 0.95,
      reasons: ['bound_trip_day_view'],
      required_capabilities: ['qa'],
      consent_required: false,
      budget: { max_seconds: 8, max_steps: 0, max_browser_steps: 0 },
      ui_hint: {
        mode: 'fast',
        status: 'done',
        message: titleZh,
      },
    },
    result: {
      status: params.success ? 'OK' : 'NEED_MORE_INFO',
      answer_text: params.answerText,
      payload: {
        trip_id: params.request.trip_id,
        ui_surface: 'consultation',
        conversation_route: 'DATA_LOOKUP',
        itinerary_day_view_intake: true,
        lightweightKnowledgeQa: true,
        day_view: {
          ...(params.dateIso ? { date_iso: params.dateIso } : {}),
          title_zh: titleZh,
          body_zh: params.answerText,
        },
        trusted_delivery_v1: {
          schemaId: 'tripnara.trusted_delivery@v1',
          version: 1,
          delivery_verdict: 'VERIFIED',
          user_confirm: { required: false },
          flawed_disclosure: { present: false },
          task_progress: {
            phase: 'DONE',
            label_zh: titleZh,
            percent: 100,
            message: '已读取行程日安排',
          },
        },
        applied_to_itinerary: false,
      },
    },
    ui_state: {
      phase: 'DONE',
      ui_status: 'done',
    },
    explain: {
      decision_log: [
        {
          request_id: params.request.request_id,
          step: 'INTAKE',
          actor: 'Orchestrator',
          inputs_summary: resolveRouteAndRunUserMessage(params.request).slice(0, 200),
          outputs_summary: `ITINERARY_DAY_VIEW day=${params.dayNumber ?? '?'}`,
          evidence_refs: params.request.trip_id
            ? [`trip:${params.request.trip_id}`]
            : [],
          timestamp: new Date().toISOString(),
          metadata: {
            system_action: 'ITINERARY_DAY_VIEW_READ',
            agent_task_contract: params.contractTrace,
            applied_to_itinerary: false,
          },
        } as DecisionLogEntry,
      ],
    },
    observability: {
      latency_ms: latencyMs,
      router_ms: 0,
      system_mode: 'SYSTEM1',
      tool_calls: 0,
      browser_steps: 0,
      tokens_est: 0,
      cost_est_usd: 0,
      fallback_used: false,
      orchestration_mode_final: 'CLAUDE_DYNAMIC',
      itinerary_day_view_fast_path: true,
      agent_task_contract: params.contractTrace,
      ...(params.turnTrace ? { agent_turn_trace: params.turnTrace } : {}),
    },
  } as unknown as RouteAndRunResponseDto;

  return attachConversationTurnToRouteAndRunResponse(response, {
    context: leanTripContext(params.request.trip_id) as TripConversationContextSnapshotV1,
  });
}

/**
 * @returns 命中「查看第 N 天」则返回完整 route_and_run 响应；否则 null（继续主链）。
 */
export async function tryBuildItineraryDayViewFastPath(
  agent: ItineraryDayViewFastPathHost | undefined,
  request: RouteAndRunRequestDto,
  startTime: number = Date.now(),
): Promise<RouteAndRunResponseDto | null> {
  const tripId = request.trip_id?.trim();
  const message = resolveRouteAndRunUserMessage(request);
  if (!tripId || !detectItineraryDayViewIntent(message)) return null;

  const host = resolveTripLookupHost(agent);
  if (!host?.findTripForLightweight) return null;

  applyAgentTaskContractInPlace(request);
  const contract = readAgentTaskContract(request);
  // 仅只读答问；规划/调整/Live/决策走主链
  if (
    contract &&
    contract.taskType !== 'TRIP_QUERY' &&
    contract.taskType !== 'GENERAL_RESEARCH'
  ) {
    return null;
  }

  agent?.logger?.log?.(
    `[ItineraryDayViewFastPath] bypass DecisionRuntimeKernel prepare request_id=${request.request_id}`,
  );

  const orch = await runItineraryDayViewPath(
    host,
    request,
    {
      requestId: request.request_id,
      userId: request.user_id,
      tripId,
    },
    startTime,
  );

  const dayMatch = /第\s*(\d+)\s*天/.exec(orch.answerText);
  const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(orch.answerText);
  const contractTrace = contract
    ? projectAgentTaskContractForTrace(contract)
    : undefined;
  const turnTrace = contract
    ? projectAgentTurnTraceForObservability(
        buildAgentTurnTrace({
          contract,
          runtimeSelected: 'TRIP_QUERY',
          resultStatus: orch.success ? 'OK' : 'NEED_MORE_INFO',
          answerPreviewZh: orch.answerText,
          appliedToItinerary: false,
          evidence: [],
        }),
      )
    : undefined;

  return buildDayViewResponse({
    request,
    startTime,
    answerText: orch.answerText,
    success: orch.success,
    dateIso: dateMatch?.[1],
    dayNumber: dayMatch ? Number(dayMatch[1]) : undefined,
    contractTrace,
    turnTrace,
  });
}
