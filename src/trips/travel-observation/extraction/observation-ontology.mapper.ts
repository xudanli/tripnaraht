import type { ObservationFact } from '../observation.types';
import { isFrozenSemanticKey } from '../semantic-keys';
import {
  CONFIDENCE_THRESHOLDS,
  PRE_ONTOLOGY_KEYS,
  type RawVisualObservation,
} from './raw-visual.types';

/**
 * Map pre-ontology extractedFacts → frozen Semantic Keys.
 * Unknown / below-threshold keys are dropped (logged by caller).
 */
export function mapRawVisualToObservationFacts(
  raw: RawVisualObservation,
): ObservationFact[] {
  const out: ObservationFact[] = [];

  for (const fact of raw.extractedFacts) {
    const mapped = mapOne(fact.key, fact.value, fact.confidence);
    if (!mapped) continue;
    if (!isFrozenSemanticKey(mapped.semanticKey)) continue;
    if (out.some((f) => f.semanticKey === mapped.semanticKey && f.value === mapped.value)) {
      continue;
    }
    out.push({
      semanticType: mapped.semanticType,
      semanticKey: mapped.semanticKey,
      value: mapped.value,
      confidence: fact.confidence,
      source: mapped.source,
    });
  }

  // Uncertainties → DATA_UNCERTAINTY keys
  if (raw.uncertainties.includes('ROAD_ID_NOT_READABLE')) {
    pushUncertainty(out, 'DATA_UNCERTAINTY.ROAD_ID_UNKNOWN');
  }
  if (
    raw.uncertainties.includes('VEHICLE_DRIVETRAIN_UNKNOWN') ||
    raw.uncertainties.includes('VEHICLE_DRIVETRAIN_LOW_CONFIDENCE')
  ) {
    pushUncertainty(out, 'DATA_UNCERTAINTY.VEHICLE_DRIVETRAIN_UNKNOWN');
  }
  if (raw.uncertainties.includes('PARKING_RULE_INCOMPLETE')) {
    pushUncertainty(out, 'DATA_UNCERTAINTY.PARKING_RULE_INCOMPLETE');
  }
  if (raw.uncertainties.includes('RENTAL_VIEWS_INCOMPLETE')) {
    pushUncertainty(out, 'DATA_UNCERTAINTY.RENTAL_VIEWS_INCOMPLETE');
  }

  return out;
}

