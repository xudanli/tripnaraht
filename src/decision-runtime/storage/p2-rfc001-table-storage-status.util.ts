/**
 * P2 — RFC-001 table storage status for ops / flags.
 */

import {
  isRfc001MetadataReadFallbackEnabled,
  isRfc001MetadataWriteEnabled,
  isRfc001TableReadPreferred,
  isRfc001TableWriteEnabled,
  resolveRfc001TableStorageMode,
  type Rfc001TableStorageMode,
} from './p2-rfc001-table-storage.config';

export interface Rfc001TableStorageStatus {
  mode: Rfc001TableStorageMode;
  envRaw: string | undefined;
  tableWrite: boolean;
  metadataWrite: boolean;
  tableReadPreferred: boolean;
  metadataReadFallback: boolean;
  migration: string;
  tables: string[];
  rollout: string[];
}

export function resolveRfc001TableStorageStatus(): Rfc001TableStorageStatus {
  return {
    mode: resolveRfc001TableStorageMode(),
    envRaw: process.env.P2_RFC001_TABLE_STORAGE,
    tableWrite: isRfc001TableWriteEnabled(),
    metadataWrite: isRfc001MetadataWriteEnabled(),
    tableReadPreferred: isRfc001TableReadPreferred(),
    metadataReadFallback: isRfc001MetadataReadFallbackEnabled(),
    migration: '20260721170000_rfc001_formal_storage',
    tables: [
      'rfc001_plan_versions',
      'rfc001_plan_snapshots',
      'rfc001_plan_version_executions',
      'rfc001_trip_effective_plan',
      'rfc001_decision_records',
      'rfc001_decision_runs',
      'rfc001_decision_refs',
      'rfc001_decision_workspaces',
    ],
    rollout: [
      '1. Apply migration',
      '2. P2_RFC001_TABLE_STORAGE=DUAL_WRITE (write both; read metadata)',
      '3. Backfill + reconcile until drift=0',
      '4. TABLE_PRIMARY (read table; metadata fallback)',
      '5. TABLE_ONLY after soak (metadata write off)',
      '6. Rollback: set OFF or DUAL_WRITE; optional table→metadata restore',
    ],
  };
}
