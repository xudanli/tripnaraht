/**
 * PR-C — Abu / Gate / road evidence → Rfc001ConstraintAssertion (material only).
 */

import type { DecisionResult } from '../../decision/shared/decision-result.types';
import type { Rfc001ConstraintAssertion } from '../contracts/guardian-outputs.types';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import type { RoadStatusAssertionPayload } from '../adapters/road-status-to-assertion.adapter';
import { RFC001_REASON_CODES } from '../reason-codes/reason-code.registry';
import { assertionImpliesHardClosure } from '../adapters/road-status-to-assertion.adapter';

const ABU_RULE_VERSION = 'abu-strategy-rfc001-adapter-0.1.0';

function mapAbuActionToVerdict(
  result: DecisionResult,
): Rfc001ConstraintAssertion['verdict'] {
  if (!result.allowed && result.action === 'REJECT') return 'BLOCK';
  const codes = result.logs.flatMap((l) => l.reasonCodes ?? []);
  if (codes.some((c) => /UNKNOWN|INSUFFICIENT/i.test(c))) return 'UNKNOWN';
  if (result.action === 'ADJUST') return 'WARNING';
  return 'PASS';
}

export function mapRoadClosureToOriginalAssertion(input: {
  workspaceId: string;
  roadAssertion: WorldStateAssertion<RoadStatusAssertionPayload>;
  affectedPlanItemIds: string[];
  targetCandidateId?: string;
}): Rfc001ConstraintAssertion {
  const hard = assertionImpliesHardClosure(input.roadAssertion);
  const payload = input.roadAssertion.payload;
  return {
    assertionId: `abu_${input.workspaceId}_original_${Date.now()}`,
    workspaceId: input.workspaceId,
    actor: 'ABU',
    targetCandidateId: input.targetCandidateId ?? 'original',
    affectedEntityRefs: [input.roadAssertion.subjectRef],
    affectedPlanItemIds: input.affectedPlanItemIds,
    verdict: hard ? 'BLOCK' : payload.status === 'LIMITED' ? 'WARNING' : 'PASS',
    constraintCode: hard ? 'ROAD_CLOSED' : 'ROAD_STATUS',
    reasonCodes: hard
      ? [RFC001_REASON_CODES.ROAD_SEGMENT_CLOSED]
      : [],
    evidenceRefs: input.roadAssertion.source.evidenceRefs,
    ruleVersion: ABU_RULE_VERSION,
    confidence: input.roadAssertion.confidence,
    overridable: !hard,
    createdAt: new Date().toISOString(),
  };
}

export function mapAbuResultToAssertion(input: {
  workspaceId: string;
  targetCandidateId: string;
  affectedPlanItemIds: string[];
  result: DecisionResult;
}): Rfc001ConstraintAssertion {
  const verdict = mapAbuActionToVerdict(input.result);
  const hardBlock = verdict === 'BLOCK';
  return {
    assertionId: `abu_${input.workspaceId}_${input.targetCandidateId}_${Date.now()}`,
    workspaceId: input.workspaceId,
    actor: 'ABU',
    targetCandidateId: input.targetCandidateId,
    affectedEntityRefs: [],
    affectedPlanItemIds: input.affectedPlanItemIds,
    verdict,
    constraintCode: input.result.logs[0]?.reasonCodes?.[0] ?? 'ABU_GATE',
    reasonCodes: input.result.logs.flatMap((l) => l.reasonCodes ?? []),
    evidenceRefs: input.result.logs.flatMap((l) => l.evidenceRefs ?? []),
    ruleVersion: ABU_RULE_VERSION,
    confidence: hardBlock ? 0.95 : 0.85,
    overridable: !hardBlock,
    createdAt: new Date().toISOString(),
  };
}
