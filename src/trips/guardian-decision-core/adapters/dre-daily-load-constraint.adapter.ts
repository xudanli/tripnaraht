/**
 * Slice 3 — Dr.Dre daily load constraint (schedule stress / driving hours).
 * Pack rules (IS load bundle) when DECISION_PACK_RULES=1; inline fallback otherwise.
 */

import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import type { Rfc001ConstraintAssertion } from '../contracts/guardian-outputs.types';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import type { DailyLoadAssertionPayload } from './daily-load-to-assertion.adapter';
import { RFC001_REASON_CODES } from '../reason-codes/reason-code.registry';
import { EXCESSIVE_DAILY_LOAD } from '../../../decision-capabilities/excessive-daily-load/excessive-daily-load.semantic';
import {
  computeDrivingHoursByDay,
  evaluateDreRoadLoadForCandidate,
} from './dre-road-load.adapter';
import { ORIGINAL_CANDIDATE_ID } from './repair-candidate.adapter';
import { DAILY_LOAD_SPLIT_CANDIDATE_ID } from './dre-daily-load-repair-candidate.adapter';
import { buildMinimalEvaluateWorld } from '../orchestration/minimal-evaluate-world.util';
import { resolveTripDestinationCountry } from '../../../decision-runtime/packs/loader/country-pack-registry.util';
import {
  applyPackEvaluationToAssertionEnvelope,
  executePackRuleConstraint,
} from '../../../decision-runtime/packs/rules/pack-rule-constraint.executor';
import { resolveDrivingEnvironmentForCountry } from '../../../decision-runtime/packs/modifiers/pack-modifier-bundle.loader';

export const DRDRE_DAILY_LOAD_RULE_VERSION = 'dre-daily-load-rfc002-0.1.0';

export interface DreDailyLoadConstraintInput {
  tripId: string;
  workspaceId: string;
  targetCandidateId: string;
  loadAssertion: WorldStateAssertion<DailyLoadAssertionPayload>;
  baselinePlan: RoutePlanDraft;
  candidatePlan: RoutePlanDraft;
  inputSnapshotRef: string;
  affectedPlanItemIds: string[];
  destinationCountry?: string;
}

export function evaluateDreDailyLoadConstraintForCandidate(
  input: DreDailyLoadConstraintInput,
): Rfc001ConstraintAssertion {
  const threshold = input.loadAssertion.payload.thresholdHours;
  const dayIndex = input.loadAssertion.payload.dayIndex;
  const country = input.destinationCountry
    ? resolveTripDestinationCountry(input.destinationCountry)
    : undefined;
  const drivingEnv = resolveDrivingEnvironmentForCountry(country);

  const assessment = evaluateDreRoadLoadForCandidate({
    workspaceId: input.workspaceId,
    targetCandidateId: input.targetCandidateId,
    inputSnapshotRef: input.inputSnapshotRef,
    baselinePlan: input.baselinePlan,
    candidatePlan: input.candidatePlan,
    world: buildMinimalEvaluateWorld({
      countryCode: country ?? 'GLOBAL',
      roadId: 'N/A',
      roadStatus: 'OPEN',
    }),
    affectedDayIndex: dayIndex,
    destinationCountry: input.destinationCountry,
  });

  const hoursByDay = computeDrivingHoursByDay(input.candidatePlan, drivingEnv.defaultSpeedKmH);
  const candidateDayHours = hoursByDay.get(dayIndex) ?? 0;
  const excessive = candidateDayHours > threshold;
  const isSplitDay = input.targetCandidateId === DAILY_LOAD_SPLIT_CANDIDATE_ID;
  const candidateUsesRoute = excessive;

  const base: Omit<
    Rfc001ConstraintAssertion,
    'verdict' | 'constraintCode' | 'reasonCodes' | 'overridable'
  > = {
    assertionId: `dre_load_${input.workspaceId}_${input.targetCandidateId}_${Date.now()}`,
    workspaceId: input.workspaceId,
    actor: 'DRDRE',
    targetCandidateId: input.targetCandidateId,
    semanticKey: EXCESSIVE_DAILY_LOAD,
    physicalLoad: assessment.physicalLoad,
    scheduleStress: assessment.scheduleStress,
    affectedEntityRefs: [input.loadAssertion.subjectRef],
    affectedPlanItemIds: input.affectedPlanItemIds,
    evidenceRefs: input.loadAssertion.source.evidenceRefs,
    confidence: input.loadAssertion.confidence,
    createdAt: new Date().toISOString(),
    ruleVersion: DRDRE_DAILY_LOAD_RULE_VERSION,
  };

  const evaluation = executePackRuleConstraint({
    country: country ?? '',
    semanticKey: EXCESSIVE_DAILY_LOAD,
    facts: {
      driving: {
        hours: candidateDayHours,
        thresholdHours: threshold,
        dayIndex,
        excessive,
      },
      load: {
        physicalLoad: assessment.physicalLoad,
      },
      candidate: {
        isSplitDay,
        id: input.targetCandidateId,
      },
    },
    candidateUsesRoute,
    ruleVersionPrefix: DRDRE_DAILY_LOAD_RULE_VERSION,
  });

  if (evaluation) {
    return applyPackEvaluationToAssertionEnvelope(
      {
        ...base,
        verdict: 'PASS',
        constraintCode: '',
        reasonCodes: [],
        overridable: true,
      },
      evaluation,
    ) as Rfc001ConstraintAssertion;
  }

  return evaluateDreDailyLoadConstraintInline({
    base,
    targetCandidateId: input.targetCandidateId,
    assessment,
    excessive,
  });
}

function evaluateDreDailyLoadConstraintInline(input: {
  base: Omit<
    Rfc001ConstraintAssertion,
    'verdict' | 'constraintCode' | 'reasonCodes' | 'overridable'
  >;
  targetCandidateId: string;
  assessment: { physicalLoad: number };
  excessive: boolean;
}): Rfc001ConstraintAssertion {
  const overloaded = input.assessment.physicalLoad >= 1;

  let verdict: Rfc001ConstraintAssertion['verdict'] = 'PASS';
  let reasonCodes: string[] = [];
  if (input.targetCandidateId === ORIGINAL_CANDIDATE_ID && overloaded) {
    verdict = 'BLOCK';
    reasonCodes = [RFC001_REASON_CODES.EXCESSIVE_DAILY_LOAD];
  } else if (
    input.targetCandidateId === DAILY_LOAD_SPLIT_CANDIDATE_ID &&
    input.assessment.physicalLoad < 1
  ) {
    verdict = 'PASS';
  } else if (input.targetCandidateId === DAILY_LOAD_SPLIT_CANDIDATE_ID && input.excessive) {
    verdict = 'WARNING';
    reasonCodes = [RFC001_REASON_CODES.EXCESSIVE_DAILY_LOAD];
  }

  return {
    ...input.base,
    verdict,
    constraintCode: 'daily.driving.load',
    reasonCodes,
    overridable: verdict === 'WARNING',
  };
}
