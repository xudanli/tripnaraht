import type { OntologyCanonicalApplyService } from '../services/ontology-canonical-apply.service';
import type { TravelWorldFact } from '../contracts/travel-world-fact.types';
import {
  annotateWeatherAssessmentWithProblem,
  buildWeatherDecisionProblem,
  buildWeatherRootAssessment,
  shouldOpenWeatherUserDecision,
} from './weather-decision.builder';
import { assertWeatherDeteriorationSemanticEnabled } from './weather-deterioration.kill-switch';
import type {
  WeatherLoopResult,
  WeatherPlanView,
  WeatherRepairCandidate,
  WeatherWarningObservation,
} from './weather-deterioration.types';
import { resolveWeatherPlanImpact } from './weather-plan-impact.resolver';
import { ensureVehicleClassFact, buildWeatherRepairCandidates } from './weather-repair.proposals';
import {
  applyWeatherFactLifecycle,
  ensureRouteExposureFacts,
  expireStaleWeatherFacts,
  weatherWarningObservationToTravelWorldFact,
} from './weather-warning-to-travel-world-fact.adapter';
import { buildWeatherDeteriorationDecisionScope } from './build-weather-deterioration-decision-scope';

export function ingestWeatherWarningObservations(input: {
  existingFacts: TravelWorldFact[];
  observations: WeatherWarningObservation[];
  exposedSegmentIds?: string[];
  nowMs?: number;
}): TravelWorldFact[] {
  const nowMs = input.nowMs ?? Date.now();
  let facts = expireStaleWeatherFacts(input.existingFacts, nowMs);
  for (const obs of input.observations) {
    const next = weatherWarningObservationToTravelWorldFact(obs);
    facts = applyWeatherFactLifecycle(facts, next, nowMs);
  }
  if (input.exposedSegmentIds?.length) {
    facts = ensureRouteExposureFacts(
      facts,
      input.exposedSegmentIds,
      input.observations[0]?.observedAt ?? new Date(nowMs).toISOString(),
    );
  }
  return facts;
}

export function runWeatherDeteriorationDetection(input: {
  tripId: string;
  plan: WeatherPlanView;
  existingFacts?: TravelWorldFact[];
  observations: WeatherWarningObservation[];
  nowMs?: number;
}): WeatherLoopResult {
  assertWeatherDeteriorationSemanticEnabled();
  const nowMs = input.nowMs ?? Date.now();
  const exposed = input.plan.segments
    .filter((s) => s.windExposed)
    .map((s) => s.segmentId);
  let facts = ingestWeatherWarningObservations({
    existingFacts: input.existingFacts ?? [],
    observations: input.observations,
    exposedSegmentIds: exposed,
    nowMs,
  });
  facts = ensureVehicleClassFact(
    facts,
    input.plan,
    input.observations[0]?.observedAt ?? new Date(nowMs).toISOString(),
  );
  const impact = resolveWeatherPlanImpact({
    facts,
    plan: { ...input.plan, tripId: input.tripId },
    nowMs,
  });
  if (!impact || impact.productBehavior === 'WORLD_STATE_ONLY') {
    return {
      facts,
      assessment: null,
      decisionProblem: null,
      impact,
      repairCandidates: [],
    };
  }
  if (
    impact.productBehavior === 'MONITORING' &&
    !shouldOpenWeatherUserDecision(input.plan, impact)
  ) {
    return {
      facts,
      assessment: null,
      decisionProblem: null,
      impact,
      repairCandidates: [],
    };
  }
  let assessment = buildWeatherRootAssessment({
    tripId: input.tripId,
    revision: input.plan.revision,
    facts,
    nowMs,
  });
  const decisionProblem = buildWeatherDecisionProblem({
    tripId: input.tripId,
    assessment,
    impact,
  });
  assessment = annotateWeatherAssessmentWithProblem(assessment, decisionProblem);
  const repairCandidates =
    decisionProblem != null
      ? buildWeatherRepairCandidates({
          tripId: input.tripId,
          plan: input.plan,
          facts,
          assessment,
          impact,
        })
      : [];

  if (!decisionProblem) {
    return { facts, assessment, decisionProblem, impact, repairCandidates };
  }

  const bound = buildWeatherDeteriorationDecisionScope({
    tripId: input.tripId,
    plan: input.plan,
    impact,
    facts,
    nowMs,
  });

  return {
    facts,
    assessment,
    decisionProblem,
    impact,
    repairCandidates,
    decisionScope: bound.decisionScope,
    worldStateSnapshotId: bound.worldStateSnapshotId,
  };
}

/**
 * Apply via OntologyCanonicalApply seal; executeMutation must be injected by caller
 * to Decision Problem / UWC / DecisionCore — default stub only records proposal id.
 */
export async function applyWeatherDeteriorationRepair(input: {
  tripId: string;
  detection: WeatherLoopResult;
  candidate: WeatherRepairCandidate;
  canonicalApply: OntologyCanonicalApplyService;
  consumer?: 'decision' | 'repair' | 'exploration' | 'agent' | 'tep' | 'monitoring';
  executeMutation?: () => Promise<{ changedPlanVersion?: string }>;
}): Promise<WeatherLoopResult> {
  assertWeatherDeteriorationSemanticEnabled();
  if (!input.detection.assessment || !input.detection.decisionProblem) {
    throw new Error('ONT-P1: no open weather decision to apply');
  }
  if (!input.candidate.secondaryValidation.safeToOffer) {
    throw new Error('ONT-P1: weather repair failed secondary validation');
  }
  if (input.candidate.secondaryValidation.verified !== false) {
    throw new Error('ONT-P1: weather repair must not be auto-VERIFIED');
  }
  const revisionBefore = input.candidate.actionProposal.basedOnRevision;
  const result = await input.canonicalApply.applyAdopt({
    tripId: input.tripId,
    consumer: input.consumer ?? 'repair',
    action: input.candidate.actionProposal,
    sourceAssessment: input.detection.assessment,
    contextId: `tcs_${input.tripId}_${revisionBefore}`,
    authorityRunId: `run_p1_wx_${input.tripId}_${Date.now()}`,
    currentRevision: revisionBefore,
    factsAfterMutation: input.candidate.factsAfter,
    executeMutation:
      input.executeMutation ??
      (async () => ({ changedPlanVersion: input.candidate.proposalId })),
  });
  return {
    ...input.detection,
    applied: {
      outcomeEventId: result.outcomeEvent.outcomeEventId,
      revisionBefore,
      revisionAfter: result.outputRevision,
      assessmentIdBefore: input.detection.assessment.assessmentId,
      assessmentIdAfter: result.nextAssessment.assessmentId,
      outcomeAfter: result.nextAssessment.outcome,
    },
  };
}
