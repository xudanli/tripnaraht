/**
 * RFC-001 Phase 0 — Decision Record (sole formal decision truth).
 * Only DecisionCoreService may create records with selectedCandidateId / finalAction.
 */

import type { AuthorizationRequirement } from './authorization.types';
import type { RejectedCandidate, UtilityEvaluation } from './authorization.types';
import type { Rfc001CutoverReconciliation } from '../cutover/cutover-reconciliation.types';

export type Rfc001FinalAction =
  | 'ALLOW'
  | 'ADJUST'
  | 'REPLACE'
  | 'REJECT'
  | 'DEFER_TO_HUMAN'
  | 'NO_ACTION';

export type Rfc001DecisionRecordStatus =
  | 'PROPOSED'
  | 'AUTHORIZED'
  | 'REJECTED_BY_USER'
  | 'EXECUTING'
  | 'EFFECTIVE'
  | 'PARTIAL'
  | 'FAILED'
  | 'ROLLED_BACK'
  | 'NEEDS_REPAIR';

/**
 * Fields that ONLY Decision Core may write on a DecisionRecord.
 * @see policy/write-permission.guard.ts
 */
export const DECISION_CORE_EXCLUSIVE_FIELDS = [
  'selectedCandidateId',
  'finalAction',
  'authorizationRequirement',
  'recordStatus',
  'effectivePlanVersionId',
] as const;

export type DecisionCoreExclusiveField = (typeof DECISION_CORE_EXCLUSIVE_FIELDS)[number];

export interface Rfc001DecisionRecord {
  decisionId: string;
  problemId: string;
  workspaceId: string;
  basePlanVersionId: string;
  worldStateSnapshotId: string;
  preferenceSnapshotId: string;
  consideredCandidateIds: string[];
  rejectedCandidates: RejectedCandidate[];
  selectedCandidateId?: string;
  finalAction: Rfc001FinalAction;
  reasonCodes: string[];
  evidenceRefs: string[];
  utilityEvaluation?: UtilityEvaluation[];
  authorizationRequirement: AuthorizationRequirement;
  ruleVersions: string[];
  modelVersions: Record<string, string>;
  recordStatus: Rfc001DecisionRecordStatus;
  effectivePlanVersionId?: string;
  createdAt: string;
  decidedAt: string;
  /** Cutover inflight reconciliation — blocks authorize/execute when executable=false. */
  cutoverReconciliation?: Rfc001CutoverReconciliation;
}
