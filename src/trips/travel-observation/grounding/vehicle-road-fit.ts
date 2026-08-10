import type { LookDrivetrain } from '../observation.types';
import type { VehicleRoadFitKind } from './grounding.types';

/**
 * Vehicle ↔ F-road fit using LookDrivetrain + plan flags.
 * Aligns with OFFICIAL_IS_FROAD_2WD / terrain semantics (S3 local).
 */
export function assessVehicleRoadFit(input: {
  detectedFroad: boolean;
  plannedRequiresFroad: boolean;
  drivetrain: LookDrivetrain;
  roadMatch: 'MATCHED' | 'UNMATCHED' | 'CONFLICT' | 'NO_GPS' | 'NO_ROAD_ID';
}): { fit: VehicleRoadFitKind; notes: string[] } {
  const notes: string[] = [];
  const needsFroad =
    input.detectedFroad ||
    (input.plannedRequiresFroad && input.roadMatch === 'MATCHED');

  if (!needsFroad) {
    return { fit: 'FIT', notes: ['No F-road requirement in grounded scene'] };
  }

  if (input.roadMatch === 'NO_GPS' || input.roadMatch === 'CONFLICT') {
    return {
      fit: 'UNKNOWN',
      notes: ['Cannot formalize vehicle-road fit without reliable road match'],
    };
  }

  if (input.drivetrain === 'UNKNOWN') {
    notes.push('Drivetrain unknown — vehicle-road fit uncertain');
    return { fit: 'UNKNOWN', notes };
  }

  if (input.drivetrain === '2WD') {
    notes.push('2WD vs F-road / highland requirement — MISMATCH');
    return { fit: 'MISMATCH', notes };
  }

  notes.push('4WD compatible with F-road requirement');
  return { fit: 'FIT', notes };
}
