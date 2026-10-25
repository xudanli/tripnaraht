/**
 * Travel Ontology — 通用状态枚举（v1）
 *
 * SSOT: internal-docs/product/travel-ontology-world-model-v1.md §5.3
 *
 * 码值数组与 type 同源：Admin ontology catalog 必须引用这些 const，禁止平行硬编码枚举列表。
 */

/** 道路状态 */
export const ROAD_STATUS_VALUES = [
  'OPEN',
  'OPEN_WITH_CAUTION',
  'DIFFICULT',
  'IMPASSABLE',
  'CLOSED',
  'SEASONALLY_CLOSED',
  'UNKNOWN',
] as const;
export type RoadStatus = (typeof ROAD_STATUS_VALUES)[number];

/** 预约状态 */
export const BOOKING_STATUS_VALUES = [
  'UNCONFIRMED',
  'HELD',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type BookingStatus = (typeof BOOKING_STATUS_VALUES)[number];

/** 计划项状态 */
export const PLAN_ITEM_STATUS_VALUES = [
  'PLANNED',
  'BOOKED',
  'READY',
  'AT_RISK',
  'BLOCKED',
  'COMPLETED',
  'SKIPPED',
] as const;
export type PlanItemStatus = (typeof PLAN_ITEM_STATUS_VALUES)[number];

/** 证据状态 */
export const EVIDENCE_STATUS_VALUES = [
  'VERIFIED',
  'UNVERIFIED',
  'CONFLICTING',
  'STALE',
  'EXPIRED',
] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUS_VALUES)[number];

/** 决策状态 */
export const DECISION_STATUS_VALUES = [
  'OPEN',
  'AWAITING_USER',
  'APPROVED',
  'REJECTED',
  'EXECUTING',
  'EXECUTED',
  'FAILED',
  'ROLLED_BACK',
] as const;
export type DecisionStatus = (typeof DECISION_STATUS_VALUES)[number];

/** 入境资格状态 */
export const ENTRY_ELIGIBILITY_STATUS_VALUES = [
  'ELIGIBLE',
  'NEEDS_ACTION',
  'BLOCKED',
  'UNKNOWN',
] as const;
export type EntryEligibilityStatus = (typeof ENTRY_ELIGIBILITY_STATUS_VALUES)[number];

/** 车辆驱动形式 */
export const VEHICLE_DRIVETRAIN_VALUES = ['2WD', 'AWD', '4WD'] as const;
export type VehicleDrivetrain = (typeof VEHICLE_DRIVETRAIN_VALUES)[number];

/** 事实新鲜度 */
export const FACT_FRESHNESS_VALUES = ['LIVE', 'FRESH', 'STALE', 'EXPIRED'] as const;
export type FactFreshness = (typeof FACT_FRESHNESS_VALUES)[number];

/** 事实验证状态 */
export const FACT_VERIFICATION_STATUS_VALUES = [
  'VERIFIED',
  'UNVERIFIED',
  'CONFLICTING',
  'INFERRED',
] as const;
export type FactVerificationStatus = (typeof FACT_VERIFICATION_STATUS_VALUES)[number];

/** 签证要求（EntryRule.visaRequirement） */
export const VISA_REQUIREMENT_VALUES = [
  'NONE',
  'VISA_REQUIRED',
  'ETIAS',
  'UNKNOWN',
] as const;
export type VisaRequirement = (typeof VISA_REQUIREMENT_VALUES)[number];

/** 疲劳状态（Driver.fatigueState） */
export const FATIGUE_STATE_VALUES = ['RESTED', 'TIRED', 'UNKNOWN'] as const;
export type FatigueState = (typeof FATIGUE_STATE_VALUES)[number];

/** 天气预警等级 */
export const WEATHER_WARNING_LEVEL_VALUES = ['NONE', 'YELLOW', 'ORANGE', 'RED'] as const;
export type WeatherWarningLevel = (typeof WEATHER_WARNING_LEVEL_VALUES)[number];

/** 灾害严重程度 */
export const HAZARD_SEVERITY_VALUES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type HazardSeverity = (typeof HAZARD_SEVERITY_VALUES)[number];
