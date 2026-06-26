/**
 * Map P-OPS-2 outcome payload → P5 CausalOutcomeObservation.
 *
 * Preferred: `outcome.extensions.causal_observation` (explicit contract).
 * Fallback: observation_export legs + delta / failure hints.
 */

import type { OpsRealityOutcomePayloadV1 } from '../../decision/observability/ops-reality-audit-payload';
import { parseObservationExportFromOutcomeExtensions } from '../../decision/observability/ops-reality-audit-payload';
import type { CausalOutcomeObservation } from './causal-counterfactual.types';

export const CAUSAL_OBSERVATION_EXTENSION_SCHEMA = 'tripnara/causal-observation/v1' as const;

export interface CausalObservationExtension {
  schema: typeof CAUSAL_OBSERVATION_EXTENSION_SCHEMA;
  metrics: Record<string, number>;
  missed_appointment?: boolean;
  narrative?: string;
  mechanism_evidence?: string[];
}

function parseExplicitExtension(outcome: OpsRealityOutcomePayloadV1): CausalOutcomeObservation | null {
  const ext = outcome.extensions;
  if (!ext || typeof ext !== 'object' || Array.isArray(ext)) return null;

  const raw =
    (ext as Record<string, unknown>).causal_observation ??
    (ext as Record<string, unknown>).causalObservation;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const obs = raw as Partial<CausalObservationExtension>;
  if (obs.schema !== CAUSAL_OBSERVATION_EXTENSION_SCHEMA) return null;
  if (!obs.metrics || typeof obs.metrics !== 'object') return null;

  return {
    metrics: obs.metrics as Record<string, number>,
    missedAppointment: obs.missed_appointment,
    narrative: obs.narrative ?? outcome.summary,
    mechanismEvidence: obs.mechanism_evidence,
  };
}

function inferFromObservationExport(
  outcome: OpsRealityOutcomePayloadV1,
): CausalOutcomeObservation | null {
  const observation = parseObservationExportFromOutcomeExtensions(outcome.extensions);
  if (!observation?.legs?.length) return null;

  const maxDelay = Math.max(...observation.legs.map((l) => l.unifiedDelayMinutes ?? 0));
  const blocked = observation.legs.some((l) => l.roadBlocked || l.fRoadConstraint);
  const metrics: Record<string, number> = {};

  if (maxDelay > 0) {
    metrics.iceland_p90_minutes = maxDelay;
  }
  if (outcome.delta?.hardWeatherRealized) {
    metrics.iceland_miss_prob = 0.85;
  }

  const missedAppointment =
    blocked ||
    outcome.delta?.hardWeatherRealized === true ||
    observation.legs.some((l) => String(l.finalExecutionState).includes('BLOCK'));

  if (!Object.keys(metrics).length && !missedAppointment) return null;

  return {
    metrics,
    missedAppointment: missedAppointment || undefined,
    narrative: outcome.summary,
    mechanismEvidence: blocked ? ['road:blocked'] : undefined,
  };
}

export function extractCausalObservationFromOpsOutcome(
  outcome: OpsRealityOutcomePayloadV1,
): CausalOutcomeObservation | null {
  return parseExplicitExtension(outcome) ?? inferFromObservationExport(outcome);
}
