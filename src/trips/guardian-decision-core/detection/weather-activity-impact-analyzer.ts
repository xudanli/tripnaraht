/**
 * Slice 2 — weather hazard → affected outdoor plan items.
 */

import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import type { EntityRef } from '../contracts/entity-ref.types';
import {
  indexSegmentsByDay,
  readSegmentItineraryItemId,
} from './segment-plan-item.util';

export interface WeatherActivityImpactInput {
  tripId: string;
  dayIndex?: number;
  regionId?: string;
}

export interface WeatherActivityImpactResult {
  dayIndex?: number;
  regionId?: string;
  affectedPlanItemIds: string[];
  affectedEntityRefs: EntityRef[];
}

function segmentIsOutdoorExposure(segment: {
  segmentId: string;
  type?: string;
  metadata?: Record<string, unknown>;
}): boolean {
  const meta = segment.metadata ?? {};
  if (meta.exposure === 'indoor') return false;
  if (meta.exposure === 'outdoor') return true;
  const activityType = String(meta.activityType ?? meta.kind ?? '').toUpperCase();
  if (activityType.includes('GLACIER') || activityType.includes('HIKING')) {
    return true;
  }
  const segType = String(segment.type ?? '').toLowerCase();
  if (segType === 'activity' || segType === 'poi_visit') return true;
  // Default: itinerary-linked segments are outdoor-eligible unless marked indoor
  if (meta.itineraryItemId) return true;
  return false;
}

export function analyzeWeatherActivityImpact(
  plan: RoutePlanDraft,
  input: WeatherActivityImpactInput,
): WeatherActivityImpactResult {
  const affectedPlanItemIds: string[] = [];
  const affectedEntityRefs: EntityRef[] = [];
  const byDay = indexSegmentsByDay(plan);

  for (const [dayIndex, daySegments] of byDay) {
    if (input.dayIndex != null && dayIndex !== input.dayIndex) continue;

    for (const segment of daySegments) {
      if (!segmentIsOutdoorExposure(segment as any)) continue;
      const itemId = readSegmentItineraryItemId(segment as any);
      if (!itemId) continue;
      if (!affectedPlanItemIds.includes(itemId)) {
        affectedPlanItemIds.push(itemId);
        affectedEntityRefs.push({
          kind: 'PLAN_ITEM',
          id: itemId,
          label: `day${dayIndex}`,
        });
      }
    }
  }

  return {
    dayIndex: input.dayIndex,
    regionId: input.regionId,
    affectedPlanItemIds,
    affectedEntityRefs,
  };
}

export function assertWeatherImpactHasPlanItems(
  impact: WeatherActivityImpactResult,
): void {
  if (!impact.affectedPlanItemIds.length) {
    throw new Error(
      'Weather hazard impact analysis found no outdoor plan items to evaluate',
    );
  }
}
