/**
 * WP2 — deterministic Abu road constraint matrix (replaces optional AbuStrategy on evaluate).
 */

import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import type { Rfc001ConstraintAssertion } from '../contracts/guardian-outputs.types';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import type { RoadStatusAssertionPayload } from './road-status-to-assertion.adapter';
import type { RoadSegmentBindings } from '../detection/road-close-impact.types';
import { analyzeRoadCloseImpact } from '../detection/road-close-impact-analyzer';
import { RFC001_REASON_CODES } from '../reason-codes/reason-code.registry';
import { ROAD_SEGMENT_UNAVAILABLE } from '../../../decision-capabilities/road-unavailable/road-unavailable.semantic';
import { resolveTripDestinationCountry } from '../../../decision-runtime/packs/loader/country-pack-registry.util';
import {
  applyPackEvaluationToAssertionEnvelope,
  executePackRuleConstraint,
} from '../../../decision-runtime/packs/rules/pack-rule-constraint.executor';

export const ABU_ROAD_RULE_VERSION = 'abu-road-constraint-rfc001-0.2.0';

export interface AbuRoadConstraintInput {
  tripId: string;
  workspaceId: string;
  targetCandidateId: string;
  roadAssertion: WorldStateAssertion<RoadStatusAssertionPayload>;
  affectedPlanItemIds: string[];
  candidatePlan: RoutePlanDraft;
  bindings?: RoadSegmentBindings;
  /** ISO country for pack rule resolution (Phase 2) */
  destinationCountry?: string;
  /** When multiple ACTIVE assertions disagree on status for the same road */
  conflictingAssertion?: WorldStateAssertion<RoadStatusAssertionPayload>;
  now?: Date;
}

function candidateStillUsesRoad(
  plan: RoutePlanDraft,
  tripId: string,
  roadId: string,
  bindings?: RoadSegmentBindings,
): boolean {
  const impact = analyzeRoadCloseImpact(plan, {
    tripId,
    roadId,
    bindings,
  });
  return impact.matchedSegmentIds.length > 0;
}

function isAssertionExpired(
  assertion: WorldStateAssertion<RoadStatusAssertionPayload>,
  now: Date,
): boolean {
  if (!assertion.validUntil) return false;
  return new Date(assertion.validUntil).getTime() < now.getTime();
}

