/**
 * 住宿 RouteRun UI 挂载 / Client Session 持久化（从 ClaudeOrchestrator 迁出）。
 */

import type { Logger } from '@nestjs/common';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import type { HotelRouteRunUiPayload } from '../utils/hotel-mcp-route-run.mapper';
import { mapHotelRouteRunUiToAccommodationItems } from '../utils/route-run-accommodation-apply.util';

export function attachHotelRouteRunUiToOrchestrationResult(
  result: OrchestrationResult,
  hotelRouteRunUi: HotelRouteRunUiPayload,
): OrchestrationResult {
  if (!result.result) return result;
  return {
    ...result,
    result: {
      ...result.result,
      accommodations: hotelRouteRunUi.accommodations,
      airbnbListings: hotelRouteRunUi.airbnbListings,
      routing: hotelRouteRunUi.routing,
      ...(hotelRouteRunUi.night_groups?.length
        ? { accommodation_night_groups: hotelRouteRunUi.night_groups }
        : {}),
      ...(hotelRouteRunUi.hotel_search_meta
        ? { hotel_search_meta: hotelRouteRunUi.hotel_search_meta }
        : {}),
    },
  };
}

export interface PersistRouteRunAccommodationsHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly planningAssistantV2Service?: {
    persistLastAccommodationsForApply: (
      sessionId: string,
      tripId: string,
      items: unknown[],
      userId?: string,
    ) => Promise<unknown>;
  };
}

export function persistRouteRunAccommodationsToClientSession(
  host: PersistRouteRunAccommodationsHost,
  request: RouteAndRunRequestDto,
  tripId: string | undefined,
  hotelRouteRunUi: HotelRouteRunUiPayload,
): void {
  const sessionId = request.options?.client_session_id?.trim();
  const tid = tripId?.trim();
  if (!sessionId || !tid || !host.planningAssistantV2Service) return;
  const items = mapHotelRouteRunUiToAccommodationItems(hotelRouteRunUi);
  if (!items.length) return;
  void host.planningAssistantV2Service
    .persistLastAccommodationsForApply(sessionId, tid, items, request.user_id)
    .catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      host.logger.warn(
        `[Claude Orchestrator] persist route_run accommodations failed sessionId=${sessionId}: ${msg}`,
      );
    });
}
