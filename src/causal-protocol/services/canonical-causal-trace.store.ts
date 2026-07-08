import type { CanonicalCausalTraceV1 } from '../causal-trace.types';

/**
 * In-process trace store (v1). Replace with durable store after Iceland slice DoD.
 */
export class CanonicalCausalTraceStore {
  private readonly byTraceId = new Map<string, CanonicalCausalTraceV1>();
  private readonly activeByProblem = new Map<string, string>();

  private problemKey(tripId: string, problemId: string): string {
    return `${tripId}::${problemId}`;
  }

  get(traceId: string): CanonicalCausalTraceV1 | undefined {
    return this.byTraceId.get(traceId);
  }

  getActiveTraceId(tripId: string, problemId: string): string | undefined {
    return this.activeByProblem.get(this.problemKey(tripId, problemId));
  }

  save(trace: CanonicalCausalTraceV1): void {
    this.byTraceId.set(trace.traceId, trace);
    const problemId = trace.problems[0]?.problemId;
    if (problemId && trace.status !== 'STALE') {
      this.activeByProblem.set(this.problemKey(trace.tripId, problemId), trace.traceId);
    }
  }

  markStale(traceId: string): void {
    const existing = this.byTraceId.get(traceId);
    if (!existing) return;
    const stale: CanonicalCausalTraceV1 = {
      ...existing,
      status: 'STALE',
      updatedAt: new Date().toISOString(),
    };
    this.byTraceId.set(traceId, stale);
    const problemId = existing.problems[0]?.problemId;
    if (problemId) {
      const key = this.problemKey(existing.tripId, problemId);
      if (this.activeByProblem.get(key) === traceId) {
        this.activeByProblem.delete(key);
      }
    }
  }

  listForTrip(tripId: string): CanonicalCausalTraceV1[] {
    return [...this.byTraceId.values()].filter((t) => t.tripId === tripId);
  }
}
