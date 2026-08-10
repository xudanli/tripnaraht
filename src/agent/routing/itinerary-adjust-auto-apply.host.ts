/**
 * ITINERARY_ADJUST AUTO / POI_SLOT_FILL 落库宿主。
 */

import type { Logger } from '@nestjs/common';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

export interface ItineraryAdjustAutoApplyHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly tripsService?: any;
  readonly skillsRegistry?: {
    getSkill: (name: string) => { execute: (input: any) => Promise<any> } | undefined;
  };
  /** Prometheus；缺省时 funnel 记录为 no-op */
  readonly promMetrics?: any;

  resolvePlaceIdForItineraryAdjustApply(
    item: any,
    state: OrchestratorState | { research_data?: unknown },
  ): number | undefined;
}

export type { OrchestratorState };
