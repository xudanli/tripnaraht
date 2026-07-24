export const CONSTRAINT_IDS = {
  // terrain.* (entityRef: DAY unless otherwise stated)
  TERRAIN_MAX_DAILY_ASCENT_M: 'terrain.max_daily_ascent_m',
  TERRAIN_MAX_SLOPE_PCT: 'terrain.max_slope_pct',
  TERRAIN_F_ROAD_COMPATIBILITY: 'terrain.f_road_compatibility',

  // time_space.* (entityRef: SEGMENT / DAY)
  TIME_SPACE_ETA_FEASIBILITY: 'time_space.eta_feasibility',
  TIME_SPACE_MAX_DRIVING_HOURS: 'time_space.max_driving_hours',
  TIME_SPACE_MIN_TRANSFER_BUFFER: 'time_space.min_transfer_buffer',

  // entity.* (entityRef: POI)
  ENTITY_OPENING_HOURS_OVERLAP: 'entity.opening_hours_overlap',
  ENTITY_MANDATORY_RESERVATION: 'entity.mandatory_reservation',
  ENTITY_SEASONAL_CLOSURE: 'entity.seasonal_closure',
  /** POI Access & Capacity Engine — 准入/关闭/售罄/车型 */
  ENTITY_ACCESS_BLOCKED: 'entity.access_blocked',
  ENTITY_PARKING_RESERVATION_MISSING: 'entity.parking_reservation_missing',
  ENTITY_INVENTORY_SOLD_OUT: 'entity.inventory_sold_out',
  ENTITY_VEHICLE_INCOMPATIBLE: 'entity.vehicle_incompatible',
  ENTITY_ACCESS_STATUS_STALE: 'entity.access_status_stale',
  ENTITY_PARKING_WAIT_HIGH: 'entity.parking_wait_high',

  // environment.* (entityRef: SEGMENT | DAY)
  ENVIRONMENT_WIND_SPEED_LIMIT: 'environment.wind_speed_limit',
  ENVIRONMENT_VISIBILITY_SUNSET_BUFFER: 'environment.visibility_sunset_buffer',
  ENVIRONMENT_EXTREME_WEATHER_CLOSURE: 'environment.extreme_weather_closure',

  /** insurance.* — 租车财务/条款缺口（verify 建议性；非阻断） */
  INSURANCE_RENTAL_GRAVEL_PROTECTION: 'insurance.rental.gravel_protection',
  INSURANCE_RENTAL_SAND_ASH_PROTECTION: 'insurance.rental.sand_ash_protection',
  INSURANCE_RENTAL_EXCESS_TIER: 'insurance.rental.excess_tier',
} as const;

export type ConstraintId = (typeof CONSTRAINT_IDS)[keyof typeof CONSTRAINT_IDS];

export function isConstraintId(v: unknown): v is ConstraintId {
  return Object.values(CONSTRAINT_IDS).includes(v as any);
}

