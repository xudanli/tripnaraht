/** M12 — 离线晨间包与写队列同步类型 */

import type { WalletBalances } from '../../budget-os/types/travel-wallet.types';
import type { AnchorItineraryItem, InTripAnchorSnapshotPublic } from './anchor-handoff.types';
import type { DayVulnerabilityScore } from './environment-event.types';

export const IN_TRIP_MORNING_PACK_SCHEMA_VERSION = 1 as const;

export type OfflineOperationType =
  | 'record_transaction'
  | 'mood_check'
  | 'motion_signal'
  | 'experience_pulse'
  | 'micro_feedback'
  | 'poi_execution_feedback';

export type PoiAccessMorningAlert = {
  itemId: string;
  poiId: string;
  poiName: string;
  arrivalTime: string;
  verdict:
    | 'BLOCKED'
    | 'FEASIBLE_WITH_RISK'
    | 'FEASIBLE'
    | 'NEEDS_CONFIRMATION'
    | 'RESERVATION_REQUIRED';
  reason: string;
  planB: Array<{
    action: string;
    detail: string;
    suggestedArrivalTime?: string;
    alternativePoiId?: string;
  }>;
  crowdLevel?: string;
  predictedWaitP50?: number;
  disclosureLabel?: string;
};

export interface InTripMorningPack {
  schemaVersion: typeof IN_TRIP_MORNING_PACK_SCHEMA_VERSION;
  syncedAt: string;
  anchorSummary: InTripAnchorSnapshotPublic | null;
  todayTimeline: {
    dayNumber: number;
    date: string;
    items: AnchorItineraryItem[];
  };
  vulnerability: DayVulnerabilityScore | null;
  budgetSnapshot: {
    overallUsagePercent: number | null;
    currency: string;
    dailyBudget: number | null;
  };
  walletBalances: WalletBalances | null;
  pendingOperations: OfflineQueueEntryPublic[];
  /** 当日 POI 准入/容量预警（冰岛 Access & Capacity Engine） */
  poiAccessAlerts?: PoiAccessMorningAlert[];
}

export interface OfflineQueueEntryPublic {
  id: string;
  operationType: OfflineOperationType;
  clientSeq: string;
  recordedAt: string;
  conflictStatus: string | null;
  syncedAt: string | null;
}

export interface OfflineOperationInput {
  clientSeq: number;
  operationType: OfflineOperationType;
  payload: Record<string, unknown>;
  recordedAt: string;
}

export interface OfflineSyncRequest {
  operations: OfflineOperationInput[];
}

export interface OfflineSyncResult {
  applied: number;
  skipped: number;
  conflicts: Array<{
    clientSeq: number;
    operationType: OfflineOperationType;
    reason: string;
  }>;
  syncedAt: string;
}

export interface InTripRuntimePolicy {
  syncIntervalMinutes: number;
  environmentScanMinutes: number;
  experienceWeightCronHourUtc: number;
  lowPowerMode: {
    disableMotionPolling: boolean;
    reduceEnvironmentScan: boolean;
    batchOfflineSync: boolean;
  };
  networkPolicy: {
    wifiOnlyPackDownload: boolean;
    maxPackSizeMb: number;
    compressResponses: boolean;
  };
}

export interface InTripBetaMetrics {
  cohortLabel: string;
  generatedAt: string;
  activeTrips: number;
  completedTrips: number;
  anchorMaterializationRate: number;
  environment: {
    openRedEvents: number;
    adoptionRate: number | null;
    avgDetectionDelayMinutes: number | null;
  };
  money: {
    transactionsToday: number;
    avgTransactionsPerTrip: number;
    nudgeTriggerRate: number | null;
  };
  groupPulse: {
    moodChecksToday: number;
    moodParticipationRate: number | null;
    pendingInterventions: number;
  };
  experience: {
    pulsesSubmittedToday: number;
    pulseCompletionRate: number | null;
  };
  offline: {
    pendingQueueEntries: number;
    syncedToday: number;
    conflictCount: number;
  };
}
