/**
 * PD-6 — Silent Learning record when Intervention Gate suppresses notify.
 */

export const PROACTIVE_SILENT_LEARNING_SCHEMA =
  'nara.proactive_silent_learning@v1' as const;

export type ProactiveSilentMemoryHook =
  | 'TRAVEL_MEMORY_PENDING'
  | 'TRAVEL_MEMORY_WRITTEN'
  | 'TRAVEL_MEMORY_SKIPPED';

export type ProactiveSilentLearningV1 = {
  schemaId: typeof PROACTIVE_SILENT_LEARNING_SCHEMA;
  version: 1;
  tripId: string;
  signalEventId: string;
  caseId: string | null;
  reason:
    | 'BELOW_THRESHOLD'
    | 'DO_NOT_SURFACE'
    | 'SYNTHESIS_MISSING'
    | 'FEATURE_FLAG_OFF';
  interventionValue?: number;
  threshold?: number;
  observedAt: string;
  /** Travel Memory binding status (Phase 4 P1) */
  memoryHook: ProactiveSilentMemoryHook;
  /** Set when written to Travel Memory Ledger */
  memoryEventId?: string;
};
