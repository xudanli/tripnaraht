/**
 * Ontology ConstraintAssessment contract (restored — Authority Consistency).
 */

export const CONSTRAINT_ASSESSMENT_SCHEMA_ID = 'tripnara.constraint_assessment@v1' as const;

export type ConstraintAssessmentOutcome =
  | 'ALLOW'
  | 'WARNING'
  | 'NEED_CONFIRM'
  | 'BLOCK'
  | 'UNKNOWN';

export interface ConstraintAssessmentBasis {
  contextId: string;
  contextRevision: number;
  effectivePlanVersion: string;
  factSetVersion: string;
  worldStateVersion: string;
  ontologyVersion: string;
  constraintVersion: string;
  destinationPackVersion: string;
}

export interface AssessmentScope {
  tripId?: string;
  days?: number[];
  planItemIds?: string[];
  subjectIds?: string[];
  country?: string;
}

export type AssessmentLifecycleStatus = 'ACTIVE' | 'INVALIDATED' | 'SUPERSEDED' | 'EXPIRED';

export type AssessmentAffectedGate =
  | 'READY_TRANSITION'
  | 'CONTINUE_EDITING'
  | 'CONFIRM'
  | 'EXECUTE'
  | 'EXECUTABLE';

export interface ConstraintAssessment {
  schemaId: typeof CONSTRAINT_ASSESSMENT_SCHEMA_ID;
  assessmentId: string;
  basis: ConstraintAssessmentBasis;
  outcome: ConstraintAssessmentOutcome;
  reasonCodes: string[];
  factRefs: string[];
  constraintRefs: string[];
  affectedScopes: AssessmentScope[];
  affectedGates?: AssessmentAffectedGate[];
  evaluatedAt: string;
  lifecycleStatus?: AssessmentLifecycleStatus;
  invalidated?: boolean;
  invalidatedByActionId?: string;
  supersededByAssessmentId?: string;
  problemIds?: string[];
  semanticKey?: string;
}

export const CONSTRAINT_ASSESSMENT_OUTCOME_RANK: Record<ConstraintAssessmentOutcome, number> = {
  ALLOW: 0,
  WARNING: 1,
  NEED_CONFIRM: 2,
  UNKNOWN: 3,
  BLOCK: 4,
};

export function mergeConstraintOutcomes(
  outcomes: ConstraintAssessmentOutcome[],
): ConstraintAssessmentOutcome {
  if (outcomes.length === 0) return 'ALLOW';
  return outcomes.reduce((acc, o) =>
    CONSTRAINT_ASSESSMENT_OUTCOME_RANK[o] > CONSTRAINT_ASSESSMENT_OUTCOME_RANK[acc] ? o : acc,
  );
}
