/**
 * Travel Ontology — TravelWorldFact 契约（v1）
 *
 * SSOT: internal-docs/product/travel-ontology-world-model-v1.md §6
 * Snapshot 投影: src/travel-context/domain/travel-context.types.ts — WorldFact
 */

export type { FactFreshness, FactVerificationStatus } from './common-states.types';

import type { FactFreshness, FactVerificationStatus } from './common-states.types';

export const TRAVEL_WORLD_FACT_SCHEMA_ID = 'tripnara.travel_world_fact@v1';

/** 事实权威层级 */
export type FactAuthorityLevel =
  | 'GOVERNMENT'
  | 'OFFICIAL_OPERATOR'
  | 'SUPPLIER_CONTRACT'
  | 'USER_BOOKING'
  | 'USER_DECLARATION'
  | 'MODEL_INFERENCE'
  | 'THIRD_PARTY';

/** 事实作用域 */
export interface TravelWorldFactScope {
  country?: string;
  region?: string;
  geometry?: unknown;
  tripId?: string;
  travelerId?: string;
  bookingId?: string;
}

/** 事实来源 */
export interface TravelWorldFactSource {
  provider: string;
  evidenceId?: string;
  contractVersion?: string;
}

/**
 * 旅行世界统一事实结构。
 * subjectType + subjectId + predicate 构成三元组；value 为类型化载荷。
 */
export interface TravelWorldFact<T = unknown> {
  schemaId: typeof TRAVEL_WORLD_FACT_SCHEMA_ID;
  factId: string;

  subjectType: string;
  subjectId: string;

  predicate: string;
  value: T;

  scope: TravelWorldFactScope;

  authorityLevel: FactAuthorityLevel;

  source: TravelWorldFactSource;

  validFrom?: string;
  validTo?: string;

  observedAt: string;
  expiresAt?: string;

  confidence: number;

  freshness: FactFreshness;

  verificationStatus: FactVerificationStatus;

  /** 变化后是否触发决策重新评估 */
  replanTrigger?: boolean;
}

/** 常用 predicate 命名空间（可扩展，Destination Pack 追加） */
export const TRAVEL_WORLD_PREDICATES = {
  HAS_DRIVETRAIN: 'mobility.hasDrivetrain',
  PERMITTED_ROAD_CLASS: 'mobility.permittedRoadClass',
  PROHIBITED_ROAD_CLASS: 'mobility.prohibitedRoadClass',
  REQUIRED_VEHICLE_CAPABILITY: 'route.requiredVehicleCapability',
  CURRENT_ROAD_STATUS: 'route.currentRoadStatus',
  COVERS_DAMAGE_CAUSE: 'insurance.coversDamageCause',
  EXCLUDES_DAMAGE_CAUSE: 'insurance.excludesDamageCause',
  ENTRY_ELIGIBILITY: 'immigration.entryEligibility',
  VISA_REQUIRED: 'immigration.visaRequired',
  WEATHER_WARNING_LEVEL: 'weather.warningLevel',
  OPERATING_STATUS: 'activity.operatingStatus',
  CHECK_IN_WINDOW: 'accommodation.checkInWindow',
} as const;

export type TravelWorldPredicate =
  (typeof TRAVEL_WORLD_PREDICATES)[keyof typeof TRAVEL_WORLD_PREDICATES];
