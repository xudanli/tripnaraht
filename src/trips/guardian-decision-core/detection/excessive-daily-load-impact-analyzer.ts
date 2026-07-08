/**
 * Slice 3 — excessive daily driving load → affected plan items on overloaded day.
 */

import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import { DRIVING_SAFETY_CONFIG } from '../../decision/optimization/learning/guardian-persona.interface';
import type { EntityRef } from '../contracts/entity-ref.types';
import {
  computeDrivingHoursByDay,
} from '../adapters/dre-road-load.adapter';
import {
  indexSegmentsByDay,
  readSegmentItineraryItemId,
} from './segment-plan-item.util';

export const DEFAULT_EXCESSIVE_DAILY_LOAD_THRESHOLD_HOURS =
  DRIVING_SAFETY_CONFIG.baseSafeHours;

export interface ExcessiveDailyLoadImpactInput {
  tripId: string;
  dayIndex: number;
  thresholdHours?: number;
}

export interface ExcessiveDailyLoadImpactResult {
  dayIndex: number;
  drivingHours: number;
  thresholdHours: number;
  affectedPlanItemIds: string[];
  affectedEntityRefs: EntityRef[];
}

export interface PlanDailyLoadScanResult {
  dayIndex: number;
  drivingHours: number;
  thresholdHours: number;
}

export function scanPlanForExcessiveDailyLoad(
  plan: RoutePlanDraft,
  thresholdHours: number = DEFAULT_EXCESSIVE_DAILY_LOAD_THRESHOLD_HOURS,
  speedKmH: number = 65,
): PlanDailyLoadScanResult | null {
  const byDay = computeDrivingHoursByDay(plan, speedKmH);
  let worstDay = -1;
  let worstHours = 0;
  for (const [day, hours] of byDay) {
    if (hours > worstHours) {
      worstHours = hours;
      worstDay = day;
    }
  }
  if (worstDay < 0 || worstHours <= thresholdHours) {
    return null;
  }
  return { dayIndex: worstDay, drivingHours: worstHours, thresholdHours };
}

export function analyzeExcessiveDailyLoadImpact(
  plan: RoutePlanDraft,
  input: ExcessiveDailyLoadImpactInput,
  speedKmH: number = 65,
): ExcessiveDailyLoadImpactResult {
  const thresholdHours =
    input.thresholdHours ?? DEFAULT_EXCESSIVE_DAILY_LOAD_THRESHOLD_HOURS;
  const byDay = indexSegmentsByDay(plan);
  const daySegments = byDay.get(input.dayIndex) ?? [];
  const affectedPlanItemIds: string[] = [];
  const affectedEntityRefs: EntityRef[] = [];

  for (const segment of daySegments) {
    const itemId = readSegmentItineraryItemId(segment as any);
    if (!itemId || affectedPlanItemIds.includes(itemId)) continue;
    affectedPlanItemIds.push(itemId);
    affectedEntityRefs.push({
      kind: 'PLAN_ITEM',
      id: itemId,
      label: `day${input.dayIndex}`,
    });
  }

  const hoursByDay = computeDrivingHoursByDay(plan, speedKmH);
  const drivingHours = hoursByDay.get(input.dayIndex) ?? 0;

  return {
    dayIndex: input.dayIndex,
    drivingHours,
    thresholdHours,
    affectedPlanItemIds,
    affectedEntityRefs,
  };
}

export function assertExcessiveLoadImpactHasPlanItems(
  impact: ExcessiveDailyLoadImpactResult,
): void {
  if (!impact.affectedPlanItemIds.length) {
    throw new Error(
      'Excessive daily load impact found no plan items on overloaded day',
    );
  }
}
