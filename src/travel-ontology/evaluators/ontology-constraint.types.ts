/**
 * Ontology 约束评估结果（Harness + Gateway 共用）
 */

export type OntologyConstraintSeverity = 'BLOCK' | 'WARNING' | 'MISSING_EVIDENCE' | 'INFO';

export interface OntologyConstraintResult {
  severity: OntologyConstraintSeverity;
  code: string;
  message: string;
  affectedSubjectIds?: string[];
}

export interface OntologyConstraintEvaluation {
  results: OntologyConstraintResult[];
  evaluatedAt: string;
}
