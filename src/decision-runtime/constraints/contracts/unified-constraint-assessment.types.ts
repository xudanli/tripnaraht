/**
 * Unified Constraint Assessment read model — one view per constraintKey.
 * @see internal-docs/product/CONSTRAINT-CAPABILITY-REGISTRY-PHASE0.md §2
 */

import type { ConstraintEvaluationStatus } from './constraint-assertion';
import type { EvaluationContextVersion } from './evaluation-context-version.types';

export const UNIFIED_CONSTRAINT_ASSESSMENT_BUNDLE_SCHEMA =
  'tripnara.unified_constraint_assessment_bundle@v1' as const;

export type UnifiedAssessmentLaneKind = 'planning' | 'executability' | 'runtime';

export type UnifiedAssessmentAggregateStatus =
  | 'PASS'
  | 'WARN'
  | 'PLANNING_BLOCK'
  | 'EXECUTION_BLOCK'
  | 'RUNTIME_BLOCK'
  | 'UNKNOWN';

export interface UnifiedConstraintAssessmentEvidence {
  day?: number;
  dayIndex?: number;
  actual?: string;
  limit?: string;
  measuredMinutes?: number;
  ruleId?: string;
  message?: string;
  affectedRefs?: string[];
  segmentLabel?: string;
  sunsetLocal?: string;
  cutoffLocal?: string;
  arriveLocal?: string;
  departLocal?: string;
  civilDuskLocal?: string;
  maxMinutesAfterSunset?: number;
  degradationReason?: string;
}

export interface UnifiedConstraintAssessmentLane {
  status: ConstraintEvaluationStatus;
  source: 'FEASIBILITY' | 'TEP' | 'RUNTIME';
  ruleId?: string;
  message?: string;
  assessmentId?: string;
  evidence?: UnifiedConstraintAssessmentEvidence;
  problemIds?: string[];
}

export interface UnifiedConstraintAssessmentView {
  constraintKey: string;
  legacyConstraintId?: string;
  contractRequirement?: string;
  contextVersion: EvaluationContextVersion;
  evaluatedAt: string;
  lanes: {
    planning: UnifiedConstraintAssessmentLane | null;
    executability: UnifiedConstraintAssessmentLane | null;
    runtime: UnifiedConstraintAssessmentLane | null;
  };
  aggregateStatus: UnifiedAssessmentAggregateStatus;
  problemIds?: string[];
}

export interface UnifiedConstraintAssessmentBundle {
  schemaId: typeof UNIFIED_CONSTRAINT_ASSESSMENT_BUNDLE_SCHEMA;
  tripId: string;
  generatedAt: string;
  contextVersion: EvaluationContextVersion;
  items: UnifiedConstraintAssessmentView[];
  meta: {
    itemCount: number;
    planVersionRef?: string;
  };
}
