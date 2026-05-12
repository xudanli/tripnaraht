import type { OpsRealityOutcomePayloadV1 } from '../observability/ops-reality-audit-payload';
import {
  FAILURE_ONTOLOGY_SCHEMA,
  OPS_REALITY_OUTCOME_EXTENSION_KEY,
  type FailureOntologyRecordV1,
  type FailureRootCause,
  type TripFailureType,
  isFailureOntologyRecordV1,
  isFailureObservedDomain,
  isFailureRootCause,
  isTripFailureType,
} from './failure-ontology.types';

/** Default empty extensions object for outcome payloads. */
function ensureExtensions(
  outcome: OpsRealityOutcomePayloadV1,
): Record<string, unknown> {
  if (!outcome.extensions || typeof outcome.extensions !== 'object') {
    return {};
  }
  return { ...(outcome.extensions as Record<string, unknown>) };
}

/**
 * Read structured failure ontology from an outcome payload (if present and valid).
 */
export function parseFailureOntologyFromOutcome(
  outcome: OpsRealityOutcomePayloadV1 | null | undefined,
): FailureOntologyRecordV1 | null {
  if (!outcome?.extensions || typeof outcome.extensions !== 'object') {
    return null;
  }
  const raw = (outcome.extensions as Record<string, unknown>)[OPS_REALITY_OUTCOME_EXTENSION_KEY];
  return isFailureOntologyRecordV1(raw) ? raw : null;
}

/**
 * Attach or replace failure ontology on `outcome.extensions` immutably.
 */
export function mergeFailureOntologyIntoOutcome(
  outcome: OpsRealityOutcomePayloadV1,
  record: FailureOntologyRecordV1,
): OpsRealityOutcomePayloadV1 {
  const extensions = ensureExtensions(outcome);
  return {
    ...outcome,
    extensions: {
      ...extensions,
      [OPS_REALITY_OUTCOME_EXTENSION_KEY]: {
        ...record,
        schema: FAILURE_ONTOLOGY_SCHEMA,
      },
    },
  };
}

/**
 * Normalize API / telemetry JSON into a record (strict enums).
 */
export function coerceFailureOntologyPayload(raw: Record<string, unknown>): FailureOntologyRecordV1 | null {
  const primary = raw.primary_failure_type;
  if (typeof primary !== 'string' || !isTripFailureType(primary)) {
    return null;
  }

  const domainIn = raw.observed_domain;
  if (typeof domainIn !== 'string' || !isFailureObservedDomain(domainIn)) {
    return null;
  }

  const sev = raw.severity;
  if (sev !== 'low' && sev !== 'medium' && sev !== 'high' && sev !== 'critical') {
    return null;
  }

  const rootsIn = raw.root_causes;
  let root_causes: FailureRootCause[] = Array.isArray(rootsIn)
    ? rootsIn.filter((x): x is FailureRootCause => typeof x === 'string' && isFailureRootCause(x))
    : [];
  if (root_causes.length === 0) {
    root_causes = ['other'];
  }

  const contributing = raw.contributing_failure_types;
  const contributing_failure_types = Array.isArray(contributing)
    ? contributing.filter((x): x is TripFailureType => typeof x === 'string' && isTripFailureType(x))
    : undefined;

  const recovery = raw.recovery_patterns;
  const recovery_patterns = Array.isArray(recovery)
    ? recovery.filter((x): x is string => typeof x === 'string')
    : undefined;

  const narrative = raw.narrative;
  const linked = raw.linked_snapshot_id;

  return {
    schema: FAILURE_ONTOLOGY_SCHEMA,
    primary_failure_type: primary,
    contributing_failure_types:
      contributing_failure_types && contributing_failure_types.length > 0 ? contributing_failure_types : undefined,
    root_causes,
    recovery_patterns: recovery_patterns && recovery_patterns.length > 0 ? recovery_patterns : undefined,
    observed_domain: domainIn,
    severity: sev,
    linked_snapshot_id: typeof linked === 'string' ? linked : undefined,
    narrative: typeof narrative === 'string' ? narrative : undefined,
  };
}
