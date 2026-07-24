/**
 * RFC-001 Phase 0 — authorization and utility evaluation.
 */

import type { ExternalSideEffect } from './entity-ref.types';

export type AuthorizationLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export interface AuthorizationRequirement {
  level: AuthorizationLevel;
  requiresUserConfirmation: boolean;
  requiresGroupConfirmation?: boolean;
  requiresOperatorReview?: boolean;
  reasons: string[];
  externalSideEffects: ExternalSideEffect[];
}

export interface UtilityVector {
  experienceValue: number;
  intentPreservation: number;
  fatigueCost: number;
  monetaryCost: number;
  timeStress: number;
  residualRisk: number;
  reversibility: number;
}

export interface UtilityEvaluation {
  candidateId: string;
  utility: number;
  vector: UtilityVector;
  uncertaintyBand?: { low: number; high: number };
  dominatedBy?: string[];
}

export interface RejectedCandidate {
  candidateId: string;
  reasonCodes: string[];
  rejectedBy: 'HARD_CONSTRAINT' | 'DOMINATED' | 'INCOMPLETE_ASSESSMENT' | 'POLICY';
}
