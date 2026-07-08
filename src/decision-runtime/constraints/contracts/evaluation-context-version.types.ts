/**
 * Four-dimensional evaluation context — stale detection beyond constraintsVersion alone.
 * @see CONSTRAINT_SEMANTIC_CONSOLIDATION.md §5
 */

export interface EvaluationContextVersion {
  planVersionId: string;
  policyVersion: number;
  worldRevision: string;
  rulePackVersion: string;
}

export const EVALUATION_CONTEXT_SCHEMA = 'tripnara.evaluation_context_version@v1' as const;
