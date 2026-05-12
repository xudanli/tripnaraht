/**
 * P-OPS-2 — canonical prediction payload for reality audit (overlay + weather summary + plan digest).
 * Fingerprint is SHA-256 of stable JSON (sorted keys) for diff / dedup in replay tooling.
 */

import { createHash } from 'crypto';
import { EXECUTION_OVERLAY_SCHEMA_VERSION } from '../../execution-overlay/execution-overlay-frame.types';
import type { ExecutionOverlayFrame } from '../../execution-overlay/execution-overlay-frame.types';
import type { TripPlan } from '../plan-model';
import type { WeatherEvidencePipelineResult } from '../interfaces/weather-decision-evidence.interface';

export const OPS_REALITY_AUDIT_SCHEMA = 'p-ops-2/v1' as const;
export const OPS_REALITY_OUTCOME_SCHEMA = 'p-ops-2-outcome/v1' as const;

export type OpsRealityPredictionLegV1 = {
  legId: string;
  finalExecutionState: string;
  unifiedDelayMinutes: number;
  weatherSeverity: string;
  roadBlocked: boolean;
  fRoadConstraint: boolean;
  reliabilityScore: number;
};

export type OpsRealityPredictionPayloadV1 = {
  schema: typeof OPS_REALITY_AUDIT_SCHEMA;
  capturedAtIso: string;
  overlaySchemaVersion: typeof EXECUTION_OVERLAY_SCHEMA_VERSION;
  legs: OpsRealityPredictionLegV1[];
  weatherPipeline?: {
    hasHardViolation: boolean;
    hasSoftViolation: boolean;
    canProceed: boolean;
    segmentCount: number;
  };
  planDigest: {
    version?: string;
    dayDates: string[];
    slotCount: number;
  };
};

export type OpsRealityOutcomePayloadV1 = {
  schema: typeof OPS_REALITY_OUTCOME_SCHEMA;
  recordedAtIso: string;
  /** Short human or machine summary of observed execution vs prediction */
  summary: string;
  delta?: {
    legMismatches?: number;
    hardWeatherRealized?: boolean;
    notes?: string;
  };
  /**
   * Attach telemetry ids, trace refs, etc.
   * Conventions (auto-filled by API when absent):
   * - `trip_run_id` — `trip_runs.id` (Agent durable run)
   * - `execution_trace_id` — request / distributed trace id
   * - `decision_causality_id` — joins `DecisionCausalityRecordV0.causality_id` (Policy→Plan→Execution spine)
   * - `observation_export` — {@link OpsRealityObservationExportV1} for offline replay fingerprint compare
   * - `failure_ontology` — structured execution failure (L6); see `failure-ontology.types.ts` /
   *   {@link import('../failure-ontology/failure-ontology.types').OPS_REALITY_OUTCOME_EXTENSION_KEY}
   */
  extensions?: Record<string, unknown>;
};

/** Exported observed legs digest (same leg fields as prediction) for replay/compare jobs. */
export const OPS_REALITY_OBSERVATION_EXPORT_SCHEMA = 'p-ops-2-obs-export/v1' as const;

export type OpsRealityObservationExportV1 = {
  schema: typeof OPS_REALITY_OBSERVATION_EXPORT_SCHEMA;
  legs: OpsRealityPredictionLegV1[];
  weatherPipeline?: OpsRealityPredictionPayloadV1['weatherPipeline'];
  planDigest: OpsRealityPredictionPayloadV1['planDigest'];
};

