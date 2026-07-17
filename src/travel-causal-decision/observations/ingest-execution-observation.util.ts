/**
 * Direct observation ingest — GPS / check-in / navigation → ActualOutcomeSnapshot.
 * Used by DecisionOutcomeValidation and causal-trace calibrate path.
 */

import type { ActualOutcomeSnapshot } from '../types/decision-outcome.types';
import type {
  ObservedOutcome,
  ObservedOutcomeSource,
} from '../../trips/decision-semantics/types/decision-semantics.types';
import type { LightExecutionSignal } from '../../trips/decision-semantics/validation/load-light-execution-observations.util';

export interface GpsArrivalFix {
  /** ISO arrival / geofence enter time */
  arrivedAt: string;
  lat?: number;
  lng?: number;
  /** Meters accuracy if known */
  accuracyM?: number;
  nearEntityId?: string;
  /** True when fix is inside activity geofence */
  insideGeofence?: boolean;
}

export interface CheckInObservation {
  checkedInAt: string;
  bookingId?: string;
  activityId?: string;
  status?: string;
}

function findMetric(observed: ObservedOutcome[], metric: string): ObservedOutcome | undefined {
  return observed.find((o) => o.metric === metric);
}

/**
 * Build ActualOutcomeSnapshot from Decision Semantics observed outcomes
 * (GPS / check-in / navigation already merged by collectObservedOutcomes).
 */
export function actualOutcomeFromObservedOutcomes(
  observed: ObservedOutcome[],
): ActualOutcomeSnapshot | undefined {
  if (!observed.length) return undefined;

  const arrival = findMetric(observed, 'ARRIVAL_TIME');
  const completion = findMetric(observed, 'ACTIVITY_COMPLETION');
  const driving = findMetric(observed, 'DRIVING_DURATION');
  const cost = findMetric(observed, 'COST');

  const metrics: Record<string, number> = {};
  if (driving && Number.isFinite(Number(driving.actualValue))) {
    metrics.actual_travel_minutes = Number(driving.actualValue);
  }
  if (cost && Number.isFinite(Number(cost.actualValue))) {
    metrics.actual_cost = Number(cost.actualValue);
  }
  if (completion) {
    const done =
      completion.actualValue === true ||
      completion.actualValue === 'true' ||
      completion.actualValue === 1;
    metrics.iceland_miss_prob = done ? 0.05 : 0.9;
    metrics.completion_probability = done ? 0.95 : 0.1;
  }

  const sources = [...new Set(observed.map((o) => String(o.source)))] as string[];
  const hasProductSignal =
    arrival != null ||
    completion != null ||
    sources.includes('GPS') ||
    sources.includes('BOOKING_CHECKIN') ||
    sources.includes('USER_ARRIVAL_CLICK') ||
    sources.includes('NAVIGATION_EVENT');

  if (!hasProductSignal && Object.keys(metrics).length === 0) return undefined;

  let completed: boolean | undefined;
  if (completion != null) {
    completed =
      completion.actualValue === true ||
      completion.actualValue === 'true' ||
      completion.actualValue === 1;
  }

  return {
    arrivalTime: arrival ? String(arrival.actualValue) : undefined,
    completed,
    actualCost:
      cost && Number.isFinite(Number(cost.actualValue))
        ? Number(cost.actualValue)
        : undefined,
    metrics: Object.keys(metrics).length ? metrics : undefined,
    observedAt:
      arrival?.observedAt ??
      completion?.observedAt ??
      observed[0]?.observedAt ??
      new Date().toISOString(),
    sources: sources.length ? sources : ['SYSTEM_INFERENCE'],
  };
}

/** GPS geofence / arrival fix → ActualOutcomeSnapshot */
export function actualOutcomeFromGpsFix(fix: GpsArrivalFix): ActualOutcomeSnapshot {
  const completed = fix.insideGeofence !== false;
  return {
    arrivalTime: fix.arrivedAt,
    completed,
    metrics: {
      iceland_miss_prob: completed ? 0.05 : 0.85,
      completion_probability: completed ? 0.95 : 0.15,
      ...(fix.accuracyM != null ? { gps_accuracy_m: fix.accuracyM } : {}),
      ...(fix.lat != null ? { lat: fix.lat } : {}),
      ...(fix.lng != null ? { lng: fix.lng } : {}),
    },
    observedAt: fix.arrivedAt,
    sources: ['GPS'],
  };
}

/** Booking / activity check-in → ActualOutcomeSnapshot */
export function actualOutcomeFromCheckIn(obs: CheckInObservation): ActualOutcomeSnapshot {
  return {
    completed: true,
    metrics: {
      iceland_miss_prob: 0.05,
      completion_probability: 0.95,
    },
    observedAt: obs.checkedInAt,
    sources: ['BOOKING_CHECKIN'],
  };
}

/** Prefer GPS > check-in > light signals when building from mixed LightExecutionSignal[]. */
export function actualOutcomeFromLightSignals(
  signals: LightExecutionSignal[],
): ActualOutcomeSnapshot | undefined {
  if (!signals.length) return undefined;

  const gps = signals.find((s) => s.rawSource.startsWith('gps:') || s.kind === 'user_arrival_click');
  const checkin = signals.find((s) => s.kind === 'booking_checkin');
  const timing = signals.find(
    (s) => s.kind === 'itinerary_item_timing' && s.value === 'completed',
  );

  if (gps && (gps.rawSource.startsWith('gps:') || typeof gps.value === 'string')) {
    if (gps.rawSource.startsWith('gps:')) {
      const payload = typeof gps.value === 'string' && gps.value.startsWith('{')
        ? (JSON.parse(gps.value) as { lat?: number; lng?: number; accuracyM?: number })
        : {};
      return actualOutcomeFromGpsFix({
        arrivedAt: gps.observedAt,
        lat: payload.lat,
        lng: payload.lng,
        accuracyM: payload.accuracyM,
        nearEntityId: gps.entityId,
        insideGeofence: true,
      });
    }
    return {
      arrivalTime: String(gps.value),
      completed: true,
      metrics: { iceland_miss_prob: 0.05, completion_probability: 0.95 },
      observedAt: gps.observedAt,
      sources: ['USER_ARRIVAL_CLICK'],
    };
  }

  if (checkin) {
    return actualOutcomeFromCheckIn({
      checkedInAt: checkin.observedAt,
      activityId: checkin.entityId,
      status: String(checkin.value),
    });
  }

  if (timing) {
    return {
      completed: true,
      metrics: { iceland_miss_prob: 0.08, completion_probability: 0.92 },
      observedAt: timing.observedAt,
      sources: ['ITINERARY_ITEM_STATUS'],
    };
  }

  return undefined;
}

export function isHighTrustObservationSource(source: ObservedOutcomeSource | string): boolean {
  return (
    source === 'GPS' ||
    source === 'BOOKING_CHECKIN' ||
    source === 'USER_ARRIVAL_CLICK' ||
    source === 'NAVIGATION_EVENT'
  );
}
