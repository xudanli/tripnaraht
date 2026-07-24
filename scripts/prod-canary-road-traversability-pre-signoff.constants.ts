/**
 * Prod Canary Road Traversability T2 Pre-Signoff Drill — locked identifiers.
 * Reuses independent Road Canary Trip; LIMITED fixture only (not CLOSED).
 */

export {
  WEATHER_CANARY_TRIP_ID,
  WEATHER_CANARY_USER_ID,
  ROAD_CANARY_TRIP_ID,
  ROAD_CANARY_USER_ID,
  ROAD_CANARY_DAY1_ID,
  ROAD_CANARY_DAY2_ID,
  ROAD_CANARY_DRIVE_ITEM_ID,
  ROAD_CANARY_ACTIVITY_ITEM_ID,
  ROAD_CANARY_PLACE_DRIVE_ID,
  ROAD_CANARY_PLACE_ACTIVITY_ID,
  ROAD_CANARY_INITIAL_PLAN_ID,
  ROAD_CANARY_INITIAL_SNAPSHOT_REF,
  EVIDENCE_DIR,
} from './prod-canary-road-pre-signoff.constants';

export const ROAD_TRAVERSABILITY_REPLAY_LIVE_SOURCE =
  'REAL-SHAPE-ROAD-REPLAY-F208-LIMITED';

export const DEFAULT_LIMITED_FIXTURE =
  'scripts/fixtures/gagnaveita-f208-real-shape.json';

export const TRAVERSABILITY_EVIDENCE_LABEL =
  'ROAD_TRAVERSABILITY_ENGINEERING_EVIDENCE';

export const TRAVERSABILITY_DRILL_STATUS =
  'Road Traversability T2 Engineering Drill';

export const TRAVERSABILITY_GO_STATUS =
  'Road Production Canary GO: PENDING TRAVERSABILITY T1 + WEATHER SOAK';

/** RT-F208 scenario ids (SLICE-2 §11). */
export const RT_F208_SCENARIOS = [
  'RT-F208-001',
  'RT-F208-002',
  'RT-F208-003',
  'RT-F208-004',
  'RT-F208-005',
] as const;

export type VehicleProfileId = '2WD' | '4WD';

export const VEHICLE_PROFILES: Record<
  VehicleProfileId,
  {
    scenarioId: string;
    driveType: '2WD' | '4WD';
    vehicleClass: string;
    riverCrossingAllowed: boolean;
    gravelRoadExperience?: boolean;
  }
> = {
  '2WD': {
    scenarioId: 'RT-F208-001',
    driveType: '2WD',
    vehicleClass: 'COMPACT',
    riverCrossingAllowed: false,
    gravelRoadExperience: false,
  },
  '4WD': {
    scenarioId: 'RT-F208-002',
    driveType: '4WD',
    vehicleClass: 'LARGE_4X4',
    riverCrossingAllowed: true,
    gravelRoadExperience: true,
  },
};
