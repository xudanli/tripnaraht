/**
 * POI Access & Capacity Engine — 冰岛 MVP 核心类型
 *
 * 三层数据：规则层 → 库存层 → 拥堵层
 * 输出三态结论：能不能去 / 现在去是否合适 / Plan B
 */

export type PoiAccessRuleType =
  | 'CLOSED'
  | 'SEASONAL_CLOSURE'
  | 'RESERVATION_REQUIRED'
  | 'PARKING_RESERVATION'
  | 'VEHICLE_RESTRICTION'
  | 'TIME_WINDOW'
  | 'CAPACITY_LIMIT'
  | 'TRAIL_RESTRICTION'
  | 'SAFETY_RESTRICTION';

export type PoiAccessTargetResource =
  | 'POI'
  | 'PARKING'
  | 'ROAD'
  | 'TRAIL'
  | 'ACTIVITY'
  | 'VIEWPOINT';

export type PoiAccessRuleStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING_CONFIRMATION';

export type PoiAccessConfidence = 'OFFICIAL' | 'PARTNER' | 'INFERRED';

/** HARD=约束求解器阻断；SOFT=可执行但需风险提示 */
export type PoiAccessEnforcement = 'HARD' | 'SOFT';

export interface PoiAccessRule {
  id: string;
  poiId: string;
  placeId?: number;

  ruleType: PoiAccessRuleType;
  targetResource: PoiAccessTargetResource;

  validFrom?: string;
  validTo?: string;
  dailyStartTime?: string;
  dailyEndTime?: string;

  quota?: number;
  reservationRequired?: boolean;
  applicableVehicleTypes?: string[];

  status: PoiAccessRuleStatus;
  sourceAuthority: string;
  sourceUrl?: string;
  sourceUpdatedAt?: string;
  lastVerifiedAt: string;

  confidence: PoiAccessConfidence;
  enforcement?: PoiAccessEnforcement;
  notes?: string;
}

/** 官方公告驱动的动态状态覆盖 */
export interface PoiAccessStatusOverride {
  id: string;
  poiId: string;
  placeId?: number;
  ruleType: PoiAccessRuleType;
  targetResource: PoiAccessTargetResource;
  enforcement?: PoiAccessEnforcement;
  effectiveFrom: string;
  effectiveTo?: string;
  status: 'ACTIVE' | 'INACTIVE';
  sourceAuthority: string;
  sourceUrl?: string;
  lastVerifiedAt: string;
  confidence: PoiAccessConfidence;
  notes?: string;
}

export type PoiCapacitySignalSource =
  | 'OFFICIAL'
  | 'PARKA'
  | 'BOKUN'
  | 'PARTNER'
  | 'MANUAL';

export interface PoiCapacitySnapshot {
  id?: string;
  poiId: string;
  placeId?: number;
  dateISO: string;
  slotStartTime?: string;
  slotEndTime?: string;
  remaining?: number;
  capacity?: number;
  soldOut: boolean;
  signalSource: PoiCapacitySignalSource;
  observedAt: string;
  confidenceScore?: number;
}

export type PoiCrowdLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'FULL';

export type PoiCrowdingSignalSource =
  | 'BOOKING'
  | 'PARKING'
  | 'PARKA'
  | 'TRAFFIC'
  | 'USER'
  | 'OPERATOR'
  | 'MODEL';

export interface PoiCrowdingSnapshot {
  poiId: string;
  placeId?: number;
  observedAt: string;

  parkingOccupancyRatio?: number;
  bookingRemaining?: number;
  bookingCapacity?: number;
  arrivalRatePerHour?: number;

  predictedWaitP50?: number;
  predictedWaitP90?: number;

  crowdLevel: PoiCrowdLevel;
  signalSources: PoiCrowdingSignalSource[];
  confidenceScore: number;
}

export type AccessCapacityVerdict =
  | 'BLOCKED'
  | 'RESERVATION_REQUIRED'
  | 'FEASIBLE_WITH_RISK'
  | 'FEASIBLE'
  | 'NEEDS_CONFIRMATION';

export interface AccessCapacityPlanB {
  action: 'SHIFT_ARRIVAL' | 'CHANGE_DATE' | 'USE_ALTERNATIVE' | 'BOOK_NOW';
  detail: string;
  suggestedArrivalTime?: string;
  alternativePoiId?: string;
}

export interface AccessCapacityEvaluationInput {
  poiId: string;
  poiName?: string;
  dateISO: string;
  /** 到达时刻 HH:mm（目的地当地） */
  arrivalTime: string;
  timezone?: string;
  vehicleType?: string;
  /** 用户已确认的预约/库存凭证 */
  userReservations?: Array<{
    resource: PoiAccessTargetResource;
    dateISO: string;
    slotStartTime?: string;
    slotEndTime?: string;
  }>;
  rules: PoiAccessRule[];
  statusOverrides?: PoiAccessStatusOverride[];
  capacitySnapshots?: PoiCapacitySnapshot[];
  crowdingSnapshot?: PoiCrowdingSnapshot;
  /** Umferðin 车流异常乘数（>1 表示高于基线到达率） */
  arrivalRateMultiplier?: number;
  /** 规则信息超过此天数未核验 → NEEDS_CONFIRMATION */
  staleRuleDays?: number;
}

export interface AccessCapacityEvaluationResult {
  verdict: AccessCapacityVerdict;
  poiId: string;
  bottleneckResource?: PoiAccessTargetResource;
  bottleneckRuleType?: PoiAccessRuleType;
  reason: string;
  confidence: PoiAccessConfidence;
  signalSources: PoiCrowdingSignalSource[];
  predictedWaitP50?: number;
  predictedWaitP90?: number;
  crowdLevel?: PoiCrowdLevel;
  planB: AccessCapacityPlanB[];
  blockingRuleIds?: string[];
}
