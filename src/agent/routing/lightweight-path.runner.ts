/**
 * Lightweight 短路实现：指定日行程查看 / 工作台占位欢迎语。
 */

import { buildWorkbenchPlaceholderWelcomeText } from '../orchestration/graph/nodes/intake-workbench-placeholder.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  OrchestrationResult,
} from '../interfaces/claude-orchestration.interface';
import type {
  OrchestrationStep,
  OrchestratorState,
  SubAgentType,
} from '../interfaces/trip-plan.interface';
import {
  buildItineraryDayViewAnswerText,
  parseItineraryDayViewSpec,
  resolveTripDayIndexFromViewSpec,
} from '../utils/itinerary-day-view.util';
import type { LightweightTripLookupHost } from './lightweight-path.host';

/**
 * 绑定 Trip：工作台 UI 占位欢迎语 → 秒回引导，不跑 RESEARCH/POI_SELECTION。
 */
export async function runWorkbenchPlaceholderPath(
  host: LightweightTripLookupHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  startTime: number,
): Promise<OrchestrationResult> {
  const tripId = (request.trip_id || context.tripId || '').trim();
  let destination = '当前';
  let dateRange: { start_date?: string; end_date?: string } | undefined;
  if (tripId && host.findTripForLightweight) {
    try {
      const trip = await host.findTripForLightweight(tripId, request.user_id);
      if (trip?.destination) destination = String(trip.destination);
      if (trip?.startDate && trip?.endDate) {
        dateRange = {
          start_date:
            trip.startDate instanceof Date
              ? trip.startDate.toISOString().slice(0, 10)
              : String(trip.startDate).slice(0, 10),
          end_date:
            trip.endDate instanceof Date
              ? trip.endDate.toISOString().slice(0, 10)
              : String(trip.endDate).slice(0, 10),
        };
      }
    } catch (e: unknown) {
      host.logger.debug(
        `[Claude Orchestrator] workbench placeholder trip load skipped: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  const answerText = buildWorkbenchPlaceholderWelcomeText({
    trip_plan_request: { destination, date_range: dateRange },
  } as OrchestratorState);
  return {
    success: true,
    answerText,
    result: {
      routingTaskType: 'TRIP_PLANNING',
      workbench_assistant_placeholder: true as const,
      needsUserConfirmation: false,
      intentAnalysis: {
        intentType: 'simple_query',
        complexity: 'simple',
        requiredCapabilities: ['qa'],
        confidence: 0.95,
        reasoning: 'workbench_assistant_placeholder',
      },
    },
    stepsExecuted: [
      {
        stepId: 'workbench_placeholder',
        skillName: 'workbench.placeholder',
        success: true,
        duration: Date.now() - startTime,
      },
    ],
    totalDuration: Date.now() - startTime,
    decisionLog: [
      {
        request_id: request.request_id,
        step: 'INTAKE' as OrchestrationStep,
        actor: 'Orchestrator' as SubAgentType,
        inputs_summary: '规划工作台助手占位欢迎语',
        outputs_summary: answerText,
        evidence_refs: tripId ? [`trip:${tripId}`] : [],
        timestamp: new Date().toISOString(),
        metadata: { system_action: 'WORKBENCH_ASSISTANT_PLACEHOLDER_SHORT_CIRCUIT' },
      },
    ],
  };
}

/**
 * 绑定 Trip：「查看第 N 天行程」→ 读库摘要，跳过规划状态机与目的地澄清。
 */
export async function runItineraryDayViewPath(
  host: LightweightTripLookupHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  startTime: number,
): Promise<OrchestrationResult> {
  const tripId = (request.trip_id || context.tripId || '').trim();
  const message = request.message ?? '';
  const spec = parseItineraryDayViewSpec(message);
  if (!tripId || !spec) {
    return {
      success: false,
      answerText: '未能理解要查看哪一天，请说明「第几天」或具体日期。',
      result: {
        routingTaskType: 'DATA_LOOKUP',
        lightweightKnowledgeQa: true,
      },
      stepsExecuted: [],
      totalDuration: Date.now() - startTime,
      decisionLog: [],
    };
  }

  if (!host.findTripForLightweight) {
    return {
      success: false,
      answerText: '暂时无法读取行程，请稍后重试。',
      result: { routingTaskType: 'DATA_LOOKUP', lightweightKnowledgeQa: true },
      stepsExecuted: [],
      totalDuration: Date.now() - startTime,
      decisionLog: [],
    };
  }

  let trip: {
    destination?: string | null;
    startDate?: Date | string | null;
    endDate?: Date | string | null;
    TripDay?: Array<{
      id?: string;
      date?: Date | string | null;
      ItineraryItem?: Array<Record<string, unknown>>;
    }>;
  };
  try {
    trip = await host.findTripForLightweight(tripId, request.user_id);
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] day view trip load failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return {
      success: false,
      answerText: '未找到关联行程，请确认工作台已打开正确 Trip。',
      result: { routingTaskType: 'DATA_LOOKUP', lightweightKnowledgeQa: true },
      stepsExecuted: [],
      totalDuration: Date.now() - startTime,
      decisionLog: [],
    };
  }

  const days = trip.TripDay ?? [];
  const dateRange =
    trip.startDate && trip.endDate
      ? {
          start_date:
            trip.startDate instanceof Date
              ? trip.startDate.toISOString().slice(0, 10)
              : String(trip.startDate).slice(0, 10),
          end_date:
            trip.endDate instanceof Date
              ? trip.endDate.toISOString().slice(0, 10)
              : String(trip.endDate).slice(0, 10),
        }
      : undefined;
  const resolvedSpec = parseItineraryDayViewSpec(message, dateRange) ?? spec;
  const dayIdx = resolveTripDayIndexFromViewSpec(days, resolvedSpec);
  if (dayIdx == null || !days[dayIdx]) {
    const n = resolvedSpec.dayNumber;
    return {
      success: false,
      answerText:
        n != null
          ? `当前行程共 ${days.length} 天，没有第 ${n} 天。请核对天数或指定具体日期。`
          : '未能定位到指定日期，请说明第几天或 YYYY-MM-DD。',
      result: { routingTaskType: 'DATA_LOOKUP', lightweightKnowledgeQa: true },
      stepsExecuted: [],
      totalDuration: Date.now() - startTime,
      decisionLog: [],
    };
  }

  const day = days[dayIdx];
  const dateIso =
    day.date instanceof Date
      ? day.date.toISOString().slice(0, 10)
      : String(day.date ?? '').slice(0, 10);
  const answerText = buildItineraryDayViewAnswerText({
    dayNumber: dayIdx + 1,
    dateIso: dateIso || undefined,
    items: (day.ItineraryItem ?? []) as never[],
    tripTitle: trip.destination ?? undefined,
  });

  return {
    success: true,
    answerText,
    result: {
      routingTaskType: 'DATA_LOOKUP',
      lightweightKnowledgeQa: true,
      itinerary_day_view_intake: true as const,
      intentAnalysis: {
        intentType: 'simple_query',
        complexity: 'simple',
        requiredCapabilities: ['qa'],
        confidence: 0.95,
        reasoning: 'itinerary_day_view_read',
      },
      suggested_operations: [
        {
          id: 'view_timeline',
          label: '查看行程时间轴',
          action: 'OPEN_TRIP_TIMELINE',
        },
      ],
    },
    stepsExecuted: [
      {
        stepId: 'itinerary_day_view',
        skillName: 'trip.readDay',
        success: true,
        duration: Date.now() - startTime,
      },
    ],
    totalDuration: Date.now() - startTime,
    decisionLog: [
      {
        request_id: request.request_id,
        step: 'INTAKE' as OrchestrationStep,
        actor: 'LocalInsight' as SubAgentType,
        inputs_summary: message,
        outputs_summary: `ITINERARY_DAY_VIEW day=${dayIdx + 1} items=${day.ItineraryItem?.length ?? 0}`,
        evidence_refs: [`trip:${tripId}:day:${dayIdx + 1}`],
        timestamp: new Date().toISOString(),
        metadata: { system_action: 'ITINERARY_DAY_VIEW_READ' },
      },
    ],
  };
}
