import type { OntologyConstraints } from '../nl-clarification/ontology-constraints.types';

export interface ConflictReason {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface FeasibilityResult {
  isPossible: boolean;
  conflictReason?: ConflictReason;
  suggestedActions?: string[];
  suggestedClarifications?: Array<{
    field: string;
    question: string;
    options?: Array<{ value: string; label: string }>;
  }>;
}

/**
 * SkeletonPlan：求解器产出的“物理可行骨架”
 * v0 只定义最小字段，便于逐步替换现有 Draft 引擎。
 */
export interface SkeletonPlan {
  version: '0';
  destinationCode?: string;
  days?: number;
  constraints?: OntologyConstraints;
  // 后续可扩展：timeSlots、segments、poiSlots、budgetEnvelopes 等
  [key: string]: unknown;
}

