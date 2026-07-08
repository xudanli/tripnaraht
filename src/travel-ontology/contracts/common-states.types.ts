/**
 * Travel Ontology — 通用状态枚举（v1）
 *
 * SSOT: internal-docs/product/travel-ontology-world-model-v1.md §5.3
 */

/** 道路状态 */
export type RoadStatus =
  | 'OPEN'
  | 'OPEN_WITH_CAUTION'
  | 'DIFFICULT'
  | 'IMPASSABLE'
  | 'CLOSED'
  | 'SEASONALLY_CLOSED'
  | 'UNKNOWN';

/** 预约状态 */
export type BookingStatus =
  | 'UNCONFIRMED'
  | 'HELD'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED';

/** 计划项状态 */
export type PlanItemStatus =
  | 'PLANNED'
  | 'BOOKED'
  | 'READY'
  | 'AT_RISK'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'SKIPPED';

/** 证据状态 */
export type EvidenceStatus =
  | 'VERIFIED'
  | 'UNVERIFIED'
  | 'CONFLICTING'
  | 'STALE'
  | 'EXPIRED';

/** 决策状态 */
export type DecisionStatus =
  | 'OPEN'
  | 'AWAITING_USER'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTING'
  | 'EXECUTED'
  | 'FAILED'
  | 'ROLLED_BACK';

/** 入境资格状态 */
export type EntryEligibilityStatus =
  | 'ELIGIBLE'
  | 'NEEDS_ACTION'
  | 'BLOCKED'
  | 'UNKNOWN';

/** 车辆驱动形式 */
export type VehicleDrivetrain = '2WD' | 'AWD' | '4WD';

/** 事实新鲜度 */
export type FactFreshness = 'LIVE' | 'FRESH' | 'STALE' | 'EXPIRED';

/** 事实验证状态 */
export type FactVerificationStatus =
  | 'VERIFIED'
  | 'UNVERIFIED'
  | 'CONFLICTING'
  | 'INFERRED';