function mapOne(
  key: string,
  value: unknown,
  confidence: number,
): {
  semanticType: string;
  semanticKey: string;
  value: unknown;
  source: ObservationFact['source'];
} | null {
  switch (key) {
    case PRE_ONTOLOGY_KEYS.ROAD_ID:
      if (confidence < CONFIDENCE_THRESHOLDS.ROAD_ID) return null;
      // P0 freeze has F-road sign key; non-F numeric ids stay pre-ontology only until S3
      if (typeof value === 'string' && /^F/i.test(value)) {
        return {
          semanticType: 'OBSERVATION',
          semanticKey: 'OBSERVATION.ROAD.FROAD_SIGN_DETECTED',
          value,
          source: 'OCR',
        };
      }
      return null;
    case PRE_ONTOLOGY_KEYS.ROAD_FROAD_SIGN:
      if (confidence < CONFIDENCE_THRESHOLDS.ROAD_ID) return null;
      return {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.ROAD.FROAD_SIGN_DETECTED',
        value,
        source: 'OCR',
      };
    case PRE_ONTOLOGY_KEYS.ROAD_CLOSED_SIGN:
      return {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.ROAD.CLOSED_SIGN_DETECTED',
        value,
        source: 'OCR',
      };
    case PRE_ONTOLOGY_KEYS.ROAD_GRAVEL:
      return {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.ROAD.GRAVEL_SURFACE_DETECTED',
        value,
        source: 'VISION',
      };
    case PRE_ONTOLOGY_KEYS.ROAD_WATER:
      return {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.ROAD.WATER_CROSSING_DETECTED',
        value,
        source: 'VISION',
      };
    case PRE_ONTOLOGY_KEYS.VEHICLE_MODEL:
      if (confidence < CONFIDENCE_THRESHOLDS.VEHICLE_MODEL) return null;
      return {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.VEHICLE.MODEL_DETECTED',
        value,
        source: 'OCR',
      };
    case PRE_ONTOLOGY_KEYS.VEHICLE_CLASS:
      return {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.VEHICLE.CLASS_DETECTED',
        value,
        source: 'VISION',
      };
    case PRE_ONTOLOGY_KEYS.VEHICLE_DRIVETRAIN:
      if (confidence < CONFIDENCE_THRESHOLDS.VEHICLE_DRIVETRAIN) {
        return {
          semanticType: 'DATA_UNCERTAINTY',
          semanticKey: 'DATA_UNCERTAINTY.VEHICLE_DRIVETRAIN_UNKNOWN',
          value: true,
          source: 'OCR',
        };
      }
      return {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.VEHICLE.DRIVETRAIN_DETECTED',
        value,
        source: 'OCR',
      };
    case PRE_ONTOLOGY_KEYS.ACTIVITY_OPERATOR:
      if (confidence < CONFIDENCE_THRESHOLDS.ACTIVITY_OPERATOR) return null;
      return {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.ACTIVITY.OPERATOR_SIGN_DETECTED',
        value,
        source: 'OCR',
      };
    case PRE_ONTOLOGY_KEYS.ACTIVITY_ENTRY:
      return {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.ACTIVITY.ENTRY_DETECTED',
        value,
        source: 'VISION',
      };
    case PRE_ONTOLOGY_KEYS.PARKING_SIGN:
      if (confidence < CONFIDENCE_THRESHOLDS.PARKING_SIGN) return null;
      return {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.PARKING.SIGN_DETECTED',
        value,
        source: 'OCR',
      };
    case PRE_ONTOLOGY_KEYS.PARKING_NO_PARKING:
      return {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.PARKING.NO_PARKING_DETECTED',
        value,
        source: 'OCR',
      };
    case PRE_ONTOLOGY_KEYS.PARKING_PAID:
      return {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.PARKING.PAID_ZONE_DETECTED',
        value,
        source: 'OCR',
      };
    case PRE_ONTOLOGY_KEYS.PARKING_TIME_LIMIT:
      return {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.PARKING.TIME_LIMIT_DETECTED',
        value,
        source: 'OCR',
      };
    case PRE_ONTOLOGY_KEYS.PARKING_RESIDENT_ONLY:
      return {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.PARKING.RESIDENT_ONLY_DETECTED',
        value,
        source: 'OCR',
      };
    case PRE_ONTOLOGY_KEYS.PARKING_INCOMPLETE:
      return {
        semanticType: 'DATA_UNCERTAINTY',
        semanticKey: 'DATA_UNCERTAINTY.PARKING_RULE_INCOMPLETE',
        value,
        source: 'OCR',
      };
    case PRE_ONTOLOGY_KEYS.RENTAL_HANDOVER_TYPE:
      return {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.RENTAL.HANDOVER_TYPE',
        value,
        source: 'ON_DEVICE',
      };
    case PRE_ONTOLOGY_KEYS.RENTAL_DAMAGE:
      return {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.RENTAL.DAMAGE_SUSPECTED',
        value,
        source: 'VISION',
      };
    case PRE_ONTOLOGY_KEYS.RENTAL_MILEAGE:
      return {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.RENTAL.MILEAGE_DETECTED',
        value,
        source: 'OCR',
      };
    case PRE_ONTOLOGY_KEYS.RENTAL_FUEL:
      return {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.RENTAL.FUEL_LEVEL_DETECTED',
        value,
        source: 'OCR',
      };
    case PRE_ONTOLOGY_KEYS.RENTAL_PLATE:
      return {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.RENTAL.PLATE_DETECTED',
        value,
        source: 'OCR',
      };
    case PRE_ONTOLOGY_KEYS.RENTAL_VIEWS_INCOMPLETE:
      return {
        semanticType: 'DATA_UNCERTAINTY',
        semanticKey: 'DATA_UNCERTAINTY.RENTAL_VIEWS_INCOMPLETE',
        value,
        source: 'ON_DEVICE',
      };
    default:
      return null;
  }
}

function pushUncertainty(out: ObservationFact[], key: string): void {
  if (!isFrozenSemanticKey(key)) return;
  if (out.some((f) => f.semanticKey === key)) return;
  out.push({
    semanticType: 'DATA_UNCERTAINTY',
    semanticKey: key,
    value: true,
    confidence: 1,
    source: 'ON_DEVICE',
  });
}
