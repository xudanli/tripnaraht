/**
 * RawVisualObservation — extraction layer only (no trip decisions).
 */

import type { ObservationIntent } from '../observation.types';

export type RawVisualSceneType =
  | 'VEHICLE'
  | 'ROAD_ENTRY'
  | 'ROAD_SIGN'
  | 'ACTIVITY_ENTRY'
  | 'PARKING_SIGN'
  | 'RENTAL_HANDOVER'
  | 'UNKNOWN';

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RawVisualObservation {
  sceneType: RawVisualSceneType;
  detectedObjects: Array<{
    type: string;
    subtype?: string;
    confidence: number;
    boundingBox?: BoundingBox;
  }>;
  recognizedText: Array<{
    text: string;
    confidence: number;
    boundingBox?: BoundingBox;
  }>;
  extractedFacts: Array<{
    key: string;
    value: unknown;
    confidence: number;
  }>;
  uncertainties: string[];
  requiredAdditionalViews: string[];
}

export interface ObservationModelInput {
  images: Array<{ mediaRef: string }>;
  intent: ObservationIntent;
  userQuestion?: string;
  /** Soft priors only — never treat as ground truth */
  hints: {
    expectedRoadId?: string;
    expectedVehicleType?: string;
    expectedOperatorName?: string;
  };
  /**
   * S2 test / offline seed: concatenated OCR text without calling cloud OCR.
   * Production providers ignore this and read image bytes.
   */
  ocrTextSeed?: string;
}

/** Pre-ontology fact keys emitted by extractors before Semantic Key map */
export const PRE_ONTOLOGY_KEYS = {
  ROAD_ID: 'road.id',
  ROAD_CLOSED_SIGN: 'road.closed_sign',
  ROAD_FROAD_SIGN: 'road.froad_sign',
  ROAD_GRAVEL: 'road.gravel_surface',
  ROAD_WATER: 'road.water_crossing',
  VEHICLE_MODEL: 'vehicle.model',
  VEHICLE_CLASS: 'vehicle.class',
  VEHICLE_DRIVETRAIN: 'vehicle.drivetrain',
  ACTIVITY_OPERATOR: 'activity.operator_name',
  ACTIVITY_ENTRY: 'activity.entry_detected',
  PARKING_SIGN: 'parking.sign',
  PARKING_NO_PARKING: 'parking.no_parking',
  PARKING_PAID: 'parking.paid_zone',
  PARKING_TIME_LIMIT: 'parking.time_limit',
  PARKING_RESIDENT_ONLY: 'parking.resident_only',
  PARKING_INCOMPLETE: 'parking.rule_incomplete',
  RENTAL_HANDOVER_TYPE: 'rental.handover_type',
  RENTAL_DAMAGE: 'rental.damage_suspected',
  RENTAL_MILEAGE: 'rental.mileage',
  RENTAL_FUEL: 'rental.fuel_level',
  RENTAL_PLATE: 'rental.plate',
  RENTAL_VIEWS_INCOMPLETE: 'rental.views_incomplete',
} as const;

export const CONFIDENCE_THRESHOLDS = {
  ROAD_ID: 0.75,
  VEHICLE_MODEL: 0.7,
  VEHICLE_DRIVETRAIN: 0.85,
  ACTIVITY_OPERATOR: 0.7,
  PARKING_SIGN: 0.7,
  GENERIC_OBJECT: 0.6,
} as const;
