/**
 * Frozen authority state at async task start — re-validated on resume and commit.
 */

export interface DurableAuthoritySnapshotV1 {
  schemaId: 'tripnara.durable_authority_snapshot@v1';
  tripId: string;
  expectedTripVersion: number;
  decisionId?: string;
  memorySnapshotVersion: string;
  evidenceSnapshot: {
    snapshotId: string;
    capturedAt: string;
    expiresAt?: string;
    digest: string;
  };
  constraintEvaluationId?: string;
  frozenAt: string;
}

export type AsyncAuthorityDenialReasonCode =
  | 'STALE_PLAN_VERSION'
  | 'EVIDENCE_SNAPSHOT_EXPIRED'
  | 'AUTHORITY_SNAPSHOT_INCOMPLETE'
  | 'EXECUTION_CONFLICT'
  | 'TRIP_VERSION_UNAVAILABLE';

export interface AsyncMutationGuardPayloadV1 {
  schemaId: 'tripnara.async_mutation_guard@v1';
  canCommit: false;
  stage: 'resume' | 'commit';
  reasonCodes: AsyncAuthorityDenialReasonCode[];
  userMessage: string;
  statusV2: {
    execution: { status: 'SUCCEEDED' | 'FAILED' };
    decision: { status: 'CONFLICTED' | 'PARTIAL' };
    freshness: { status: 'STALE' | 'EXPIRED' | 'CURRENT' | 'PENDING_VERIFICATION' };
    action: { status: 'BLOCKED' };
  };
  authoritySnapshot?: DurableAuthoritySnapshotV1;
}
