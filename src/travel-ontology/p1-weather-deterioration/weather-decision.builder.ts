import { createHash } from 'crypto';
import { buildConstraintAssessment } from '../contracts/build-constraint-assessment';
import type { ConstraintAssessment } from '../contracts/constraint-assessment.types';
import type { TravelWorldFact } from '../contracts/travel-world-fact.types';
import { evaluateOntologyConstraints } from '../evaluators/ontology-constraint.evaluator';
import {
  WEATHER_DETERIORATION_SEMANTIC,
  type WeatherDecisionProblem,
  type WeatherPlanImpact,
  type WeatherPlanView,
} from './weather-deterioration.types';

export function shouldOpenWeatherUserDecision(
  plan: WeatherPlanView,
  impact: WeatherPlanImpact,
): boolean {
  if (impact.productBehavior === 'WORLD_STATE_ONLY') return false;
  if (impact.productBehavior === 'MONITORING') {
    return Boolean(plan.enRouteOnExposedSegment || impact.warningLevel === 'ORANGE');
  }
  return true;
}

export function buildWeatherRootAssessment(input: {
  tripId: string;
  revision: number;
  facts: TravelWorldFact[];
  nowMs?: number;
}): ConstraintAssessment {
  const evaluation = evaluateOntologyConstraints(input.facts, input.nowMs);
  return buildConstraintAssessment({
    facts: input.facts,
    evaluation,
    tripId: input.tripId,
    contextId: `wx_${input.tripId}_${input.revision}`,
    basis: {
      contextRevision: input.revision,
      effectivePlanVersion: `pv_${input.revision}`,
    },
    evaluatedAt: new Date(input.nowMs ?? Date.now()).toISOString(),
  });
}

export function buildWeatherDecisionProblem(input: {
  tripId: string;
  assessment: ConstraintAssessment;
  impact: WeatherPlanImpact;
}): WeatherDecisionProblem | null {
  if (!shouldOpenWeatherUserDecision({ tripId: input.tripId, revision: 0, segments: [] }, input.impact) &&
      input.impact.productBehavior === 'MONITORING') {
    // still open when HIGH_ROOF / ACTIVE_*
  }
  if (
    input.impact.productBehavior === 'WORLD_STATE_ONLY' ||
    (input.impact.productBehavior === 'MONITORING' &&
      !input.impact.impacts.some((i) => i.kind === 'HIGH_ROOF_VEHICLE'))
  ) {
    if (input.impact.productBehavior === 'WORLD_STATE_ONLY') return null;
  }
  const highRoof = input.impact.impacts.some((i) => i.kind === 'HIGH_ROOF_VEHICLE');
  const problemType = highRoof ? 'WIND_HIGH_ROOF_RISK' : 'WEATHER_ROUTE_EXPOSURE';
  const problemId = `wx_prob_${createHash('sha256')
    .update(`${input.tripId}|${input.assessment.assessmentId}|${problemType}`)
    .digest('hex')
    .slice(0, 16)}`;
  return {
    problemId,
    tripId: input.tripId,
    rootAssessmentId: input.assessment.assessmentId,
    problemType,
    semanticScope: WEATHER_DETERIORATION_SEMANTIC,
    title:
      problemType === 'WIND_HIGH_ROOF_RISK'
        ? '强风 + 高顶车辆风险'
        : '强风路线暴露',
    status: 'OPEN',
    impactList: input.impact.impacts,
    productBehavior: input.impact.productBehavior,
    timeline: input.impact.timeline,
  };
}

export function annotateWeatherAssessmentWithProblem(
  assessment: ConstraintAssessment,
  problem: WeatherDecisionProblem | null,
): ConstraintAssessment {
  if (!problem) return assessment;
  return {
    ...assessment,
    problemIds: [...(assessment.problemIds ?? []), problem.problemId],
    semanticKey: WEATHER_DETERIORATION_SEMANTIC,
  };
}

export function assertSingleWeatherRootProblem(
  problems: WeatherDecisionProblem[],
): void {
  if (problems.length > 1) {
    throw new Error(`ONT-P1: expected single weather root problem, got ${problems.length}`);
  }
}
