/**
 * Itinerary → TdfpmDayContext 简化转换（纯函数，从 ClaudeOrchestrator 迁出）。
 */

import type { Itinerary } from '../interfaces/trip-plan.interface';
import type { TdfpmDayContext } from '../../trips/decision/services/tdfpm-calculator.service';

export function itineraryToTdfpmDayContexts(itinerary: Itinerary): TdfpmDayContext[] {
  const contexts: TdfpmDayContext[] = [];
  for (const day of itinerary.days || []) {
    let drivingHours = 0;
    let departureHour = 8;
    for (const item of day.items || []) {
      const mins = item.metadata?.duration_minutes;
      if (mins != null && (item.type === 'DRIVE' || item.type === 'TRANSIT')) {
        drivingHours += mins / 60;
      } else if (mins != null && item.type === 'WALK') {
        drivingHours += (mins / 60) * 0.3;
      }
      if (item.start_window) {
        const m = item.start_window.match(/(\d{1,2}):(\d{2})|T(\d{2})/);
        if (m) departureHour = parseInt(m[1] ?? m[3] ?? '8', 10);
      }
    }
    if (drivingHours === 0 && day.items?.length) {
      drivingHours = 2;
    }
    contexts.push({
      drivingHours: Math.min(drivingHours, 12),
      roadType: 'highway',
      departureHour,
    });
  }
  return contexts;
}
