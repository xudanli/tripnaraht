import type { ProductionTraceImportResult, ProductionTravelContextTrace } from './production-trace.types';
import type { TravelContextHarnessCase } from '../protocol/harness-case.types';
import type { TravelContextSnapshot } from '../../travel-context/domain/travel-context.types';
import type { TravelContextDiff } from '../protocol/context-diff.types';
import { computeTravelContextDiff } from '../reports/context-diff.util';
import { writeReplayFixtures } from './fixture-store.util';

export interface ProductionTraceImportOptions {
  /** Frozen snapshot to persist alongside trace (defaults to none) */
  snapshot?: TravelContextSnapshot;
  /** Output snapshot for diff computation */
  outputSnapshot?: TravelContextSnapshot;
  /** Override fixture directory (tests) */
  fixtureBaseDir?: string;
  /** When true (default), write snapshot + trace JSON under fixtures/contexts/replay/ */
  persistFixtures?: boolean;
}

/**
 * Converts an anonymized production trace into a frozen Harness Case + fixture id.
 * Optionally persists snapshot/trace JSON for replay regression (RFC-003 §9.8).
 */
export function importProductionTraceToHarnessCase(
  trace: ProductionTravelContextTrace,
  options: ProductionTraceImportOptions = {},
): ProductionTraceImportResult {
  const fixtureId = `replay_${trace.traceId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  const harnessCase: TravelContextHarnessCase = {
    caseId: `REGRESSION-${trace.traceId.slice(0, 8).toUpperCase()}`,
    title: `Production replay ${trace.traceId}`,
    category: 'REPLAY',
    given: {
      contextFixtureId: fixtureId,
      expectedBaseRevision: trace.inputAnchor.inputRevision,
    },
    when: {
      triggerType:
        trace.triggerType === 'WORLD_EVENT'
          ? 'WORLD_EVENT'
          : trace.triggerType === 'USER_INTENT'
            ? 'USER_INTENT'
            : 'SYSTEM_COMMAND',
    },
    expect: {
      outcome: trace.outputAnchor ? 'APPLIED' : 'NO_CHANGE',
      expectedRevisionDelta: trace.outputAnchor
        ? trace.outputAnchor.outputRevision! - trace.inputAnchor.inputRevision
        : 0,
      invariants: ['CTX-STATE-002', 'CTX-AUTH-004'],
    },
  };

  const persist = options.persistFixtures !== false && options.snapshot;
  const contextDiff: TravelContextDiff | undefined =
    options.snapshot && options.outputSnapshot
      ? {
          ...computeTravelContextDiff(options.snapshot, options.outputSnapshot),
          contextId: options.snapshot.identity.contextId,
        }
      : undefined;

  const traceWithDiff: ProductionTravelContextTrace = contextDiff
    ? { ...trace, contextDiff }
    : trace;

  if (persist) {
    writeReplayFixtures({
      fixtureId,
      snapshot: options.snapshot!,
      trace: traceWithDiff,
      baseDir: options.fixtureBaseDir,
    });
  }

  return { trace: traceWithDiff, harnessCase, fixtureId, contextDiff };
}

/** Stub — load trace JSON from object storage / admin export */
export function parseProductionTraceJson(raw: unknown): ProductionTravelContextTrace | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const inputAnchor = o.inputAnchor as ProductionTravelContextTrace['inputAnchor'] | undefined;
  if (
    typeof o.traceId !== 'string' ||
    typeof o.contextId !== 'string' ||
    !inputAnchor?.inputRevision
  ) {
    return null;
  }
  return raw as ProductionTravelContextTrace;
}
