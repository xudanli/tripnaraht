/**
 * Loop 1 — Temporal causal forecast (wall-clock deadlines, not only current violation).
 *
 * Answers: when does it start / worsen / must act / what if we don't.
 */

export const TEMPORAL_IMPACT_SCHEMA = 'tripnara.temporal_impact@v1' as const;

export interface TemporalImpact {
  schema?: typeof TEMPORAL_IMPACT_SCHEMA;

  /** When the system first detected the emerging issue (ISO-8601). */
  detectedAt: string;

  /** When effects are expected to begin materializing. */
  expectedOnsetAt?: string;

  /** When severity is expected to cross a higher risk band. */
  deteriorationAt?: string;

  /** Latest wall-clock moment to choose an intervention. */
  interventionDeadline?: string;

  /** When the hazard / constraint window is expected to clear. */
  expectedResolutionAt?: string;

  /** 0–1 confidence in the temporal forecast. */
  confidence: number;

  /** Explicit assumptions the forecast depends on (auditable). */
  assumptions: string[];
}
