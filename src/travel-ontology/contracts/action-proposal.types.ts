/**
 * ActionProposal / Ontology outcome event (restored — Authority Consistency).
 */

export const ACTION_PROPOSAL_SCHEMA_ID = 'tripnara.action_proposal@v1' as const;

export interface ActionPrecondition {
  type: 'ASSESSMENT_OUTCOME' | 'FACT_PRESENT' | 'FACT_ABSENT' | 'REVISION_MATCH';
  assessmentId?: string;
  factId?: string;
  predicate?: string;
  expectedRevision?: number;
}

export interface PlanMutation {
  op: 'REPLACE_ROUTE' | 'REPLACE_VEHICLE' | 'PATCH_ACTIVITY' | 'OTHER';
  targetId?: string;
  payload?: unknown;
}

export interface FactMutation {
  op: 'UPSERT' | 'EXPIRE' | 'SUPERSEDE';
  factId: string;
  nextFactId?: string;
}

export interface ActionProposal {
  schemaId: typeof ACTION_PROPOSAL_SCHEMA_ID;
  actionId: string;
  assessmentId: string;
  basedOnRevision: number;
  preconditions: ActionPrecondition[];
  expectedDelta: {
    planMutations: PlanMutation[];
    factMutations: FactMutation[];
    invalidatedAssessmentIds: string[];
  };
  requiresAuthorization: boolean;
  reevaluationScopes: string[];
  idempotencyKey: string;
}

export interface OntologyOutcomeEvent {
  eventId: string;
  actionId: string;
  assessmentIdBefore: string;
  occurredAt: string;
  planVersionAfter?: string;
  factSetVersionAfter: string;
  assessmentIdAfter: string;
}
