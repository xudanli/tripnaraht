/**
 * P9 — deterministic execution trace for replay / audit (logical clock, not wall time).
 */

export interface ExecutionTraceEvent {
  op: string;
  traceId: string;
  /** Monotonic logical clock — same inputs → same sequence (replay-safe). */
  timestamp: number;
}