/** Fixed stub so fingerprints ignore decision-time `capturedAtIso` noise when comparing execution truth. */
export const OPS_REALITY_REPLAY_CAPTURE_STUB = 'REPLAY_COMPARE_STUB' as const;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((x) => stableStringify(x)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function computePredictionFingerprint(payload: OpsRealityPredictionPayloadV1): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

/**
 * Compare prediction vs observation on legs + weather + planDigest only (ignores capturedAtIso).
 * Matches when offline export uses the same canonical fields as {@link buildOpsRealityPredictionPayload}.
 */
export function computeReplayComparableFingerprint(parts: {
  legs: OpsRealityPredictionLegV1[];
  weatherPipeline?: OpsRealityPredictionPayloadV1['weatherPipeline'];
  planDigest: OpsRealityPredictionPayloadV1['planDigest'];
}): string {
  const stub: OpsRealityPredictionPayloadV1 = {
    schema: OPS_REALITY_AUDIT_SCHEMA,
    capturedAtIso: OPS_REALITY_REPLAY_CAPTURE_STUB,
    overlaySchemaVersion: EXECUTION_OVERLAY_SCHEMA_VERSION,
    legs: [...parts.legs].sort((a, b) => a.legId.localeCompare(b.legId)),
    weatherPipeline: parts.weatherPipeline,
    planDigest: parts.planDigest,
  };
  return computePredictionFingerprint(stub);
}

export function computeReplayComparableFingerprintFromPredictionJson(predictionJson: unknown): string | null {
  if (!predictionJson || typeof predictionJson !== 'object') return null;
  const p = predictionJson as Partial<OpsRealityPredictionPayloadV1>;
  if (!Array.isArray(p.legs) || !p.planDigest || typeof p.planDigest !== 'object') return null;
  return computeReplayComparableFingerprint({
    legs: p.legs as OpsRealityPredictionLegV1[],
    weatherPipeline: p.weatherPipeline,
    planDigest: p.planDigest as OpsRealityPredictionPayloadV1['planDigest'],
  });
}

export function computeReplayComparableFingerprintFromObservationExport(
  observation: OpsRealityObservationExportV1,
): string {
  return computeReplayComparableFingerprint({
    legs: observation.legs,
    weatherPipeline: observation.weatherPipeline,
    planDigest: observation.planDigest,
  });
}

export function compareReplayFingerprints(
  predictionJson: unknown,
  observation: OpsRealityObservationExportV1,
): { match: boolean; fpPredictionComparable: string; fpObservationComparable: string } {
  const fpP = computeReplayComparableFingerprintFromPredictionJson(predictionJson);
  const fpO = computeReplayComparableFingerprintFromObservationExport(observation);
  if (fpP == null) {
    throw new TypeError('prediction JSON missing legs/planDigest');
  }
  return { match: fpP === fpO, fpPredictionComparable: fpP, fpObservationComparable: fpO };
}

export function parseObservationExportFromOutcomeExtensions(extensions: unknown): OpsRealityObservationExportV1 | null {
  if (!extensions || typeof extensions !== 'object' || Array.isArray(extensions)) return null;
  const ex = extensions as Record<string, unknown>;
  const raw = ex.observation_export ?? ex.observationExport;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.schema !== OPS_REALITY_OBSERVATION_EXPORT_SCHEMA) return null;
  if (!Array.isArray(o.legs) || !o.planDigest || typeof o.planDigest !== 'object') return null;
  return {
    schema: OPS_REALITY_OBSERVATION_EXPORT_SCHEMA,
    legs: o.legs as OpsRealityPredictionLegV1[],
    weatherPipeline: o.weatherPipeline as OpsRealityPredictionPayloadV1['weatherPipeline'] | undefined,
    planDigest: o.planDigest as OpsRealityPredictionPayloadV1['planDigest'],
  };
}

/**
 * Merge TripRun / trace refs into `outcome.extensions` without overwriting caller-supplied keys.
 */
export function mergeOutcomeTelemetryRefs(
  outcome: Record<string, unknown>,
  refs: { tripRunId?: string; executionTraceId?: string; causalityId?: string },
): Record<string, unknown> {
  const extIn = outcome.extensions;
  const ext =
    extIn && typeof extIn === 'object' && !Array.isArray(extIn)
      ? { ...(extIn as Record<string, unknown>) }
      : {};
  const tr = refs.tripRunId?.trim();
  const te = refs.executionTraceId?.trim();
  const dc = refs.causalityId?.trim();
  if (tr && ext['trip_run_id'] == null && ext['tripRunId'] == null) {
    ext['trip_run_id'] = tr;
  }
  if (te && ext['execution_trace_id'] == null && ext['executionTraceId'] == null) {
    ext['execution_trace_id'] = te;
  }
  if (dc && ext['decision_causality_id'] == null && ext['decisionCausalityId'] == null) {
    ext['decision_causality_id'] = dc;
  }
  return { ...outcome, extensions: ext };
}

export function buildOpsRealityPredictionPayload(params: {
  capturedAtIso: string;
  frames: ExecutionOverlayFrame[] | undefined;
  weatherPipeline: WeatherEvidencePipelineResult | undefined;
  plan: TripPlan;
}): OpsRealityPredictionPayloadV1 {
  const frames = params.frames ?? [];
  const legs: OpsRealityPredictionLegV1[] = [...frames]
    .sort((a, b) => a.legId.localeCompare(b.legId))
    .map((f) => ({
      legId: f.legId,
      finalExecutionState: String(f.finalExecutionState),
      unifiedDelayMinutes: f.unifiedDelayMinutes,
      weatherSeverity: String(f.weather?.severity ?? 'LOW'),
      roadBlocked: Boolean(f.road?.blocked),
      fRoadConstraint: Boolean(f.road?.fRoadConstraint),
      reliabilityScore: f.reliabilityScore,
    }));

  let slotCount = 0;
  for (const d of params.plan.days ?? []) {
    slotCount += (d.timeSlots ?? []).length;
  }

  const wp = params.weatherPipeline;
  const weatherPipeline = wp
    ? {
        hasHardViolation: wp.hasHardViolation,
        hasSoftViolation: wp.hasSoftViolation,
        canProceed: wp.canProceed,
        segmentCount: wp.segmentEvidences?.length ?? 0,
      }
    : undefined;

  return {
    schema: OPS_REALITY_AUDIT_SCHEMA,
    capturedAtIso: params.capturedAtIso,
    overlaySchemaVersion: EXECUTION_OVERLAY_SCHEMA_VERSION,
    legs,
    weatherPipeline,
    planDigest: {
      version: params.plan.version,
      dayDates: (params.plan.days ?? []).map((d) => d.date).sort(),
      slotCount,
    },
  };
}
