import { createHash } from 'crypto';
import {
  ACTION_PROPOSAL_SCHEMA_ID,
  type ActionProposal,
} from '../contracts/action-proposal.types';
import type { ConstraintAssessment } from '../contracts/constraint-assessment.types';
import {
  TRAVEL_WORLD_FACT_SCHEMA_ID,
  type TravelWorldFact,
} from '../contracts/travel-world-fact.types';
import { evaluateOntologyConstraints } from '../evaluators/ontology-constraint.evaluator';
import { mergeConstraintOutcomes } from '../contracts/constraint-assessment.types';
import type {
  WeatherPlanImpact,
  WeatherPlanView,
  WeatherRepairCandidate,
} from './weather-deterioration.types';

function mapSeverity(
  severity: string,
): ConstraintAssessment['outcome'] {
  if (severity === 'BLOCK') return 'BLOCK';
  if (severity === 'WARNING') return 'WARNING';
  if (severity === 'MISSING_EVIDENCE') return 'NEED_CONFIRM';
  return 'UNKNOWN';
}

export function ensureVehicleClassFact(
  facts: TravelWorldFact[],
  plan: WeatherPlanView,
  observedAt: string,
): TravelWorldFact[] {
  if (!plan.vehicleClass) return facts;
  const subjectId = `trip_${plan.tripId}_vehicle`;
  if (
    facts.some(
      (f) =>
        f.subjectType === 'RentalVehicle' &&
        f.predicate === 'mobility.vehicleClass',
    )
  ) {
    return facts;
  }
  return [
    ...facts,
    {
      schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
      factId: `fact_veh_${createHash('sha256').update(subjectId).digest('hex').slice(0, 12)}`,
      subjectType: 'RentalVehicle',
      subjectId,
      predicate: 'mobility.vehicleClass',
      value: plan.vehicleClass,
      scope: { tripId: plan.tripId, country: 'IS' },
      authorityLevel: 'USER_DECLARATION',
      source: { provider: 'weather-plan-view' },
      observedAt,
      confidence: 0.9,
      freshness: 'FRESH',
      verificationStatus: 'UNVERIFIED',
    },
  ];
}

function secondaryValidate(factsAfter: TravelWorldFact[]): WeatherRepairCandidate['secondaryValidation'] {
  const evaluation = evaluateOntologyConstraints(factsAfter);
  const outcomes = evaluation.results.map((r) => mapSeverity(r.severity));
  const outcome = mergeConstraintOutcomes(outcomes);
  return {
    outcome,
    reasonCodes: evaluation.results.map((r) => r.code),
    safeToOffer: outcome !== 'BLOCK',
    verified: false,
  };
}

function buildAction(
  assessment: ConstraintAssessment,
  revision: number,
  kind: WeatherRepairCandidate['kind'],
  planMutations: ActionProposal['expectedDelta']['planMutations'],
  factMutations: ActionProposal['expectedDelta']['factMutations'],
): ActionProposal {
  return {
    schemaId: ACTION_PROPOSAL_SCHEMA_ID,
    actionId: `act_wx_${kind}_${assessment.assessmentId.slice(0, 8)}`,
    assessmentId: assessment.assessmentId,
    basedOnRevision: revision,
    preconditions: [
      { type: 'ASSESSMENT_OUTCOME', assessmentId: assessment.assessmentId },
      { type: 'REVISION_MATCH', expectedRevision: revision },
    ],
    expectedDelta: {
      planMutations,
      factMutations,
      invalidatedAssessmentIds: [assessment.assessmentId],
    },
    requiresAuthorization: true,
    reevaluationScopes: ['WEATHER_DETERIORATION'],
    idempotencyKey: `wx_${kind}_${assessment.assessmentId}_${revision}`,
  };
}

export function buildWeatherRepairCandidates(input: {
  tripId: string;
  plan: WeatherPlanView;
  facts: TravelWorldFact[];
  assessment: ConstraintAssessment;
  impact: WeatherPlanImpact;
}): WeatherRepairCandidate[] {
  const candidates: WeatherRepairCandidate[] = [];
  const revision = input.plan.revision;

  if (input.impact.impacts.some((i) => i.kind === 'HIGH_ROOF_VEHICLE')) {
    const factsAfter = input.facts.map((f) =>
      f.predicate === 'mobility.vehicleClass'
        ? { ...f, value: 'STANDARD_SUV' }
        : f,
    );
    candidates.push({
      proposalId: `rep_downgrade_${input.tripId}`,
      label: '降级为非高顶车辆',
      kind: 'DOWNGRADE_VEHICLE',
      factsAfter,
      secondaryValidation: secondaryValidate(factsAfter),
      actionProposal: buildAction(
        input.assessment,
        revision,
        'DOWNGRADE_VEHICLE',
        [{ op: 'REPLACE_VEHICLE', payload: { vehicleClass: 'STANDARD_SUV' } }],
        [],
      ),
    });
  }

  if (input.impact.matchedSegmentIds.length > 0) {
    const avoidId = input.impact.matchedSegmentIds[0]!;
    const factsAfter = input.facts.filter(
      (f) => !(f.subjectType === 'RouteSegment' && f.subjectId === avoidId),
    );
    candidates.push({
      proposalId: `rep_avoid_${avoidId}`,
      label: `避开暴露路段 ${avoidId}`,
      kind: 'AVOID_EXPOSED_SEGMENT',
      factsAfter,
      secondaryValidation: secondaryValidate(factsAfter),
      actionProposal: buildAction(
        input.assessment,
        revision,
        'AVOID_EXPOSED_SEGMENT',
        [{ op: 'REPLACE_ROUTE', targetId: avoidId }],
        [],
      ),
    });
  }

  if (input.impact.timeline.lastActionBy || input.impact.timeline.onsetAt) {
    candidates.push({
      proposalId: `rep_shift_${input.tripId}`,
      label: '提前出发 / 压缩停留',
      kind: 'SHIFT_DEPARTURE',
      factsAfter: input.facts,
      secondaryValidation: secondaryValidate(input.facts),
      actionProposal: buildAction(
        input.assessment,
        revision,
        'SHIFT_DEPARTURE',
        [{ op: 'PATCH_ACTIVITY', payload: { shiftMinutes: -40 } }],
        [],
      ),
    });
  }

  return candidates.filter((c) => c.secondaryValidation.safeToOffer);
}
