/**
 * Prod Canary Road A/B/C Pre-Signoff Drill — locked identifiers.
 * Independent from Weather Formal Soak canary trip.
 */

/** Weather soak trip — DO NOT use for Road drill. */
export const WEATHER_CANARY_TRIP_ID = 'a0a99999-9999-4999-8999-999999999999';
export const WEATHER_CANARY_USER_ID = 'a0a99999-9999-4999-8999-999999999901';

/** Independent internal Road Canary Trip (tripnara_prod). */
export const ROAD_CANARY_TRIP_ID = 'b0b88888-8888-4888-8888-888888888888';
export const ROAD_CANARY_USER_ID = 'b0b88888-8888-4888-8888-888888888801';

export const ROAD_CANARY_DAY1_ID = 'b0b88888-8888-4888-8888-888888888601';
export const ROAD_CANARY_DAY2_ID = 'b0b88888-8888-4888-8888-888888888602';
export const ROAD_CANARY_DRIVE_ITEM_ID = 'b0b88888-8888-4888-8888-888888888631';
export const ROAD_CANARY_ACTIVITY_ITEM_ID = 'b0b88888-8888-4888-8888-888888888632';

export const ROAD_CANARY_PLACE_DRIVE_ID = 99011;
export const ROAD_CANARY_PLACE_ACTIVITY_ID = 99012;

export const ROAD_CANARY_INITIAL_PLAN_ID = 'plan_1';
export const ROAD_CANARY_INITIAL_SNAPSHOT_REF = 'snap_road_canary_baseline';

export const ROAD_REPLAY_LIVE_SOURCE = 'REAL-SHAPE-ROAD-REPLAY-F208-CLOSED';
export const DEFAULT_CLOSED_FIXTURE = 'scripts/fixtures/gagnaveita-f208-closed-real-shape.json';

export const EVIDENCE_LABEL = 'ROAD_PROD_CANARY_PRE_SIGNOFF_ENGINEERING_EVIDENCE';
export const DRILL_STATUS = 'Road A/B/C Engineering Drill';
export const GO_STATUS = 'Road Production Canary GO: PENDING WEATHER SOAK SIGN-OFF';

export const EVIDENCE_DIR = 'internal-docs/operations/evidence';
