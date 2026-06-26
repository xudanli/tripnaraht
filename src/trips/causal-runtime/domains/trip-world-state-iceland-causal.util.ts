/**
 * Derive Iceland self-drive causal assessment from TripWorldState + TripPlan.
 */

import type { TripPlan } from '../../decision/plan-model';
import type { TripWorldState } from '../../decision/world-model';
import { analyzeIcelandSelfDriveLeg } from './iceland-causal-bridge';
import type { IcelandSelfDriveCausalOutput } from './iceland-self-drive-causal.types';

export function isIcelandDestination(destination?: string): boolean {
  if (!destination) return false;
  const d = destination.toLowerCase();
  return (
    d === 'is' ||
    d.includes('iceland') ||
    d.includes('冰岛') ||
    d.includes('reykjavik') ||
    d.includes('vik')
  );
}

export function extractWindMpsFromState(state: TripWorldState, date?: string): number | undefined {
  const targetDate = date ?? state.context.startDate;
  const wx = state.signals.weatherByDate?.[targetDate];
  const fromSignal =
    (wx as { windMps?: number } | undefined)?.windMps ??
    (wx as { windSpeedMs?: number } | undefined)?.windSpeedMs ??
    (wx as { maxWindMps?: number } | undefined)?.maxWindMps;
  if (typeof fromSignal === 'number' && Number.isFinite(fromSignal)) {
    return fromSignal;
  }
  return undefined;
}

/**
 * Best-effort P2 assessment from first long drive leg in plan.
 * Returns undefined when destination is not Iceland or inputs are insufficient.
 */
export function buildIcelandAssessmentFromTripState(
  state: TripWorldState,
  plan: TripPlan | null,
  overrides?: {
    routeLabel?: string;
    distanceKm?: number;
    baseDurationMinutes?: number;
    windMps?: number;
    appointmentSlackMinutes?: number;
  },
): IcelandSelfDriveCausalOutput | undefined {
  if (!isIcelandDestination(state.context.destination)) return undefined;

  const windMps = overrides?.windMps ?? extractWindMpsFromState(state) ?? 14;
  const driveLeg = findFirstLongDriveLeg(plan);
  const distanceKm = overrides?.distanceKm ?? driveLeg?.distanceKm ?? 180;
  const baseDurationMinutes =
    overrides?.baseDurationMinutes ?? driveLeg?.durationMin ?? 130;
  const routeLabel =
    overrides?.routeLabel ??
    driveLeg?.label ??
    `${state.context.destination} 自驾路段 → 下一预约点`;
  const appointmentSlackMinutes =
    overrides?.appointmentSlackMinutes ?? estimateAppointmentSlack(plan, baseDurationMinutes);

  return analyzeIcelandSelfDriveLeg({
    routeLabel,
    distanceKm,
    durationMinutes: baseDurationMinutes,
    windMps,
    appointmentSlackMinutes,
    region: inferIcelandRegion(state.context.destination),
    vehicleClass: normalizeVehicleClass(state.policies?.vehicleClass),
  }, state.signals.icelandCausalCalibration);
}

export function attachIcelandAssessmentToState(
  state: TripWorldState,
  assessment: IcelandSelfDriveCausalOutput | undefined,
): void {
  if (!assessment) return;
  state.signals.icelandSelfDriveCausalAssessment = assessment;
}

function findFirstLongDriveLeg(plan: TripPlan | null): {
  distanceKm: number;
  durationMin: number;
  label?: string;
} | undefined {
  if (!plan?.days?.length) return undefined;
  for (const day of plan.days) {
    for (const slot of day.timeSlots ?? []) {
      const leg = (slot as { travelLeg?: { distanceKm?: number; durationMin?: number } }).travelLeg;
      if (leg?.durationMin && leg.durationMin >= 60) {
        return {
          distanceKm: leg.distanceKm ?? 120,
          durationMin: leg.durationMin,
          label: (slot as { name?: { en?: string; zh?: string } }).name?.zh ??
            (slot as { name?: { en?: string } }).name?.en,
        };
      }
    }
  }
  return undefined;
}

function estimateAppointmentSlack(plan: TripPlan | null, driveMinutes: number): number {
  if (!plan?.days?.length) return Math.max(15, 120 - driveMinutes);
  const firstDay = plan.days[0];
  const slots = firstDay?.timeSlots ?? [];
  if (slots.length < 2) return Math.max(15, 90 - driveMinutes);
  const first = slots[0] as { endMin?: number; startMin?: number };
  const second = slots[1] as { startMin?: number };
  if (typeof first?.endMin === 'number' && typeof second?.startMin === 'number') {
    return Math.max(0, second.startMin - first.endMin - driveMinutes);
  }
  return Math.max(15, 75 - Math.round(driveMinutes * 0.4));
}

function inferIcelandRegion(destination: string): string | undefined {
  const d = destination.toLowerCase();
  if (d.includes('vik') || d.includes('南岸') || d.includes('south')) return 'vik';
  if (d.includes('hofn') || d.includes('赫本')) return 'hofn';
  if (d.includes('reykjavik') || d.includes('雷克雅未克')) return 'reykjavik';
  return 'south_coast';
}

function normalizeVehicleClass(
  v?: string,
): '2WD' | '4WD' | 'AWD' | 'unknown' | undefined {
  if (!v) return undefined;
  const u = v.toUpperCase();
  if (u.includes('2WD')) return '2WD';
  if (u.includes('4WD')) return '4WD';
  if (u.includes('AWD')) return 'AWD';
  return 'unknown';
}
