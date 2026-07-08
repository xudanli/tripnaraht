/**
 * Plan-based objective evaluators for registry v1.
 */

import type { TripPlan } from '../../../trips/decision/plan-model';
import type {
  CanonicalObjectiveId,
  ObjectiveEvaluation,
  ObjectiveSemantics,
} from '../../contracts/objective-definition';

function parseTimeMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function evaluatePlanObjectives(input: {
  plan: TripPlan;
  utilityHint?: number;
  enabledObjectives: CanonicalObjectiveId[];
  registry: ObjectiveSemantics[];
}): ObjectiveEvaluation[] {
  const metrics = computePlanMetrics(input.plan, input.utilityHint);
  return input.enabledObjectives
    .map((id) => {
      const semantics = input.registry.find((o) => o.objectiveId === id);
      if (!semantics) return null;
      const rawValue = metrics.values[id] ?? 0;
      const normalizedValue = normalize(rawValue, semantics);
      return {
        objectiveId: id,
        formulaVersion: semantics.formulaVersion,
        rawValue,
        normalizedValue,
        direction: semantics.direction,
        missingData: metrics.missing.has(id),
      } satisfies ObjectiveEvaluation;
    })
    .filter((x): x is ObjectiveEvaluation => x != null);
}

function computePlanMetrics(
  plan: TripPlan,
  utilityHint?: number,
): { missing: Set<CanonicalObjectiveId>; values: Partial<Record<CanonicalObjectiveId, number>> } {
  const missing = new Set<CanonicalObjectiveId>();
  let totalDrive = 0;
  let totalTravel = 0;
  let maxDriveDay = 0;
  let maxActiveDay = 0;
  let minBufferDay = Number.POSITIVE_INFINITY;
  let slotsWithEnd = 0;
  let slotsTotal = 0;
  let anchorSlots = 0;
  let anchorWithPoi = 0;

  for (const day of plan.days ?? []) {
    let dayDrive = 0;
    let dayActive = 0;
    const slots = day.timeSlots ?? [];
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      slotsTotal++;
      if (slot.endTime) slotsWithEnd++;

      const drive = slot.travelLegFromPrev?.durationMin ?? 0;
      dayDrive += drive;
      totalTravel += drive;

      const start = parseTimeMinutes(slot.time);
      const end = slot.endTime ? parseTimeMinutes(slot.endTime) : start + 90;
      dayActive += Math.max(0, end - start);

      if (slot.priorityTag === 'anchor' || slot.priorityTag === 'core') {
        anchorSlots++;
        if (slot.poiId) anchorWithPoi++;
      }

      if (i > 0) {
        const prev = slots[i - 1];
        const prevEnd = prev.endTime
          ? parseTimeMinutes(prev.endTime)
          : parseTimeMinutes(prev.time) + 90;
        const buffer = start - prevEnd;
        if (Number.isFinite(minBufferDay)) {
          minBufferDay = Math.min(minBufferDay, buffer);
        }
      }
    }
    totalDrive += dayDrive;
    maxDriveDay = Math.max(maxDriveDay, dayDrive);
    maxActiveDay = Math.max(maxActiveDay, dayActive);
  }

  if (!Number.isFinite(minBufferDay)) {
    minBufferDay = 0;
    missing.add('buffer_time');
  }

  const timeWindowSat = slotsTotal > 0 ? slotsWithEnd / slotsTotal : 0;
  if (slotsTotal === 0) missing.add('time_window_satisfaction');

  const poiCompletion =
    anchorSlots > 0 ? anchorWithPoi / anchorSlots : slotsTotal > 0 ? 1 : 0;

  const interest = utilityHint ?? 0.5;
  if (utilityHint == null) missing.add('interest_match');

  return {
    missing,
    values: {
      daily_driving_load: maxDriveDay,
      daily_physical_load: maxActiveDay,
      time_window_satisfaction: timeWindowSat,
      buffer_time: Math.max(0, minBufferDay),
      must_visit_poi_completion: poiCompletion,
      interest_match: interest,
      min_member_utility: interest,
      total_travel_time: totalTravel,
      budget_deviation: 0,
    },
  };
}

function normalize(value: number, semantics: ObjectiveSemantics): number {
  const [min, max] = semantics.outputRange;
  if (max <= min) return value;
  const clamped = Math.max(min, Math.min(max, value));
  const ratio = (clamped - min) / (max - min);
  return semantics.direction === 'MINIMIZE' ? 1 - ratio : ratio;
}
