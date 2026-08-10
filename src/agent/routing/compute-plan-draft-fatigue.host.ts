/**
 * PLAN/REPAIR TDFPM fatigue 宿主。
 */

import type { Logger } from '@nestjs/common';
import type { Itinerary } from '../interfaces/trip-plan.interface';
import type { TdfpmDayContext } from '../../trips/decision/services/tdfpm-calculator.service';

export interface ComputePlanDraftFatigueHost {
  readonly logger: Pick<Logger, 'debug' | 'warn'>;
  readonly tdfpmCalculator?: {
    computeFatigueScore(ctx: TdfpmDayContext): { fatigueScore: number };
  };
  itineraryToTdfpmDayContexts(itinerary: Itinerary): TdfpmDayContext[];
}
