/**
 * 整段多日重规划后住宿 MCP 富化宿主。
 */

import type { Logger } from '@nestjs/common';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  OrchestrationResult,
} from '../interfaces/claude-orchestration.interface';
import type { HotelRouteRunUiPayload } from '../utils/hotel-mcp-route-run.mapper';

export interface FullTripReplanHotelHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly mcpToolDispatcher?: unknown;

  runLiveHotelSensorBranch(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    tripId: string | undefined,
    opts?: { fullTripReplan?: boolean },
  ): Promise<{ hotelRouteRunUi?: HotelRouteRunUiPayload | null }>;
  persistRouteRunAccommodationsToClientSession(
    request: RouteAndRunRequestDto,
    tripId: string | undefined,
    hotelRouteRunUi: HotelRouteRunUiPayload,
  ): void;
  attachHotelRouteRunUiToOrchestrationResult(
    result: OrchestrationResult,
    hotelRouteRunUi: HotelRouteRunUiPayload,
  ): OrchestrationResult;
}
