/**
 * FE-facing candidate comparison — intent narrative + multi-dimension matrix.
 */

export type CandidateSafetyStatus = 'PASS' | 'WARN' | 'FAIL';

export type CandidatePaceLevel =
  | 'COMFORTABLE'
  | 'BALANCED'
  | 'STRETCHED'
  | 'OVERLOADED';

export interface CandidateOriginalIntentView {
  intentRefs: string[];
  /** User-facing labels, e.g. 黑沙海岸 · 摄影 · 荒野感 */
  labels: string[];
  narrative: string;
}

export interface CandidateComparisonDimensionView {
  status?: CandidateSafetyStatus | CandidatePaceLevel;
  label: string;
  note?: string;
}

export interface CandidateComparisonRowView {
  candidateId: string;
  schemeLabel: string;
  title: string;
  subtitle?: string;
  recommended: boolean;
  selectable: boolean;
  safety: CandidateComparisonDimensionView;
  pace: CandidateComparisonDimensionView;
  /** 0–1 */
  experienceRetention: number;
  experienceRetentionLabel: string;
  cost: { amount: number; currency: string; label: string };
  utility?: number;
  drivingDeltaMinutes?: number;
}

export interface CandidateRejectionView {
  candidateId: string;
  reasonCodes: string[];
  message: string;
}

export interface CandidateComparisonView {
  schemaId: 'tripnara.candidate_comparison@v1';
  originalIntent: CandidateOriginalIntentView;
  recommendedCandidateId?: string;
  rows: CandidateComparisonRowView[];
  rejections: CandidateRejectionView[];
  headline?: string;
}
