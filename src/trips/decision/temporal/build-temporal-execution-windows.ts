/**
 * 由 effective 驾驶窗生成 slot 级 TemporalExecutionWindow（v0：同日敏感槽共享窗）。
 *
 * @deprecated P5-CLOSE：决策解释用 overlay.annotations.temporalProjection；本输出仅供调试/Agent 展示。
 */

import type { TripPlan } from '../plan-model';
import type { ActivityType } from '../world-model';
import type { TemporalExecutionWindow } from './temporal-execution-window.types';
import type { EffectiveDrivableWindow } from './effective-drivable-window.types';

const DAYLIGHT_SENSITIVE: ReadonlySet<ActivityType> = new Set([
  'transport',
  'nature',
  'sightseeing',
  'tour',
]);

export function buildTemporalExecutionWindowsBySlot(
  plan: TripPlan,
  effectiveByDate: Partial<Record<string, EffectiveDrivableWindow>>,
): Record<string, TemporalExecutionWindow> {
  const out: Record<string, TemporalExecutionWindow> = {};

  for (const day of plan.days) {
    const eff = effectiveByDate[day.date];
    if (!eff) {
      continue;
    }

    for (const slot of day.timeSlots) {
      if (!DAYLIGHT_SENSITIVE.has(slot.type)) {
        continue;
      }

      out[slot.id] = {
        slotId: slot.id,
        startFeasibleAt: eff.effectiveStart,
        endFeasibleAt: eff.effectiveEnd,
        hardBoundary: false,
        reasonCodes: ['EFFECTIVE_DRIVABLE_WINDOW_V0'],
        derivedFrom: ['DAYLIGHT', 'WEATHER', 'ROAD'],
      };
    }
  }

  return out;
}
