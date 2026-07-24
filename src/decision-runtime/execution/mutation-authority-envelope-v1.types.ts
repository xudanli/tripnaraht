/**
 * Canonical mutation authority envelope — all effective trip writes must carry this credential.
 */

export type ConstraintEvaluationVerdict = 'PASS' | 'WARN' | 'BLOCK';

export type WriteAuthorityVerdict = 'ALLOW' | 'DENY';

export interface MutationAuthorityEnvelopeV1 {
  schemaId: 'tripnara.mutation_authority_envelope@v1';
  tripId: string;
  decisionId: string;
  expectedTripVersion: number;
  constraintEvaluation: {
    evaluationId: string;
    verdict: ConstraintEvaluationVerdict;
    hardConstraintViolations: string[];
  };
  evidenceSnapshot: {
    snapshotId: string;
    capturedAt: string;
    expiresAt?: string;
  };
  writeAuthority: {
    verdict: WriteAuthorityVerdict;
    reasonCodes: string[];
  };
  executionSource: {
    routeClass: string;
    orchestrationMode: string;
    durableTripRunId?: string;
  };
}

export type MutationDenialReasonCode =
  | 'MUTATION_DENIED_DECISION_AUTHORITY_MISSING'
  | 'CONSTRAINT_EVALUATION_MISSING'
  | 'CANONICAL_AUTHORITY_UNAVAILABLE'
  | 'HARD_CONSTRAINT_BLOCK'
  | 'EVIDENCE_SNAPSHOT_MISSING'
  | 'EVIDENCE_SNAPSHOT_EXPIRED'
  | 'EXECUTION_CONFLICT'
  | 'WRITE_GUARD_DENY'
  | 'ENVELOPE_INCOMPLETE';

export interface ProposedChangeSetV1 {
  schemaId: 'tripnara.proposed_change_set@v1';
  tripId: string;
  /** Opaque patch — commit layer validates envelope before applying */
  patch: Record<string, unknown>;
}

export interface MutationCommitResultV1 {
  committed: boolean;
  tripVersionBefore?: number;
  tripVersionAfter?: number;
  reasonCodes: MutationDenialReasonCode[];
  auditTrace: import('./authority-audit-trace-v1.types').AuthorityAuditTraceV1;
}

export interface LegacyMutationGuardPayloadV1 {
  schemaId: 'tripnara.legacy_mutation_guard@v1';
  canCommit: false;
  reasonCodes: MutationDenialReasonCode[];
  proposedChangeSet?: ProposedChangeSetV1;
  userMessage: string;
  statusV2: {
    execution: { status: 'SUCCEEDED' };
    decision: { status: 'PARTIAL' | 'CONFLICTED' };
    freshness: { status: 'PENDING_VERIFICATION' | 'STALE' | 'EXPIRED' };
    action: { status: 'BLOCKED' };
  };
}
