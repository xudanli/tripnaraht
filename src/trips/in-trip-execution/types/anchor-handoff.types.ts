/** 行中执行阶段 — 锚点移交类型 */

import type { BudgetStructure, TripBudgetIntent } from '../../budget-os/types/trip-budget-os.types';
import type { PaymentRule } from '../../budget-os/types/travel-wallet.types';
import type {
  FrictionAlert,
  FrictionMatrixEntry,
  SplitMechanismMode,
} from '../../decision-profiling/types/decision-profiling.types';

export const IN_TRIP_ANCHOR_SCHEMA_VERSION = 1 as const;

export interface AnchorItineraryItem {
  id: string;
  type: string;
  title: string;
  startTime?: string;
  refundable: boolean;
  estimatedCost?: number;
  category: string;
  /** 冰岛 POI Access Engine slug（来自 Place.metadata） */
  poiAccessSlug?: string;
}

export interface AnchorItineraryDay {
  date: string;
  items: AnchorItineraryItem[];
}

export interface AnchorTeamMember {
  userId: string;
  displayName: string;
  role: string;
}

export interface AnchorTravelStyleSummary {
  userId: string;
  styleLabel: string;
  teamRole: string;
}

export interface AnchorMoneyDnaSummary {
  userId: string;
  experienceTendency: number;
  qualityTendency: number;
}

export interface AnchorSplitConsensus {
  recommendedMode: SplitMechanismMode;
  selectedMode: SplitMechanismMode | null;
  lockedMode: SplitMechanismMode | null;
  lockedAt: string | null;
}

export interface AnchorConflictWatchItem {
  domain: string;
  riskLevel: 'medium' | 'high';
  memberPair?: [string, string];
  note: string;
}

export interface InTripAnchorSnapshot {
  tripId: string;
  materializedAt: string;
  schemaVersion: typeof IN_TRIP_ANCHOR_SCHEMA_VERSION;

  budget: {
    intent: TripBudgetIntent;
    structure: BudgetStructure;
    walletRule: PaymentRule;
    splitMechanism: AnchorSplitConsensus;
  };

  team: {
    members: AnchorTeamMember[];
    travelStyles: AnchorTravelStyleSummary[];
    frictionMatrix: FrictionMatrixEntry[];
    compatibilityScore: number;
    highRiskAlerts: FrictionAlert[];
    profilingCompletionRate: number;
  };

  itinerary: {
    planId: string | null;
    lockedAt: string;
    days: AnchorItineraryDay[];
    bigTransportRefs: string[];
    nonRefundableItemIds: string[];
  };

  conflictWatchlist: AnchorConflictWatchItem[];

  metadata: {
    destination: string;
    startDate: string;
    endDate: string;
    totalDays: number;
    timezone: string;
  };
}

/** 面向前端的脱敏锚点摘要 */
export interface InTripAnchorSnapshotPublic {
  tripId: string;
  materializedAt: string;
  schemaVersion: number;
  metadata: InTripAnchorSnapshot['metadata'];
  team: {
    memberCount: number;
    profilingCompletionRate: number;
    compatibilityScore: number;
    highRiskAlertCount: number;
  };
  budget: {
    total: number;
    currency: string;
    splitMechanismLocked: boolean;
  };
  itinerary: {
    dayCount: number;
    itemCount: number;
    nonRefundableCount: number;
  };
}

export interface HandoffVerifyResult {
  tripId: string;
  ready: boolean;
  missing: string[];
  warnings: string[];
}

export interface HandoffMaterializeResult {
  tripId: string;
  materialized: boolean;
  alreadyExists: boolean;
  snapshot?: InTripAnchorSnapshotPublic;
  verify: HandoffVerifyResult;
}
