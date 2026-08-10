/**
 * Vehicle × Road fit — five dimensions:
 * road type × live status × vehicle × rental × weather/season.
 */

import type { SourceReference } from '../iceland-knowledge.types';
import { loadIcelandVehicleRoadMatrix } from './iceland-road-weather.loader';
import type {
  IcelandVehicleRoadMatrix,
  VehicleRoadFitAssessment,
  VehicleRoadFitGate,
  VehicleRoadFitInput,
  VehicleRoadFitStatus,
} from './iceland-road-weather.types';

const MATRIX_EVIDENCE: SourceReference = {
  kind: 'PACK_FILE',
  path: 'knowledge/vehicle-road-fit/is-vehicle-road-matrix.json',
  version: '1.0.0',
};

const RENTAL_EVIDENCE: SourceReference = {
  kind: 'PACK_FILE',
  path: 'rules/is-rental-rules.json',
  version: '1.0.0',
};

const ROAD_RULES_EVIDENCE: SourceReference = {
  kind: 'PACK_FILE',
  path: 'rules/is-road-rules.json',
  version: '1.0.0',
};

function findCell(
  matrix: IcelandVehicleRoadMatrix,
  input: VehicleRoadFitInput,
) {
  return matrix.cells.find(
    (c) =>
      c.roadBaseType === input.roadBaseType &&
      c.vehicleClass === input.vehicleClass,
  );
}

