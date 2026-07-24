import { AXIOM_VALIDATION_REGISTRY, type AxiomId } from './axiom-schema';

/** Minimal match shape for evidence validation (avoids circular import with matchers). */
export interface ValidatableAxiomMatch {
  axiom_id: AxiomId;
  evidence?: {
    metric_details?: Record<string, unknown>;
    proof_payload?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null;
}

/**
 * Environment-aware evidence contract check.
 * - test (Jest): throw — forces complete fixtures in CI
 * - development: console.warn — does not block local debugging
 * - other: no-op
 */
export function validateAxiomMatchResult(result: ValidatableAxiomMatch | null | undefined): void {
  if (!result) return;

  const rule = AXIOM_VALIDATION_REGISTRY[result.axiom_id];
  if (!rule) return;

  const metricDetails = result.evidence?.metric_details as Record<string, unknown> | undefined;
  const proofPayload = result.evidence?.proof_payload as Record<string, unknown> | undefined;

  const missingMetrics = rule.requiredMetricFields.filter((f) =>
    isMissing(metricDetails?.[String(f)]),
  );
  const missingPayload = rule.requiredPayloadFields.filter((f) =>
    isMissing(proofPayload?.[f]),
  );

  if (missingMetrics.length === 0 && missingPayload.length === 0) return;

  const errorMsg =
    `[AxiomValidationError] ${result.axiom_id} evidence incomplete.\n` +
    `Missing metric_details: ${JSON.stringify(missingMetrics)}\n` +
    `Missing proof_payload: ${JSON.stringify(missingPayload)}`;

  if (process.env.NODE_ENV === 'test') {
    throw new Error(errorMsg);
  }
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.warn(`\x1b[33m%s\x1b[0m`, errorMsg);
  }
}
