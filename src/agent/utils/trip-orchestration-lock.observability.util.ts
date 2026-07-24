/**
 * Trip orchestration lock observability — Work Package A / Audit §10.
 * Records wait/hold/conflict into trace; Prometheus wiring is follow-up.
 */

export type TripLockObservabilityRecord = {
  trip_id: string;
  request_id: string;
  scope: string;
  reason: string;
  wait_ms: number;
  hold_ms: number;
  conflict: boolean;
  acquired: boolean;
  skipped: boolean;
  skip_reason?: string;
};

export function buildTripLockObservabilityTrace(
  record: TripLockObservabilityRecord,
): { trip_lock_v1: TripLockObservabilityRecord } {
  return { trip_lock_v1: record };
}

export function summarizeTripLockMetrics(records: TripLockObservabilityRecord[]): {
  trip_lock_wait_ms_p50: number;
  trip_lock_hold_ms_p50: number;
  trip_lock_conflict_count: number;
  sample_count: number;
} {
  if (records.length === 0) {
    return {
      trip_lock_wait_ms_p50: 0,
      trip_lock_hold_ms_p50: 0,
      trip_lock_conflict_count: 0,
      sample_count: 0,
    };
  }
  const waits = records.map((r) => r.wait_ms).sort((a, b) => a - b);
  const holds = records.map((r) => r.hold_ms).sort((a, b) => a - b);
  const mid = Math.floor(records.length / 2);
  return {
    trip_lock_wait_ms_p50: waits[mid] ?? 0,
    trip_lock_hold_ms_p50: holds[mid] ?? 0,
    trip_lock_conflict_count: records.filter((r) => r.conflict).length,
    sample_count: records.length,
  };
}