export function evaluateAbuRoadConstraintForCandidate(
  input: AbuRoadConstraintInput,
): Rfc001ConstraintAssertion {
  const now = input.now ?? new Date();
  const payload = input.roadAssertion.payload;
  const roadId = payload.roadId.toUpperCase();
  const usesRoad = candidateStillUsesRoad(
    input.candidatePlan,
    input.tripId,
    roadId,
    input.bindings,
  );

  const base: Omit<Rfc001ConstraintAssertion, 'verdict' | 'constraintCode' | 'reasonCodes' | 'overridable'> = {
    assertionId: `abu_road_${input.workspaceId}_${input.targetCandidateId}_${Date.now()}`,
    workspaceId: input.workspaceId,
    actor: 'ABU',
    targetCandidateId: input.targetCandidateId,
    affectedEntityRefs: [input.roadAssertion.subjectRef],
    affectedPlanItemIds: input.affectedPlanItemIds,
    evidenceRefs: input.roadAssertion.source.evidenceRefs,
    ruleVersion: ABU_ROAD_RULE_VERSION,
    confidence: input.roadAssertion.confidence,
    createdAt: now.toISOString(),
  };

  if (input.conflictingAssertion) {
    return {
      ...base,
      verdict: 'UNKNOWN',
      constraintCode: 'EVIDENCE_CONFLICT',
      reasonCodes: [RFC001_REASON_CODES.EVIDENCE_CONFLICT],
      overridable: false,
      confidence: Math.min(base.confidence, input.conflictingAssertion.confidence),
    };
  }

  if (
    input.roadAssertion.status === 'DISPUTED' ||
    payload.status === 'UNKNOWN'
  ) {
    return {
      ...base,
      verdict: 'UNKNOWN',
      constraintCode: 'EVIDENCE_INSUFFICIENT',
      reasonCodes: [RFC001_REASON_CODES.EVIDENCE_INSUFFICIENT],
      overridable: false,
    };
  }

  if (isAssertionExpired(input.roadAssertion, now)) {
    return {
      ...base,
      verdict: 'UNKNOWN',
      constraintCode: 'EVIDENCE_STALE',
      reasonCodes: [RFC001_REASON_CODES.EVIDENCE_STALE],
      overridable: false,
    };
  }

  const packResult = tryEvaluatePackRoadRules(input, usesRoad);
  if (packResult) {
    const withRecovery =
      packResult.verdict === 'WARNING'
        ? {
            ...packResult,
            recoveryConditions: [
              {
                code: 'CONDITIONAL_PASSAGE',
                description:
                  'Restricted passage may apply (vehicle class, season, or time window)',
                evidenceRefs: input.roadAssertion.source.evidenceRefs,
              },
            ],
          }
        : packResult;
    return applyPackEvaluationToAssertionEnvelope(
      {
        ...base,
        verdict: 'PASS',
        constraintCode: '',
        reasonCodes: [],
        overridable: true,
      },
      withRecovery,
    ) as Rfc001ConstraintAssertion;
  }

  if (payload.status === 'CLOSED') {
    if (usesRoad) {
      return {
        ...base,
        verdict: 'BLOCK',
        constraintCode: 'ROAD_CLOSED',
        reasonCodes: [RFC001_REASON_CODES.ROAD_SEGMENT_CLOSED],
        overridable: false,
      };
    }
    return {
      ...base,
      verdict: 'PASS',
      constraintCode: 'ROAD_BYPASS',
      reasonCodes: [],
      overridable: true,
    };
  }

  if (payload.status === 'LIMITED') {
    if (usesRoad) {
      return {
        ...base,
        verdict: 'WARNING',
        constraintCode: 'ROAD_RESTRICTED',
        reasonCodes: [RFC001_REASON_CODES.ROAD_SEGMENT_RESTRICTED],
        overridable: true,
        recoveryConditions: [
          {
            code: 'CONDITIONAL_PASSAGE',
            description:
              'Restricted passage may apply (vehicle class, season, or time window)',
            evidenceRefs: input.roadAssertion.source.evidenceRefs,
          },
        ],
      };
    }
    return {
      ...base,
      verdict: 'PASS',
      constraintCode: 'ROAD_STATUS',
      reasonCodes: [],
      overridable: true,
    };
  }

  return {
    ...base,
    verdict: 'PASS',
    constraintCode: 'ROAD_STATUS',
    reasonCodes: [],
    overridable: true,
  };
}

function tryEvaluatePackRoadRules(
  input: AbuRoadConstraintInput,
  usesRoad: boolean,
) {
  const country = resolveTripDestinationCountry(input.destinationCountry);
  if (!country) return undefined;

  const semanticKey =
    input.roadAssertion.payload.status === 'LIMITED'
      ? 'ROAD_SEGMENT_RESTRICTED'
      : ROAD_SEGMENT_UNAVAILABLE;

  const evaluation = executePackRuleConstraint({
    country,
    semanticKey,
    facts: { road: { status: input.roadAssertion.payload.status } },
    candidateUsesRoute: usesRoad,
    ruleVersionPrefix: ABU_ROAD_RULE_VERSION,
  });

  if (!evaluation) return undefined;

  if (evaluation.verdict === 'WARNING' && evaluation.recoveryConditions?.length) {
    return {
      ...evaluation,
      recoveryConditions: evaluation.recoveryConditions.map((rc) => ({
        ...rc,
        evidenceRefs: input.roadAssertion.source.evidenceRefs,
      })),
    };
  }

  return evaluation;
}
