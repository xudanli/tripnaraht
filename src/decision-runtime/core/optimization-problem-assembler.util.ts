/**
 * Build OptimizationProblem from snapshot, candidates, and Gateway reports.
 */

import { randomUUID } from 'crypto';
import type { TripWorldState } from '../../trips/decision/world-model';
import type { DecisionCandidate, PlanningContext } from '../candidates/contracts/decision-candidate';
import type { CanonicalConstraintReport } from '../constraints/contracts/canonical-constraint-report';
import type { CanonicalWorldStateSnapshot } from '../contracts/world-state-snapshot';
import type {
  ConstraintEvaluation,
  ConstraintTier,
} from '../contracts/constraint-evaluation';
import type { OptimizationProblem } from '../contracts/optimization-problem';
import type { ObjectiveProfile } from '../contracts/objective-definition';
import { computeDataCompletenessScore } from '../snapshot/trip-world-to-canonical.util';
import {
  OBJECTIVE_REGISTRY_VERSION,
  buildDefaultObjectiveProfile,
} from '../objectives/objective-semantics.registry';
import { resolveObjectiveProfileFromTripMetadata } from '../../trips/trip-constraint-solver/utils/travel-decision-contract-runtime.util';

const CONSTRAINT_POLICY_VERSION = 'constraint-policy@v1';

export function assembleOptimizationProblem(input: {
  tripId: string;
  snapshot: CanonicalWorldStateSnapshot;
  candidates: DecisionCandidate[];
  constraintReportsByCandidateId: Record<string, CanonicalConstraintReport>;
  worldState: TripWorldState;
  context?: PlanningContext;
  problemId?: string;
  phase?: 'PLANNING' | 'EXECUTION';
  objectiveProfile?: ObjectiveProfile;
}): OptimizationProblem {
  const problemId = input.problemId ?? `opt_${input.tripId}_${Date.now()}`;
  const primaryCandidate = input.candidates[0];
  const primaryReport =
    input.constraintReportsByCandidateId[primaryCandidate?.candidateId ?? ''] ??
    emptyReport(input.tripId);

  const poiCount = countPois(input.candidates);
  const dayCount = Math.max(
    ...input.candidates.map((c) => c.plan.days?.length ?? 0),
    1,
  );

  const objectiveProfile =
    input.objectiveProfile ??
    resolveObjectiveProfileFromContext(input.context, input.tripId);

  return {
    schemaId: 'tripnara.optimization_problem@v1',
    problemId,
    tripId: input.tripId,
    snapshotId: input.snapshot.snapshotId,
    createdAt: new Date().toISOString(),
    snapshot: input.snapshot,
    profile: {
      phase: input.phase ?? 'PLANNING',
      poiCount,
      dayCount,
      memberCount:
        (input.worldState.context as { partySize?: number } | undefined)?.partySize ??
        (input.worldState as { human?: { partySize?: number } }).human?.partySize ??
        1,
      enabledObjectiveCount: objectiveProfile.enabledObjectives.length,
      dataCompleteness: computeDataCompletenessScore(input.snapshot.completeness),
    },
    objectiveProfile,
    candidates: input.candidates,
    baseCandidateId: input.context?.materializeFromTripPlan ? 'original' : primaryCandidate?.candidateId,
    constraintReport: primaryReport,
    constraintReportsByCandidateId: input.constraintReportsByCandidateId,
    mandatoryEvaluations: extractMandatoryEvaluations(
      Object.values(input.constraintReportsByCandidateId),
    ),
    objectiveRegistryVersion: OBJECTIVE_REGISTRY_VERSION,
    constraintPolicyVersion: CONSTRAINT_POLICY_VERSION,
    materializeFromTripPlan: input.context?.materializeFromTripPlan === true,
  };
}

function countPois(candidates: DecisionCandidate[]): number {
  const ids = new Set<string>();
  for (const c of candidates) {
    for (const day of c.plan.days ?? []) {
      for (const slot of day.timeSlots ?? []) {
        if (slot.poiId) ids.add(slot.poiId);
      }
    }
  }
  return ids.size;
}

function emptyReport(tripId: string): CanonicalConstraintReport {
  return {
    schemaId: 'tripnara.canonical_constraint_report@v1',
    tripId,
    evaluatedAt: new Date().toISOString(),
    assertions: [],
    completeness: {
      roads: 'MISSING',
      weather: 'MISSING',
      hazards: 'MISSING',
      ferries: 'MISSING',
      openingHours: 'MISSING',
    },
    overallStatus: 'UNVERIFIED',
    degraded: false,
    degradedReasons: [],
  };
}

function extractMandatoryEvaluations(
  reports: CanonicalConstraintReport[],
): ConstraintEvaluation[] {
  const seen = new Set<string>();
  const out: ConstraintEvaluation[] = [];

  for (const report of reports) {
    for (const assertion of report.assertions) {
      if (assertion.overridable !== false) continue;
      if (assertion.status !== 'BLOCK' && assertion.status !== 'REQUIRES_VERIFICATION') {
        continue;
      }
      const key = `${assertion.constraintType}:${assertion.reasonCode}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        constraintId: assertion.assertionId,
        constraintType: assertion.constraintType,
        tier: inferTier(assertion.constraintType, assertion.severity),
        evaluationStatus: assertion.status,
        evidenceStatus: 'MISSING',
        actionPolicy:
          assertion.status === 'BLOCK' ? 'REJECT' : 'VERIFY',
        riskLevel: mapSeverity(assertion.severity),
        mandatory: true,
        relaxable: false,
        severity: assertion.severity,
        scope: assertion.scope,
        reasonCode: assertion.reasonCode,
        message: assertion.message,
        evidenceRefs: assertion.evidenceRefs.map((id) => ({
          id,
          evidenceSource: 'assertion',
          observedAt: report.evaluatedAt,
        })),
        evaluator: assertion.evaluator,
        confidence: assertion.confidence,
      });
    }
  }
  return out;
}

function inferTier(constraintType: string, severity: string): ConstraintTier {
  const t = constraintType.toLowerCase();
  if (
    t.includes('road') ||
    t.includes('safety') ||
    t.includes('weather') ||
    severity === 'CRITICAL'
  ) {
    return 'L1';
  }
  if (t.includes('budget') || t.includes('load') || t.includes('drive')) {
    return 'L2';
  }
  return 'L3';
}

function mapSeverity(
  severity: string,
): ConstraintEvaluation['riskLevel'] {
  if (severity === 'CRITICAL') return 'CRITICAL';
  if (severity === 'HIGH') return 'HIGH';
  if (severity === 'MEDIUM') return 'MEDIUM';
  return 'LOW';
}

export function newOptimizationTraceId(): string {
  return `trace_${randomUUID()}`;
}

function resolveObjectiveProfileFromContext(
  context: PlanningContext | undefined,
  tripId: string,
): ObjectiveProfile {
  if (!context?.tripMetadata || typeof context.tripMetadata !== 'object') {
    return buildDefaultObjectiveProfile();
  }

  const metadata = context.tripMetadata as Record<string, unknown>;
  const pacing =
    context.pacingConfig && typeof context.pacingConfig === 'object'
      ? (context.pacingConfig as Record<string, unknown>)
      : {};

  return resolveObjectiveProfileFromTripMetadata({
    tripId,
    constraintsVersion:
      typeof metadata.constraintsVersion === 'number' ? metadata.constraintsVersion : undefined,
    metadata,
    pacing,
  });
}
