import type { TripPlan } from '../decision/plan-model';
import type { ExecutionOverlayFrame } from '../execution-overlay/execution-overlay-frame.types';
import type {
  UnifiedPhysicsDerivedState,
  UnifiedPhysicsField,
  UnifiedPhysicsSeverity,
} from './unified-physics-field.types';
import { normalizeUnifiedPhysicsField } from './physics-field-normalization';

export interface BuildUnifiedPhysicsFieldInput {
  executionOverlayFrames: ExecutionOverlayFrame[];
  /** Frames omit calendar date — supply slot→day mapping (see {@link buildLegDateIndexFromPlan}). */
  legDateByLegId: Record<string, string>;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * Hard blocked domains mirrored from execution overlay builder — **must not** read fused `finalExecutionState`
 * so physics stays independent of narrative outcome labels (P-Next 3).
 */
function executionDomainsIndicateHardBlocked(frame: ExecutionOverlayFrame): boolean {
  if (frame.road.blocked || frame.route.executionState === 'BLOCKED') {
    return true;
  }
  const fuel = frame.fuel;
  if (fuel?.severity === 'CRITICAL' && fuel.safeBeforeNextFuel === false) {
    return true;
  }
  if (frame.weather.severity === 'BLOCKED') {
    return true;
  }
  return false;
}

function weatherExposureScore(severity: ExecutionOverlayFrame['weather']['severity']): number {
  switch (severity) {
    case 'LOW':
      return 0.12;
    case 'MEDIUM':
      return 0.42;
    case 'HIGH':
      return 0.72;
    case 'BLOCKED':
      return 1;
    default:
      return 0.2;
  }
}

function mobilityFromFrame(frame: ExecutionOverlayFrame): number {
  const r = frame.route.executionReliability;
  if (frame.road.blocked) {
    return 0;
  }
  let m = clamp01(r);
  if (frame.road.fRoadConstraint) {
    m *= 0.88;
  }
  if (frame.route.roadAccessibility?.seasonalClosureRisk != null) {
    m *= 1 - 0.35 * clamp01(frame.route.roadAccessibility.seasonalClosureRisk);
  }
  return clamp01(m);
}

function exposureFromFrame(frame: ExecutionOverlayFrame): number {
  const wx = weatherExposureScore(frame.weather.severity);
  const daylightFactor = frame.temporal.daylightViolation ? 1.22 : 1;
  const dfStress = Math.min(0.35, Math.max(0, frame.weather.delayFactor - 1) * 0.45);
  return clamp01(wx * daylightFactor + dfStress);
}

function energyFromFrame(frame: ExecutionOverlayFrame): number {
  const fuel = frame.fuel;
  if (!fuel || fuel.effectiveRangeKm <= 0) {
    return 1;
  }
  return clamp01(fuel.remainingRangeKm / fuel.effectiveRangeKm);
}

function temporalPressureFromFrame(frame: ExecutionOverlayFrame): number {
  const drift = Math.abs(frame.temporal.driftMinutes) + frame.temporal.crossDayRisk * 45;
  const unified = frame.unifiedDelayMinutes;
  const raw = Math.max(drift, unified * 0.65);
  return clamp01(raw / 180);
}

export function computeSeverity(
  mobility: number,
  exposure: number,
  energy: number,
): UnifiedPhysicsSeverity {
  const stress = Math.max(exposure, 1 - mobility, 1 - energy);
  if (stress >= 0.82 || energy < 0.12) {
    return 'CRITICAL';
  }
  if (stress >= 0.58 || energy < 0.28) {
    return 'HIGH';
  }
  if (stress >= 0.38 || energy < 0.45) {
    return 'MEDIUM';
  }
  return 'LOW';
}

export function deriveUnifiedState(
  blocked: boolean,
  mobility: number,
  exposure: number,
  energy: number,
  temporalPressure: number,
  finalBlocked: boolean,
): UnifiedPhysicsDerivedState {
  if (blocked || finalBlocked) {
    return 'IMPASSABLE';
  }
  if (mobility < 0.42 || exposure > 0.78 || energy < 0.22 || temporalPressure > 0.82) {
    return 'UNSTABLE';
  }
  if (mobility < 0.62 || exposure > 0.52 || energy < 0.38 || temporalPressure > 0.55) {
    return 'DEGRADED';
  }
  return 'STABLE';
}

function blockedFromScalars(mobility: number, exposure: number, energy: number): boolean {
  return mobility < 0.3 || energy < 0.15 || exposure > 0.8;
}

/**
 * Compiles overlay frames into a single physics field per leg — overlay remains upstream raw fusion.
 */
export function buildUnifiedPhysicsField(input: BuildUnifiedPhysicsFieldInput): UnifiedPhysicsField[] {
  return input.executionOverlayFrames.map(frame => {
    const date = input.legDateByLegId[frame.legId] ?? '';

    const mobility = mobilityFromFrame(frame);
    const exposure = exposureFromFrame(frame);
    const energy = energyFromFrame(frame);
    const temporalPressure = temporalPressureFromFrame(frame);

    const blocked =
      blockedFromScalars(mobility, exposure, energy) || executionDomainsIndicateHardBlocked(frame);

    const severity = computeSeverity(mobility, exposure, energy);
    const derived = deriveUnifiedState(
      blockedFromScalars(mobility, exposure, energy),
      mobility,
      exposure,
      energy,
      temporalPressure,
      executionDomainsIndicateHardBlocked(frame),
    );

    const raw: UnifiedPhysicsField = {
      legId: frame.legId,
      date,
      stateVector: {
        mobility,
        exposure,
        energy,
        temporalPressure,
      },
      constraints: {
        blocked,
        severity,
      },
      derived,
    };
    return normalizeUnifiedPhysicsField(raw);
  });
}

/** P-Next 1.1 — slot/leg id index for Neptune-style keyed lookup (non-invasive parallel to overlay). */
export function buildUnifiedPhysicsFieldByLegId(
  plan: TripPlan,
  frames: ExecutionOverlayFrame[],
): Partial<Record<string, UnifiedPhysicsField>> {
  const legDates = buildLegDateIndexFromPlan(plan);
  const rows = buildUnifiedPhysicsField({
    executionOverlayFrames: frames,
    legDateByLegId: legDates,
  });
  const out: Partial<Record<string, UnifiedPhysicsField>> = {};
  for (const r of rows) {
    out[r.legId] = r;
  }
  return out;
}

/** Slot id → calendar date for legs that carry inbound travel. */
export function buildLegDateIndexFromPlan(plan: TripPlan): Record<string, string> {
  const m: Record<string, string> = {};
  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      if (slot.travelLegFromPrev) {
        m[slot.id] = day.date;
      }
    }
  }
  return m;
}
