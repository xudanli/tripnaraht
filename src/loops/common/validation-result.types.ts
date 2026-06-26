export interface ValidationResult {
  passed: boolean;
  verifierSet: string[];
  hardBlockers?: number;
  readinessScore?: number;
  completionRateP10?: number;
  messages?: string[];
  evidenceRefs?: string[];
}
