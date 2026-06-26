import type { TripWorldState } from '../decision/world-model';

/** Server-side join cache — mirrors generate-plan state for OPS / P5 without client round-trip. */
export interface CausalRuntimeSessionSnapshot {
  tripId: string;
  requestId?: string;
  traceRequestId?: string;
  capturedAt: string;
  lastDecisionCausalityId?: string;
  opsRealitySnapshotId?: string;
  state: TripWorldState;
}

export interface CaptureCausalRuntimeSessionInput {
  state: TripWorldState;
  requestId?: string;
  traceRequestId?: string;
}
