/**
 * Phase 4 P1 — Silent Learning → Travel Memory ingest (ledger).
 * 记录「本该不打扰」的抑制事件，供阈值与 Outcome Review 优化。
 */

import type { MemoryLedgerStore } from '../../../travel-memory/ledger/memory-ledger.store';
import type { MemoryEventV1 } from '../../../travel-memory/types/memory-event.types';
import type { ProactiveSilentLearningV1 } from '../intervention/proactive-silent-learning.types';
import type { ProactiveDecisionTraceV1 } from '../trace/proactive-decision-trace.types';
import type { ProactiveOptionId } from '../synthesis/proactive-synthesis.types';

export const PROACTIVE_SILENT_MEMORY_PREDICATE =
  'proactive.silent_learning.suppressed' as const;

export type ProactiveSilentLearningMemoryValueV1 = {
  schemaId: 'nara.proactive_silent_learning_memory@v1';
  version: 1;
  silentLearning: ProactiveSilentLearningV1;
  decisionProblemId: string | null;
  recommendedOptionId: ProactiveOptionId | null;
  /** Compact replay for threshold tuning */
  decisionTraceReplay?: Record<string, unknown> | null;
  interventionValue: number | null;
  threshold: number | null;
};

export type IngestProactiveSilentLearningInput = {
  ledger: MemoryLedgerStore;
  silentLearning: ProactiveSilentLearningV1;
  decisionProblemId?: string | null;
  recommendedOptionId?: ProactiveOptionId | null;
  decisionTrace?: ProactiveDecisionTraceV1 | null;
  decisionTraceReplay?: Record<string, unknown> | null;
  /** Idempotency: skip if same trip+signal already suppressed */
  skipIfDuplicate?: boolean;
};

export type IngestProactiveSilentLearningResult =
  | {
      ok: true;
      event: MemoryEventV1;
      duplicate: boolean;
      memoryHook: 'TRAVEL_MEMORY_WRITTEN';
    }
  | {
      ok: false;
      reason: string;
      memoryHook: 'TRAVEL_MEMORY_SKIPPED' | 'TRAVEL_MEMORY_PENDING';
    };

function findExistingSilentEvent(
  ledger: MemoryLedgerStore,
  tripId: string,
  signalEventId: string,
): MemoryEventV1 | undefined {
  return ledger
    .list({ subjectId: tripId, activeOnly: false })
    .find((e) => {
      if (e.predicate !== PROACTIVE_SILENT_MEMORY_PREDICATE) return false;
      const value = e.value as ProactiveSilentLearningMemoryValueV1 | undefined;
      return value?.silentLearning?.signalEventId === signalEventId;
    });
}

/**
 * Append Silent Learning suppression into Travel Memory Ledger (CANDIDATE).
 * Does not promote to Profile preference.
 */
export function ingestProactiveSilentLearningIntoMemoryLedger(
  input: IngestProactiveSilentLearningInput,
): IngestProactiveSilentLearningResult {
  const { silentLearning, ledger } = input;

  if (input.skipIfDuplicate !== false) {
    const existing = findExistingSilentEvent(
      ledger,
      silentLearning.tripId,
      silentLearning.signalEventId,
    );
    if (existing) {
      return {
        ok: true,
        event: existing,
        duplicate: true,
        memoryHook: 'TRAVEL_MEMORY_WRITTEN',
      };
    }
  }

  try {
    const value: ProactiveSilentLearningMemoryValueV1 = {
      schemaId: 'nara.proactive_silent_learning_memory@v1',
      version: 1,
      silentLearning,
      decisionProblemId: input.decisionProblemId ?? null,
      recommendedOptionId: input.recommendedOptionId ?? null,
      decisionTraceReplay: input.decisionTraceReplay ?? null,
      interventionValue: silentLearning.interventionValue ?? null,
      threshold: silentLearning.threshold ?? null,
    };

    const event = ledger.append({
      op: 'ADD',
      subject: { type: 'TRIP', id: silentLearning.tripId },
      memoryType: 'OUTCOME_REF',
      predicate: PROACTIVE_SILENT_MEMORY_PREDICATE,
      value,
      scope: 'DECISION',
      source: {
        type: 'SYSTEM_ATTRIBUTION',
        decisionId: input.decisionProblemId ?? undefined,
        note: `proactive_silent_learning:${silentLearning.reason}`,
      },
      confidence: Math.min(
        1,
        Math.max(0.4, silentLearning.interventionValue ?? 0.45),
      ),
      status: 'CANDIDATE',
      evidenceRefs: [
        {
          type: 'CGUS_TRACE',
          id:
            input.decisionProblemId ??
            `pd_silent:${silentLearning.tripId}:${silentLearning.signalEventId}`,
        },
      ],
      validFrom: silentLearning.observedAt,
    });

    return {
      ok: true,
      event,
      duplicate: false,
      memoryHook: 'TRAVEL_MEMORY_WRITTEN',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: message,
      memoryHook: 'TRAVEL_MEMORY_SKIPPED',
    };
  }
}

export function listProactiveSilentLearningEvents(
  ledger: MemoryLedgerStore,
  tripId?: string,
): MemoryEventV1[] {
  return ledger
    .list({
      subjectId: tripId,
      predicate: PROACTIVE_SILENT_MEMORY_PREDICATE,
      activeOnly: false,
    })
    .filter((e) => e.predicate === PROACTIVE_SILENT_MEMORY_PREDICATE);
}
