/**
 * `options.async_mode` 预分类与异步委托（A3 / E4）。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { RouteAndRunTaskInitResponseDto } from '../dto/route-and-run-task.dto';
import type { RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { RoutingSignals } from '../utils/orchestration-signals.util';
import { signalsFromRequest } from '../utils/orchestration-signals.util';
import { asOrchestrationStep } from './route-and-run-orchestration-progress.util';
import { RouteType, RouterReason, UIStatus } from '../interfaces/router.interface';

export type RouteAndRunAsyncMode = 'OFF' | 'AUTO' | 'FORCE';

const HEAVY_PLAN_DELTA_TARGET_TYPES = new Set([
  'HOTEL',
  'POI',
  'FLIGHT',
  'ACTIVITY',
  'ROUTE',
  'DAY',
  'SEGMENT',
  'ITINERARY',
]);

export function parseRouteAndRunAsyncMode(raw: string | undefined): RouteAndRunAsyncMode {
  const k = String(raw ?? '').trim().toUpperCase();
  if (k === 'FORCE') return 'FORCE';
  if (k === 'AUTO') return 'AUTO';
  return 'OFF';
}

export function planDeltaIndicatesHeavyPlanning(
  deltas: ReadonlyArray<{ target?: { type?: string } }> | undefined,
): boolean {
  if (!deltas?.length) return false;
  return deltas.some((d) => {
    const t = String(d?.target?.type ?? '').trim().toUpperCase();
    return HEAVY_PLAN_DELTA_TARGET_TYPES.has(t);
  });
}

export type AsyncDelegationClassifyInput = {
  request: RouteAndRunRequestDto;
  signals?: RoutingSignals;
  planDelta?: ReadonlyArray<{ target?: { type?: string } }>;
  /** 将触发「无 trip_id 规划 → 工作台重定向」时不委托 */
  wouldRedirectToPlanningWorkbench?: boolean;
};

/**
 * AUTO：INTENT_COMPILE 后判定是否应切入异步（重规划 / 全链编排）。
 */
export function shouldDelegateRouteAndRunToAsync(input: AsyncDelegationClassifyInput): boolean {
  const mode = parseRouteAndRunAsyncMode(input.request.options?.async_mode);
  if (mode === 'OFF') return false;
  if (input.request.options?.dry_run === true) return false;
  if (input.request.options?.orchestration_replay_anchor_snapshot_id) return false;
  if (input.wouldRedirectToPlanningWorkbench) return false;

  if (mode === 'FORCE') return true;

  const signals = input.signals ?? signalsFromRequest(input.request);
  if (signals.taskType !== 'TRIP_PLANNING') return false;

  const deltas = input.planDelta ?? [];
  if (planDeltaIndicatesHeavyPlanning(deltas)) return true;
  if (deltas.length > 0) return true;

  const usesSm =
    input.request.options?.use_state_machine_orchestration !== false &&
    input.request.options?.use_claude_orchestration !== false;
  const boundTrip = Boolean(input.request.trip_id?.trim());
  if (usesSm && boundTrip) return true;

  return signals.complexity === 'COMPLEX' || signals.requiresStructuredOutput === true;
}

export function buildDelegatedRouteAndRunResponse(
  request: RouteAndRunRequestDto,
  init: RouteAndRunTaskInitResponseDto,
  opts?: { delegation_reason?: string },
): RouteAndRunResponseDto {
  const phase = asOrchestrationStep(init.current_phase);
  const pollPath = `/api/agent/task/status/${init.task_id}`;

  return {
    request_id: request.request_id,
    route: {
      route: RouteType.SYSTEM2_REASONING,
      confidence: 1,
      reasons: [RouterReason.LLM_DECISION],
      required_capabilities: ['planning'],
      consent_required: false,
      budget: {
        max_seconds: request.options?.max_seconds ?? 60,
        max_steps: request.options?.max_steps ?? 8,
        max_browser_steps: 0,
      },
      ui_hint: {
        mode: 'slow',
        status: UIStatus.THINKING,
        message:
          opts?.delegation_reason ??
          'async_mode：重规划请求已委托后台 Durable Task，请轮询 task 状态',
      },
    },
    ui_state: {
      phase,
      ui_status: 'thinking',
      progress_percent: init.progress_percentage,
      message: init.message,
      requires_user_action: false,
    },
    result: {
      status: 'PROCESSING',
      answer_text: init.message,
      payload: {} as RouteAndRunResponseDto['result']['payload'],
    },
    async_task: {
      task_id: init.task_id,
      status: init.status,
      is_async_delegated: true,
      current_phase: init.current_phase,
      progress_percentage: init.progress_percentage,
      message: init.message,
      poll_path: pollPath,
      delegation_reason: opts?.delegation_reason,
    },
    observability: {
      async_delegation: true,
      async_mode: parseRouteAndRunAsyncMode(request.options?.async_mode),
      task_id: init.task_id,
      poll_path: pollPath,
    },
    explain: {
      decision_log: [],
      simplified_explanation: {
        summary: init.message,
        key_decisions: [],
        evidence_count: 0,
        has_details: false,
      },
    },
  } as unknown as RouteAndRunResponseDto;
}
