/**
 * P-Next 6 — evaluate(spec, field state) → graded semantic distances + violations.
 * Neptune core stays free of ad-hoc rules; this is the single semantic computation surface.
 */

import type { PhysicsFieldIndex } from '../physics/unified-physics-field-index.types';
import type { ExecutionOverlayFrame } from '../execution-overlay/execution-overlay-frame.types';
import type { ExecutionSemanticsSpec } from './execution-semantics-spec.types';
import type {
  SemanticEvaluation,
  SemanticEvaluationResult,
  SemanticViolation,
} from './semantic-evaluation.types';
import { SEMANTICS_PROFILE_DEFAULT_V1 } from './default-execution-semantics-v1';

export interface EvaluateExecutionSemanticsInput {
  physicsFieldIndex?: PhysicsFieldIndex | null;
  executionOverlayFrames?: ExecutionOverlayFrame[] | null;
  /** Optional replay hint when overlay frames are not materialized (proof verification). */
  daylightViolationLegIds?: string[];
  /** Defaults to {@link SEMANTICS_PROFILE_DEFAULT_V1} identity when omitted. */
  semanticsProfileId?: string;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * Pure semantic evaluation — deterministic given spec + index + overlay.
 */
export function evaluateExecutionSemantics(
  spec: ExecutionSemanticsSpec,
  input: EvaluateExecutionSemanticsInput,
): SemanticEvaluationResult {
  const profileId = input.semanticsProfileId ?? SEMANTICS_PROFILE_DEFAULT_V1;
  const byLeg = input.physicsFieldIndex?.byLegId ?? {};
  const overlayByLeg = new Map((input.executionOverlayFrames ?? []).map(f => [f.legId, f]));
  const daylightHints = new Set(input.daylightViolationLegIds ?? []);

  const temporalByLeg: Record<string, number> = {};
  const mobilityByLeg: Record<string, number> = {};
  const energyByLeg: Record<string, number> = {};
  const exposureByLeg: Record<string, number> = {};

  const violations: SemanticViolation[] = [];

  for (const [legId, row] of Object.entries(byLeg)) {
    const { softPressureCeiling, hardPressureCeiling } = spec.temporal;
    const p = row.stateVector.temporalPressure;
    let tDist = 0;
    if (p <= softPressureCeiling) {
      tDist = 0;
    } else if (p >= hardPressureCeiling) {
      tDist = 1;
    } else {
      tDist = (p - softPressureCeiling) / (hardPressureCeiling - softPressureCeiling);
    }
    const frame = overlayByLeg.get(legId);
    const daylightHit =
      frame?.temporal.daylightViolation === true || daylightHints.has(legId);
    if (daylightHit) {
      tDist = Math.max(tDist, 0.55);
    }
    temporalByLeg[legId] = clamp01(tDist);

    const mob = row.stateVector.mobility;
    if (row.derived === 'IMPASSABLE') {
      mobilityByLeg[legId] = 1;
    } else if (mob < spec.mobility.minMobilityExecutable) {
      mobilityByLeg[legId] = clamp01(
        (spec.mobility.minMobilityExecutable - mob) / spec.mobility.minMobilityExecutable,
      );
    } else {
      mobilityByLeg[legId] = 0;
    }

    const en = row.stateVector.energy;
    if (en < spec.energy.minEnergyReserve) {
      energyByLeg[legId] = clamp01((spec.energy.minEnergyReserve - en) / spec.energy.minEnergyReserve);
    } else {
      energyByLeg[legId] = 0;
    }

    const ex = row.stateVector.exposure;
    if (ex > spec.exposure.maxExposureComfort) {
      exposureByLeg[legId] = clamp01(
        (ex - spec.exposure.maxExposureComfort) / (1 - spec.exposure.maxExposureComfort),
      );
    } else {
      exposureByLeg[legId] = 0;
    }
  }

  const evaluations: SemanticEvaluation[] = [
    {
      domain: 'TEMPORAL',
      byLegId: temporalByLeg,
      aggregateDistance: mean(Object.values(temporalByLeg)),
    },
    {
      domain: 'ROUTE',
      byLegId: mobilityByLeg,
      aggregateDistance: mean(Object.values(mobilityByLeg)),
    },
    {
      domain: 'FUEL',
      byLegId: energyByLeg,
      aggregateDistance: mean(Object.values(energyByLeg)),
    },
    {
      domain: 'WEATHER',
      byLegId: exposureByLeg,
      aggregateDistance: mean(Object.values(exposureByLeg)),
    },
  ];

  const violationThreshold = 0.25;
  for (const ev of evaluations) {
    for (const [legId, deg] of Object.entries(ev.byLegId)) {
      if (deg >= violationThreshold) {
        violations.push({
          domain: ev.domain,
          legId,
          degree: deg,
          ruleId: `SEMANTIC_${ev.domain}_DISTANCE`,
        });
      }
    }
  }

  const semanticAggregateDistance = mean(evaluations.map(e => e.aggregateDistance));

  return {
    semanticsProfileId: profileId,
    semanticsVersion: spec.semanticsVersion,
    evaluations,
    violations,
    semanticAggregateDistance,
  };
}
