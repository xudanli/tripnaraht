/**
 * 绑定行程突变宿主：Trips / Skills / 版本与 POI 解析仍挂在 ClaudeOrchestrator。
 */

import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

export interface BoundTripItineraryMutationsHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly prisma: PrismaService;
  readonly tripsService?: any;
  readonly skillsRegistry?: {
    getSkill: (name: string) => { execute: (input: any) => Promise<any> } | undefined;
  };
  readonly planningAssistantV2Service?: any;
  readonly itineraryVersion?: any;
  readonly tripRunManager?: any;

  inferCountryFromDestination(destination: string): string | undefined;
  loadTripPlacePoiEvidenceForAdjust(
    tripId: string,
    userId: string | undefined,
  ): Promise<any[]>;
  resolvePlaceIdForItineraryAdjustApply(
    item: any,
    state: OrchestratorState | { research_data?: unknown },
  ): number | undefined;
}

export type { RouteAndRunRequestDto, OrchestratorState };
