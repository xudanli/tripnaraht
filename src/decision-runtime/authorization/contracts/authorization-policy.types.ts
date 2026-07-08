/**
 * Authorization Policy Gateway contracts — unified Decision / Tool / Commit approval.
 * @see DECISION_RUNTIME_MATURITY.md §5.3 / §8 P4
 */

export const AUTHORIZATION_POLICY_RESULT_SCHEMA_ID =
  'tripnara.authorization_policy_result@v1';

export type AuthorizationScope =
  | 'DECISION'
  | 'TOOL'
  | 'EFFECTIVE_PLAN_COMMIT';

export type AuthorizationOutcome = 'ALLOW' | 'ASK' | 'DENY' | 'DEGRADE';

export interface AuthorizationPolicyInput {
  scope: AuthorizationScope;
  tripId: string;
  decisionId?: string;
  candidateId?: string;
  toolName?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuthorizationPolicyResult {
  schemaId: typeof AUTHORIZATION_POLICY_RESULT_SCHEMA_ID;
  scope: AuthorizationScope;
  outcome: AuthorizationOutcome;
  reasonCodes: string[];
  evaluatedAt: string;
  /** When gateway disabled — callers continue legacy authorize paths */
  delegatedToLegacy?: boolean;
}
