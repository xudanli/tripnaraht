import type { AssertionPromotionSignal } from './assertion-promotion.config';

export const RFC001_ASSERTION_PROMOTION_LEDGER_KEY = 'rfc001AssertionPromotionLedger';

export type AssertionPromotionLedgerStatus =
  | 'SHADOW_OBSERVED'
  | 'PROMOTED'
  | 'RECOVERY_SHADOW'
  | 'RECOVERED'
  | 'SKIPPED'
  | 'FAILED';

export interface AssertionPromotionLedgerEntry {
  ledgerId: string;
  promotionKey: string;
  signal: AssertionPromotionSignal;
  assertionId?: string;
  eventId?: string;
  status: AssertionPromotionLedgerStatus;
  shadowMode: boolean;
  attempts: number;
  lastAttemptAt: string;
  nextRetryAt?: string;
  lastError?: string;
  detail?: string;
  problemId?: string;
  recoveredProblemId?: string;
  ingestId?: string;
}

export interface StoredAssertionPromotionLedger {
  byPromotionKey: Record<string, AssertionPromotionLedgerEntry>;
  failedQueue: string[];
  lastUpdatedAt?: string;
}

export interface AssertionPromotionRequest {
  tripId: string;
  signal: AssertionPromotionSignal;
  predicate: 'weather.hazard' | 'road.status';
  assertionId?: string;
  eventId?: string;
  dayIndex?: number;
  roadId?: string;
  riskTier?: 'CALM' | 'ELEVATED' | 'PROHIBITED';
  ingestId?: string;
  sourceProvider?: string;
  trigger?: 'collector_ingest' | 'retry_worker' | 'monitoring_scan';
}

export interface AssertionPromotionResult {
  schemaId: string;
  tripId: string;
  promotionKey: string;
  signal: AssertionPromotionSignal;
  status: AssertionPromotionLedgerStatus;
  shadowMode: boolean;
  skipped?: boolean;
  detail?: string;
  problemId?: string;
  recoveredProblemId?: string;
  ledgerId?: string;
}
