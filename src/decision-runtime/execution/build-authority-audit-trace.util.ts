import type { AuthorityAuditTraceV1 } from './authority-audit-trace-v1.types';
import type { MutationDenialReasonCode } from './mutation-authority-envelope-v1.types';

export function buildAuthorityAuditTrace(input: {
  routeClass: string;
  orchestrationMode: string;
  mutationIntent: boolean;
  mutationAttempted?: boolean;
  mutationCommitted?: boolean;
  constraintGatewayRequired?: boolean;
  constraintGatewayInvoked?: boolean;
  constraintEvaluationId?: string;
  constraintVerdict?: string;
  decisionRequired?: boolean;
  decisionId?: string;
  decisionRecorded?: boolean;
  expectedTripVersion?: number;
  actualTripVersion?: number;
  writeGuardRequired?: boolean;
  writeGuardInvoked?: boolean;
  writeGuardVerdict?: 'ALLOW' | 'DENY';
  evidenceSnapshotId?: string;
  evidenceFreshness?: AuthorityAuditTraceV1['evidence']['freshness'];
  reasonCodes?: MutationDenialReasonCode[] | string[];
}): AuthorityAuditTraceV1 {
  const mutationAttempted = input.mutationAttempted ?? input.mutationIntent;
  const mutationCommitted = input.mutationCommitted ?? false;
  const constraintRequired = input.constraintGatewayRequired ?? input.mutationIntent;
  const constraintInvoked = input.constraintGatewayInvoked ?? false;
  const decisionRequired = input.decisionRequired ?? input.mutationIntent;
  const writeGuardRequired = input.writeGuardRequired ?? input.mutationIntent;
  const writeGuardInvoked = input.writeGuardInvoked ?? false;

  const bypassDetected =
    input.mutationIntent &&
    !mutationCommitted &&
    ((constraintRequired && !constraintInvoked) ||
      (decisionRequired && !input.decisionId) ||
      (writeGuardRequired && input.writeGuardVerdict !== 'ALLOW'));

  const tripVersionMatched =
    input.expectedTripVersion !== undefined &&
    input.actualTripVersion !== undefined &&
    input.expectedTripVersion === input.actualTripVersion;

  return {
    schemaId: 'tripnara.authority_audit@v1',
    routeClass: input.routeClass,
    orchestrationMode: input.orchestrationMode,
    mutationIntent: input.mutationIntent,
    mutationAttempted,
    mutationCommitted,
    constraintGateway: {
      required: constraintRequired,
      invoked: constraintInvoked,
      evaluationId: input.constraintEvaluationId,
      verdict: input.constraintVerdict,
    },
    decisionLedger: {
      required: decisionRequired,
      decisionId: input.decisionId,
      recorded: input.decisionRecorded ?? Boolean(input.decisionId),
    },
    tripVersion: {
      expected: input.expectedTripVersion,
      actual: input.actualTripVersion,
      matched: tripVersionMatched,
    },
    writeGuard: {
      required: writeGuardRequired,
      invoked: writeGuardInvoked,
      verdict: input.writeGuardVerdict,
    },
    evidence: {
      snapshotId: input.evidenceSnapshotId,
      freshness: input.evidenceFreshness ?? 'UNKNOWN',
    },
    bypassDetected,
    reasonCodes: [...(input.reasonCodes ?? [])],
  };
}
