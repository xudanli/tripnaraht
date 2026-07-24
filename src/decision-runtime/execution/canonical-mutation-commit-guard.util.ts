import { buildAuthorityAuditTrace } from './build-authority-audit-trace.util';
import {
  isEffectivePlanWriteGuardEnforce,
  isEffectivePlanWriteGuardShadow,
  resolveLegacyMutationWriteGuardMode,
} from './canonical-mutation-commit-guard.config';
import type { AuthorityAuditTraceV1 } from './authority-audit-trace-v1.types';
import type {
  MutationAuthorityEnvelopeV1,
  MutationCommitResultV1,
  MutationDenialReasonCode,
  ProposedChangeSetV1,
} from './mutation-authority-envelope-v1.types';

export type PartialMutationEnvelope = Partial<MutationAuthorityEnvelopeV1> & {
  tripId?: string;
  executionSource?: MutationAuthorityEnvelopeV1['executionSource'];
};

export type MutationValidationResult = {
  allowed: boolean;
  reasonCodes: MutationDenialReasonCode[];
  auditTrace: AuthorityAuditTraceV1;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function evidenceFreshness(
  expiresAt?: string,
): AuthorityAuditTraceV1['evidence']['freshness'] {
  if (!expiresAt) return 'UNKNOWN';
  const exp = Date.parse(expiresAt);
  if (!Number.isFinite(exp)) return 'UNKNOWN';
  return Date.now() < exp ? 'CURRENT' : 'EXPIRED';
}

/**
 * Validate mutation authority envelope before any effective plan commit.
 * Missing any required field → DENY (secure-by-default).
 */
export function validateMutationAuthority(
  envelope: PartialMutationEnvelope,
): MutationValidationResult {
  const reasonCodes: MutationDenialReasonCode[] = [];
  const routeClass = envelope.executionSource?.routeClass ?? 'UNKNOWN';
  const orchestrationMode = envelope.executionSource?.orchestrationMode ?? 'UNKNOWN';

  const decisionId = envelope.decisionId?.trim();
  if (!isNonEmptyString(decisionId)) {
    reasonCodes.push('MUTATION_DENIED_DECISION_AUTHORITY_MISSING');
  }

  const evalBlock = envelope.constraintEvaluation;
  if (!evalBlock?.evaluationId?.trim()) {
    reasonCodes.push('CONSTRAINT_EVALUATION_MISSING');
  } else if (evalBlock.verdict === 'BLOCK') {
    reasonCodes.push('HARD_CONSTRAINT_BLOCK');
  } else if (
    Array.isArray(evalBlock.hardConstraintViolations) &&
    evalBlock.hardConstraintViolations.length > 0
  ) {
    reasonCodes.push('HARD_CONSTRAINT_BLOCK');
  }

  const evidence = envelope.evidenceSnapshot;
  if (!evidence?.snapshotId?.trim()) {
    reasonCodes.push('EVIDENCE_SNAPSHOT_MISSING');
  } else if (evidence.expiresAt && Date.now() >= Date.parse(evidence.expiresAt)) {
    reasonCodes.push('EVIDENCE_SNAPSHOT_EXPIRED');
  }

  const expectedVersion = envelope.expectedTripVersion;
  if (expectedVersion === undefined || !Number.isFinite(expectedVersion)) {
    reasonCodes.push('ENVELOPE_INCOMPLETE');
  }

  const writeVerdict = envelope.writeAuthority?.verdict;
  if (writeVerdict !== 'ALLOW') {
    reasonCodes.push('WRITE_GUARD_DENY');
    if (envelope.writeAuthority?.reasonCodes?.includes('CANONICAL_AUTHORITY_UNAVAILABLE')) {
      reasonCodes.push('CANONICAL_AUTHORITY_UNAVAILABLE');
    }
  }

  if (
    !isNonEmptyString(envelope.tripId) ||
    !evalBlock ||
    !evidence ||
    writeVerdict === undefined
  ) {
    if (!reasonCodes.includes('ENVELOPE_INCOMPLETE')) {
      reasonCodes.push('ENVELOPE_INCOMPLETE');
    }
  }

  const uniqueReasons = [...new Set(reasonCodes)];
  const allowed = uniqueReasons.length === 0;

  const auditTrace = buildAuthorityAuditTrace({
    routeClass,
    orchestrationMode,
    mutationIntent: true,
    mutationAttempted: true,
    mutationCommitted: false,
    constraintGatewayRequired: true,
    constraintGatewayInvoked: Boolean(evalBlock?.evaluationId),
    constraintEvaluationId: evalBlock?.evaluationId,
    constraintVerdict: evalBlock?.verdict,
    decisionRequired: true,
    decisionId,
    decisionRecorded: Boolean(decisionId),
    expectedTripVersion: expectedVersion,
    writeGuardRequired: true,
    writeGuardInvoked: true,
    writeGuardVerdict: writeVerdict === 'ALLOW' ? 'ALLOW' : 'DENY',
    evidenceSnapshotId: evidence?.snapshotId,
    evidenceFreshness: evidenceFreshness(evidence?.expiresAt),
    reasonCodes: uniqueReasons,
  });

  return { allowed, reasonCodes: uniqueReasons, auditTrace };
}

export type CommitEffectivePlanMutationInput = {
  envelope: PartialMutationEnvelope;
  proposedChangeSet: ProposedChangeSetV1;
  actualTripVersion?: number;
  commitFn?: (input: {
    envelope: MutationAuthorityEnvelopeV1;
    proposedChangeSet: ProposedChangeSetV1;
  }) => Promise<{ tripVersionAfter: number }>;
};

/**
 * Single commit entry — all write paths must call this (not bare tripId + patch).
 */
export async function commitEffectivePlanMutation(
  input: CommitEffectivePlanMutationInput,
): Promise<MutationCommitResultV1> {
  const validation = validateMutationAuthority(input.envelope);

  if (
    input.actualTripVersion !== undefined &&
    input.envelope.expectedTripVersion !== undefined &&
    input.actualTripVersion !== input.envelope.expectedTripVersion
  ) {
    validation.allowed = false;
    validation.reasonCodes = [
      ...new Set([...validation.reasonCodes, 'EXECUTION_CONFLICT' as MutationDenialReasonCode]),
    ];
    validation.auditTrace = buildAuthorityAuditTrace({
      ...validation.auditTrace,
      actualTripVersion: input.actualTripVersion,
      mutationCommitted: false,
      reasonCodes: validation.reasonCodes,
    });
    validation.auditTrace.tripVersion.matched = false;
  }

  const shadowOnly =
    isEffectivePlanWriteGuardShadow() &&
    !isEffectivePlanWriteGuardEnforce() &&
    resolveLegacyMutationWriteGuardMode() === 'SHADOW';

  if (!validation.allowed) {
    return {
      committed: false,
      tripVersionBefore: input.actualTripVersion,
      reasonCodes: validation.reasonCodes,
      auditTrace: validation.auditTrace,
    };
  }

  if (shadowOnly) {
    return {
      committed: false,
      tripVersionBefore: input.actualTripVersion,
      reasonCodes: ['WRITE_GUARD_DENY'],
      auditTrace: buildAuthorityAuditTrace({
        routeClass: input.envelope.executionSource?.routeClass ?? 'UNKNOWN',
        orchestrationMode: input.envelope.executionSource?.orchestrationMode ?? 'UNKNOWN',
        mutationIntent: true,
        mutationAttempted: true,
        mutationCommitted: false,
        constraintGatewayInvoked: true,
        decisionId: input.envelope.decisionId,
        writeGuardInvoked: true,
        writeGuardVerdict: 'DENY',
        reasonCodes: ['WRITE_GUARD_DENY'],
      }),
    };
  }

  if (!input.commitFn) {
    return {
      committed: false,
      reasonCodes: ['CANONICAL_AUTHORITY_UNAVAILABLE'],
      auditTrace: validation.auditTrace,
    };
  }

  const fullEnvelope = input.envelope as MutationAuthorityEnvelopeV1;
  const result = await input.commitFn({
    envelope: fullEnvelope,
    proposedChangeSet: input.proposedChangeSet,
  });

  return {
    committed: true,
    tripVersionBefore: input.actualTripVersion,
    tripVersionAfter: result.tripVersionAfter,
    reasonCodes: [],
    auditTrace: buildAuthorityAuditTrace({
      routeClass: fullEnvelope.executionSource.routeClass,
      orchestrationMode: fullEnvelope.executionSource.orchestrationMode,
      mutationIntent: true,
      mutationAttempted: true,
      mutationCommitted: true,
      constraintGatewayInvoked: true,
      constraintEvaluationId: fullEnvelope.constraintEvaluation.evaluationId,
      constraintVerdict: fullEnvelope.constraintEvaluation.verdict,
      decisionId: fullEnvelope.decisionId,
      decisionRecorded: true,
      expectedTripVersion: fullEnvelope.expectedTripVersion,
      actualTripVersion: result.tripVersionAfter,
      writeGuardInvoked: true,
      writeGuardVerdict: 'ALLOW',
      evidenceSnapshotId: fullEnvelope.evidenceSnapshot.snapshotId,
      evidenceFreshness: evidenceFreshness(fullEnvelope.evidenceSnapshot.expiresAt),
      reasonCodes: [],
    }),
  };
}
