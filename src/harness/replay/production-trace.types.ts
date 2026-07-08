import type { TravelContextHarnessCase } from '../protocol/harness-case.types';
import type { HarnessExecutionAnchor } from '../protocol/execution-anchor.types';
import type { TravelContextDiff } from '../protocol/context-diff.types';

/** Captured production run — source for replay → Harness Case conversion (RFC-003 §9.8). */
export interface ProductionTravelContextTrace {
  traceId: string;
  capturedAt: string;
  contextId: string;
  inputAnchor: HarnessExecutionAnchor;
  outputAnchor?: HarnessExecutionAnchor;
  triggerType: string;
  runtimeVersion?: string;
  constraintVersion?: string;
  authorizationPolicyRef?: string;
  contextDiffRef?: string;
  /** Inline diff when replay fixture includes before/after snapshots */
  contextDiff?: TravelContextDiff;
  /** Anonymized — no raw PII */
  anonymized: boolean;
}

export interface ProductionTraceImportResult {
  trace: ProductionTravelContextTrace;
  harnessCase: TravelContextHarnessCase;
  fixtureId: string;
  contextDiff?: TravelContextDiff;
}
