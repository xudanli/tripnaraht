/**
 * 整段多日重规划完成后：自动逐晚触发住宿 MCP（从 ClaudeOrchestrator 迁出）。
 */

import type { FullTripReplanHotelHost } from './full-trip-replan-hotel.host';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  OrchestrationResult,
} from '../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import {
  detectFullTripReplanHotelIntent,
  isItineraryFullTripReplanMetadata,
} from '../utils/itinerary-adjust-intent.util';
import { enrichHotelRouteRunUiForClientApply } from '../utils/route-run-accommodation-apply.util';

export async function enrichOrchestrationResultWithFullTripReplanHotel(
  host: FullTripReplanHotelHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  state: OrchestratorState,
  result: OrchestrationResult,
): Promise<OrchestrationResult> {
  if (!isItineraryFullTripReplanMetadata(state.metadata as Record<string, unknown> | undefined)) {
    return result;
  }
  const md = state.metadata as Record<string, unknown>;
  const hasClarification =
    Array.isArray(state.clarification_questions) && state.clarification_questions.length > 0;
  if (hasClarification) return result;

  const msg =
    request.message ??
    (typeof md.intake_user_message === 'string' ? md.intake_user_message : '');
  if (!detectFullTripReplanHotelIntent(msg, md)) return result;

  const tripId = request.trip_id?.trim() ?? context.tripId?.trim();
  if (!host.mcpToolDispatcher) {
    state.decision_log.push({
      request_id: state.request_id,
      step: 'NARRATE',
      actor: 'Orchestrator',
      inputs_summary: '整段多日重规划：绑定 Trip 后自动触发逐晚住宿 MCP',
      outputs_summary: '住宿 MCP 未配置（mcpToolDispatcher 不可用），已跳过检索',
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        system_action: 'FULL_TRIP_REPLAN_HOTEL_SENSOR',
        skipped: true,
        reason: 'mcp_unavailable',
      },
    });
    return result;
  }
  try {
    const hBranch = await host.runLiveHotelSensorBranch(request, context, tripId, {
      fullTripReplan: true,
    });
    (state.metadata as Record<string, unknown>).full_trip_replan_hotel_sensor = {
      attempted: true,
      ok: !!hBranch.hotelRouteRunUi?.accommodations?.length,
      card_count: hBranch.hotelRouteRunUi?.accommodations?.length ?? 0,
    };
    state.decision_log.push({
      request_id: state.request_id,
      step: 'NARRATE',
      actor: 'Orchestrator',
      inputs_summary: '整段多日重规划：绑定 Trip 后自动触发逐晚住宿 MCP',
      outputs_summary: hBranch.hotelRouteRunUi?.accommodations?.length
        ? `住宿 MCP 返回 ${hBranch.hotelRouteRunUi.accommodations.length} 张候选卡片（第 ${(hBranch.hotelRouteRunUi.hotel_search_meta?.sampled_nights ?? []).join('、')} 晚）`
        : '住宿 MCP 未返回可用候选（不影响行程草案）',
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: { system_action: 'FULL_TRIP_REPLAN_HOTEL_SENSOR' },
    });
    if (!hBranch.hotelRouteRunUi?.accommodations?.length) {
      return result;
    }
    const enrichedUi = enrichHotelRouteRunUiForClientApply(hBranch.hotelRouteRunUi);
    host.persistRouteRunAccommodationsToClientSession(request, tripId, enrichedUi);
    return host.attachHotelRouteRunUiToOrchestrationResult(result, enrichedUi);
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] FULL_TRIP_REPLAN hotel sensor failed request_id=${request.request_id}: ${e instanceof Error ? e.message : String(e)}`,
    );
    return result;
  }
}
