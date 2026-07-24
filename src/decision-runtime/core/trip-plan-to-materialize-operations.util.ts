/**
 * TripPlan → PlanOperation[] for RFC-001 itinerary materializer (Guide / full-plan accept).
 */

import type { TripPlan } from '../../trips/decision/plan-model';
import type { PlanOperation } from '../../trips/guardian-decision-core/contracts/plan-operation.types';

export function tripPlanToMaterializeOperations(input: {
  plan: TripPlan;
  tripId: string;
}): PlanOperation[] {
  const operations: PlanOperation[] = [];

  for (const day of input.plan.days) {
    const tripDayIndex = Math.max(0, day.day - 1);
    for (const slot of day.timeSlots) {
      const itemId = `guide_item_${input.tripId}_${slot.id}`;
      const endTime = slot.endTime ?? defaultEndTime(slot.time);
      const sourceTag = slot.semanticTags?.includes('guide_adjusted') ? 'adjusted' : 'guide';

      operations.push({
        operationId: `op_add_${input.tripId}_${slot.id}`,
        kind: 'ADD_ITEM',
        targetRefs: [{ kind: 'DAY', id: String(tripDayIndex) }],
        parameters: {
          tripDayIndex,
          itineraryItemId: itemId,
          placeId: slot.poiId ? Number.parseInt(slot.poiId, 10) : null,
          title: slot.title,
          activityType: slot.type,
          startTime: slot.time,
          endTime,
          dayDate: day.date,
          sourceTag,
          slotId: slot.id,
        },
      });
    }
  }

  return operations;
}

function defaultEndTime(startTime: string): string {
  const [h, m] = startTime.split(':').map(Number);
  const endHour = Math.min(23, (h || 9) + 2);
  return `${String(endHour).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
}