function escalateGate(
  a: VehicleRoadFitGate,
  b: VehicleRoadFitGate,
): VehicleRoadFitGate {
  const rank: Record<VehicleRoadFitGate, number> = {
    ALLOW: 0,
    NEED_CONFIRM: 1,
    SUGGEST_REPLACE: 2,
    REJECT: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

function gateToStatus(gate: VehicleRoadFitGate): VehicleRoadFitStatus {
  if (gate === 'ALLOW') return 'COMPATIBLE';
  if (gate === 'REJECT') return 'INCOMPATIBLE';
  return 'CONDITIONAL';
}

export function assessVehicleRoadFit(
  input: VehicleRoadFitInput,
  matrix: IcelandVehicleRoadMatrix = loadIcelandVehicleRoadMatrix(),
): VehicleRoadFitAssessment {
  const reasons: string[] = [];
  const violatedRules: string[] = [];
  const conditionsToProceed: string[] = [];
  const evidence: SourceReference[] = [MATRIX_EVIDENCE];

  // Official CLOSED always wins
  if (input.roadStatus === 'CLOSED') {
    evidence.push(ROAD_RULES_EVIDENCE);
    return {
      vehicleClass: input.vehicleClass,
      roadSegmentId: input.roadSegmentId,
      roadBaseType: input.roadBaseType,
      roadStatus: input.roadStatus,
      status: 'INCOMPATIBLE',
      gate: 'REJECT',
      reasons: ['OFFICIAL_ROAD_CLOSED'],
      violatedRules: ['IS_ROAD_CLOSED_BLOCK'],
      conditionsToProceed: [],
      evidence,
      confidence: 0.95,
    };
  }

  const cell = findCell(matrix, input);
  if (!cell) {
    return {
      vehicleClass: input.vehicleClass,
      roadSegmentId: input.roadSegmentId,
      roadBaseType: input.roadBaseType,
      roadStatus: input.roadStatus,
      status: 'UNKNOWN',
      gate: 'NEED_CONFIRM',
      reasons: ['MATRIX_CELL_MISSING'],
      violatedRules: [],
      conditionsToProceed: ['PROVIDE_VEHICLE_AND_ROAD_CLASS'],
      evidence,
      confidence: 0.4,
    };
  }

  let gate = cell.baseGate;
  let status = cell.baseStatus;
  reasons.push(`MATRIX_${cell.roadBaseType}_${cell.vehicleClass}`);
  if (cell.notes) reasons.push(cell.notes);

  if (input.roadStatus === 'LIMITED') {
    evidence.push(ROAD_RULES_EVIDENCE);
    gate = escalateGate(gate, 'NEED_CONFIRM');
    status = gateToStatus(gate);
    reasons.push('ROAD_STATUS_LIMITED');
    conditionsToProceed.push('CONFIRM_LIMITED_ROAD_ACCEPTABLE');
  }

  if (input.roadStatus === 'UNKNOWN') {
    gate = escalateGate(gate, 'NEED_CONFIRM');
    status = 'UNKNOWN';
    reasons.push('ROAD_STATUS_UNKNOWN');
    conditionsToProceed.push('VERIFY_LIVE_ROAD_STATUS');
  }

  // Rental contract
  const rental = input.rentalRestrictions ?? [];
  if (
    rental.includes('NO_F_ROAD') &&
    (input.roadBaseType === 'F_ROAD' || input.roadBaseType === 'FORD')
  ) {
    evidence.push(RENTAL_EVIDENCE);
    gate = 'REJECT';
    status = 'INCOMPATIBLE';
    violatedRules.push('IS_RENTAL_NO_F_ROAD');
    reasons.push('RENTAL_CONTRACT_NO_F_ROAD');
  }

  // Ford crossing flag on otherwise allowed F-road
  if (input.hasFordCrossing && input.roadBaseType === 'F_ROAD') {
    if (input.vehicleClass === 'SUV_4WD') {
      gate = escalateGate(gate, 'NEED_CONFIRM');
      status = 'CONDITIONAL';
      reasons.push('FORD_CROSSING_PRESENT');
      conditionsToProceed.push('CONFIRM_FORD_DEPTH_AND_EXPERIENCE');
    } else if (gate !== 'REJECT') {
      gate = 'REJECT';
      status = 'INCOMPATIBLE';
      reasons.push('FORD_NOT_ALLOWED_FOR_VEHICLE');
    }
  }

  // Season closed highlands
  if (
    input.roadBaseType === 'F_ROAD' &&
    input.seasonOpen === false &&
    gate !== 'REJECT'
  ) {
    gate = 'REJECT';
    status = 'INCOMPATIBLE';
    reasons.push('HIGHLAND_SEASON_CLOSED');
    violatedRules.push('SEASONAL_F_ROAD_CLOSED');
  }

  // Weather / wind on exposed
  if (
    (input.roadBaseType === 'WIND_EXPOSED' || input.windExposure === 'HIGH') &&
    (input.weatherBand === 'severe' || input.weatherBand === 'extreme')
  ) {
    const highProfile =
      input.vehicleClass === 'CAMPERVAN' ||
      input.vehicleClass === 'EV_CAMPERVAN' ||
      input.vehicleClass === 'HIGH_PROFILE';
    if (highProfile) {
      gate = escalateGate(gate, 'SUGGEST_REPLACE');
      if (input.weatherBand === 'extreme') {
        gate = 'REJECT';
        status = 'INCOMPATIBLE';
        reasons.push('HIGH_PROFILE_EXTREME_WIND');
      } else {
        status = 'CONDITIONAL';
        reasons.push('HIGH_PROFILE_SEVERE_WIND');
        conditionsToProceed.push('DELAY_OR_REROUTE_EXPOSED_PASS');
      }
    } else {
      gate = escalateGate(gate, 'NEED_CONFIRM');
      status = 'CONDITIONAL';
      reasons.push('EXPOSED_ROAD_SEVERE_WEATHER');
      conditionsToProceed.push('CONFIRM_WIND_RISK_ACCEPTANCE');
    }
  }

  // 4WD F-road still needs experience when conditional
  if (
    input.roadBaseType === 'F_ROAD' &&
    input.vehicleClass === 'SUV_4WD' &&
    gate === 'NEED_CONFIRM'
  ) {
    if (input.driverExperience === 'NONE' || input.driverExperience === 'BASIC') {
      conditionsToProceed.push('CONFIRM_F_ROAD_DRIVING_EXPERIENCE');
    }
    if (input.seasonOpen !== true) {
      conditionsToProceed.push('CONFIRM_HIGHLAND_OPEN_STATUS');
    }
    conditionsToProceed.push('CONFIRM_RENTAL_ALLOWS_F_ROAD');
  }

  return {
    vehicleClass: input.vehicleClass,
    roadSegmentId: input.roadSegmentId,
    roadBaseType: input.roadBaseType,
    roadStatus: input.roadStatus,
    status,
    gate,
    reasons,
    violatedRules,
    conditionsToProceed: [...new Set(conditionsToProceed)],
    evidence,
    confidence: status === 'UNKNOWN' ? 0.5 : 0.85,
  };
}

/** Map legacy terrain scenario helper onto VehicleRoadFit when useful. */
export function mapTerrainScenarioToRoadBaseType(
  scenario: 'F_ROAD_WET_GRAVEL' | 'HIGH_CROSSWIND_PASS' | 'GENERAL_PAVED_CORRIDOR',
): VehicleRoadFitInput['roadBaseType'] {
  if (scenario === 'F_ROAD_WET_GRAVEL') return 'F_ROAD';
  if (scenario === 'HIGH_CROSSWIND_PASS') return 'WIND_EXPOSED';
  return 'PAVED';
}
