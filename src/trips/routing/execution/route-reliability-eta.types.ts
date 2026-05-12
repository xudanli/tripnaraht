/**
 * P4-C Reliability-aware ETA — duration as a distribution, not a single scalar.
 */

export interface ReliabilityAwareEta {
  optimisticMinutes: number;
  expectedMinutes: number;
  pessimisticMinutes: number;
  /** 0–1 — aligns with RouteExecutionAssessment.executionReliability when sourced together. */
  reliabilityScore: number;
}
