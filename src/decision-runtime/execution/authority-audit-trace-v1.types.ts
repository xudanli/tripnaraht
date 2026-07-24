/**
 * Runtime authority audit trace — distinguishes read-only skip vs write bypass.
 */

export interface AuthorityAuditTraceV1 {
  schemaId: 'tripnara.authority_audit@v1';
  routeClass: string;
  orchestrationMode: string;

  mutationIntent: boolean;
  mutationAttempted: boolean;
  mutationCommitted: boolean;

  constraintGateway: {
    required: boolean;
    invoked: boolean;
    evaluationId?: string;
    verdict?: string;
  };

  decisionLedger: {
    required: boolean;
    decisionId?: string;
    recorded: boolean;
  };

  tripVersion: {
    expected?: number;
    actual?: number;
    matched?: boolean;
  };

  writeGuard: {
    required: boolean;
    invoked: boolean;
    verdict?: 'ALLOW' | 'DENY';
  };

  evidence: {
    snapshotId?: string;
    freshness?: 'CURRENT' | 'STALE' | 'EXPIRED' | 'UNKNOWN';
  };

  bypassDetected: boolean;
  reasonCodes: string[];
}
