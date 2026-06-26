import { Injectable, Logger } from '@nestjs/common';
import type { TripWorldState } from '../decision/world-model';
import { cloneTripWorldState } from './clone-trip-world-state.util';
import type {
  CaptureCausalRuntimeSessionInput,
  CausalRuntimeSessionSnapshot,
} from './causal-runtime-session.types';
import { resolveOpsRealitySnapshotId } from './resolve-ops-reality-snapshot-id.util';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 500;

interface StoredSession extends CausalRuntimeSessionSnapshot {
  expiresAtMs: number;
}

/**
 * In-process causal runtime session — Agent / decision-engine join cache for OPS outcome + P5.
 * Fail-open: missing tripId or expired session does not block OPS writes.
 */
@Injectable()
export class CausalRuntimeSessionService {
  private readonly logger = new Logger(CausalRuntimeSessionService.name);
  private readonly byTripId = new Map<string, StoredSession>();
  private readonly requestIdToTripId = new Map<string, string>();
  private readonly ttlMs = Number(process.env.CAUSAL_RUNTIME_SESSION_TTL_MS ?? DEFAULT_TTL_MS);
  private readonly maxEntries = Number(
    process.env.CAUSAL_RUNTIME_SESSION_MAX_ENTRIES ?? DEFAULT_MAX_ENTRIES,
  );

  capture(input: CaptureCausalRuntimeSessionInput): CausalRuntimeSessionSnapshot | null {
    const tripId = input.state.context?.tripId?.trim();
    if (!tripId) {
      this.logger.debug('[CausalSession] skip capture — no state.context.tripId');
      return null;
    }

    this.evictExpired();

    const lastDecisionCausalityId = input.state.signals?.lastDecisionCausalityId?.trim();
    const opsRealitySnapshotId = resolveOpsRealitySnapshotId(
      input.state,
      lastDecisionCausalityId,
    );

    const snapshot: StoredSession = {
      tripId,
      requestId: input.requestId?.trim() || undefined,
      traceRequestId: input.traceRequestId?.trim() || undefined,
      capturedAt: new Date().toISOString(),
      lastDecisionCausalityId,
      opsRealitySnapshotId,
      state: cloneTripWorldState(input.state),
      expiresAtMs: Date.now() + this.ttlMs,
    };

    this.byTripId.set(tripId, snapshot);
    if (snapshot.requestId) {
      this.requestIdToTripId.set(snapshot.requestId, tripId);
    }
    if (snapshot.traceRequestId) {
      this.requestIdToTripId.set(snapshot.traceRequestId, tripId);
    }

    this.trimIfNeeded();

    this.logger.debug(
      `[CausalSession] captured trip=${tripId} causality=${lastDecisionCausalityId ?? '—'} ops_snapshot=${opsRealitySnapshotId ?? '—'}`,
    );

    return this.toPublic(snapshot);
  }

  getForTrip(tripId: string): CausalRuntimeSessionSnapshot | null {
    const key = tripId?.trim();
    if (!key) return null;
    const row = this.byTripId.get(key);
    if (!row) return null;
    if (row.expiresAtMs <= Date.now()) {
      this.byTripId.delete(key);
      return null;
    }
    return this.toPublic(row);
  }

  getForRequestId(requestId: string): CausalRuntimeSessionSnapshot | null {
    const tripId = this.requestIdToTripId.get(requestId?.trim() ?? '');
    if (!tripId) return null;
    return this.getForTrip(tripId);
  }

  resolveTripId(input: { tripId?: string; requestId?: string }): string | undefined {
    return (
      input.tripId?.trim() ||
      (input.requestId ? this.requestIdToTripId.get(input.requestId.trim()) : undefined)
    );
  }

  /** Test / admin hook */
  clear(): void {
    this.byTripId.clear();
    this.requestIdToTripId.clear();
  }

  private toPublic(row: StoredSession): CausalRuntimeSessionSnapshot {
    const { expiresAtMs: _e, ...rest } = row;
    return rest;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [tripId, row] of this.byTripId.entries()) {
      if (row.expiresAtMs <= now) {
        this.byTripId.delete(tripId);
      }
    }
  }

  private trimIfNeeded(): void {
    if (this.byTripId.size <= this.maxEntries) return;
    const sorted = [...this.byTripId.entries()].sort(
      (a, b) => a[1].expiresAtMs - b[1].expiresAtMs,
    );
    const removeCount = this.byTripId.size - this.maxEntries;
    for (let i = 0; i < removeCount; i++) {
      this.byTripId.delete(sorted[i][0]);
    }
  }
}
