/**
 * PR-C / P5-FINAL：弱域降级为 overlay metadata（非独立决策源）。
 */

import type { TripPlan } from '../decision/plan-model';
import type { TripWorldState } from '../decision/world-model';
import type { ExecutionOverlayFrame } from './execution-overlay-frame.types';
import { deriveTemporalProjectionFromFrame } from './derive-temporal-from-overlay';
import { parseIsoTimeToMinutes } from '../decision/utils/weather-slot-delay.util';

function dateForLegId(plan: TripPlan, legId: string): string | undefined {
  for (const day of plan.days) {
    if (day.timeSlots.some(s => s.id === legId)) {
      return day.date;
    }
  }
  return undefined;
}

function hotelLateCheckinRiskForDate(
  plan: TripPlan,
  date: string,
  latestIso: string | undefined,
): boolean {
  if (!latestIso) {
    return false;
  }
  const day = plan.days.find(d => d.date === date);
  if (!day) {
    return false;
  }
  const latestM = parseIsoTimeToMinutes(latestIso);
  for (const slot of day.timeSlots) {
    if (slot.type === 'hotel') {
      const arrivalM = parseIsoTimeToMinutes(slot.time);
      if (arrivalM > latestM) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 在 repair hints 合并后调用：temporal 投影 + 极光 + mobility + booking 标注。
 */
export function stampOverlayAnnotationsFromSignals(
  plan: TripPlan,
  state: Pick<TripWorldState, 'signals' | 'policies'>,
  frames: ExecutionOverlayFrame[],
): ExecutionOverlayFrame[] {
  const latest = state.policies?.microRepair?.hotelCheckinLatest;

  return frames.map(frame => {
    const date = dateForLegId(plan, frame.legId);
    const aurora = date ? state.signals.auroraOpportunityByDate?.[date] : undefined;
    const temporalProjection = deriveTemporalProjectionFromFrame(frame);
    const hotelLate = date ? hotelLateCheckinRiskForDate(plan, date, latest) : false;

    const score = aurora?.opportunityScore;

    return {
      ...frame,
      annotations: {
        ...frame.annotations,
        temporalProjection,
        mobilityDeltaMinutes: frame.temporal.unifiedDelayMinutes,
        ...(score !== undefined
          ? { auroraOpportunityScore: score, auroraScore: score }
          : {}),
        bookingImpact: {
          ...frame.annotations?.bookingImpact,
          ...(hotelLate ? { hotelLateCheckinRisk: true } : {}),
        },
      },
    };
  });
}
