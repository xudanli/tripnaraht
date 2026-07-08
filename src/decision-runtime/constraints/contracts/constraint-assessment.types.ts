/**
 * Unified constraint assessment — extends Gateway ConstraintAssertion with evaluation context.
 * Phase 1 semantic consolidation SSOT for formal evaluation facts.
 * @see CONSTRAINT_SEMANTIC_CONSOLIDATION.md §2.6
 */

import type { ConstraintEvaluationStatus } from './constraint-assertion';
import type { EvaluationContextVersion } from './evaluation-context-version.types';

export const CONSTRAINT_ASSESSMENT_SCHEMA = 'tripnara.constraint_assessment@v1' as const;

export type ConstraintEvaluationMode =
  | 'CANDIDATE_FILTER'
  | 'PLAN_VERIFY'
  | 'CHANGE_PREVIEW'
  | 'WORLD_RECHECK';

export interface ConstraintAssessmentAffectedScope {
  tripId: string;
  dayIds?: string[];
  planObjectIds?: string[];
  memberIds?: string[];
  routeSegmentIds?: string[];
  activityIds?: string[];
}

export interface ConstraintAssessmentSourceRef {
  system: 'FEASIBILITY' | 'GATEWAY' | 'GUARDIAN' | 'GATE' | 'TRIP_CONSTRAINT';
  refId: string;
}

export interface ConstraintAssessment {
  schemaId: typeof CONSTRAINT_ASSESSMENT_SCHEMA;
  assessmentId: string;
  evaluationMode: ConstraintEvaluationMode;
  status: ConstraintEvaluationStatus;
  semanticKey: string;
  subjectRefs: string[];
  affectedScope: ConstraintAssessmentAffectedScope;
  policyRefs?: string[];
  ruleRefs?: string[];
  assertionRefs?: string[];
  commitmentRefs?: string[];
  explanationCode: string;
  measuredValue?: unknown;
  thresholdValue?: unknown;
  evidenceRefs: string[];
  message: string;
  overridable?: boolean;
  confidence?: number;
  contextVersion: EvaluationContextVersion;
  evaluatedAt: string;
  /** Upstream producer (feasibility issue id, gateway assertion id, …) */
  sourceRef: ConstraintAssessmentSourceRef;
  /** Decision Semantics assertion id when adapted from feasibility */
  semanticsAssertionId?: string;
  /** Linked decision problem ids (filled by trace aggregator) */
  problemIds?: string[];
}

export interface ConstraintAssessmentTraceBundle {
  schemaId: 'tripnara.constraint_assessment_trace@v1';
  tripId: string;
  generatedAt: string;
  contextVersion: EvaluationContextVersion;
  assessments: ConstraintAssessment[];
  problems: Array<{
    problemId: string;
    semanticKey?: string;
    title: string;
    detectedBy: string;
    assessmentIds: string[];
    assertionIds: string[];
  }>;
  policies: Array<{ policyId: string; name: string; category?: string; hardness?: string }>;
  meta: {
    assessmentCount: number;
    problemCount: number;
    filterSemanticKey?: string;
  };
}
