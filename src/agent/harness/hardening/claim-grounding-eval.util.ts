/**
 * Claim Grounding → Harness / Eval 合同。
 * 把 System1 的 Claim 接地结果升成可回归的 Decision Artifact 片段，
 * 供 AgentTurnTrace / Hardening 验收 / Golden Case 共用，而不是孤立校验。
 */

import type {
  System1Claim,
  System1ClaimGrounding,
  System1Evidence,
  System1TurnTrace,
} from '../../system1-runtime/system1-runtime.types';
import {
  assertEvidenceSufficiencyForConclusion,
  type EvidenceFactV1,
} from './evidence.contract';

export const CLAIM_GROUNDING_EVAL_SCHEMA = 'tripnara.claim_grounding_eval@v1' as const;

export type ClaimGroundingViolationCode =
  | 'STRONG_ANSWER_WITH_WEAK_SUFFICIENCY'
  | 'STRONG_CLAIM_WITHOUT_VERIFIED'
  | 'UNGROUNDED_CLAIM_IN_OUTPUT'
  | 'SOFT_RECOMMEND_REQUIRES_SAFETY_EVIDENCE'
  | 'FEASIBILITY_STRONG_MISSING_ROAD';

export type ClaimGroundingViolation = {
  code: ClaimGroundingViolationCode;
  messageZh: string;
  claimId?: string;
};

export type ClaimGroundingEvalV1 = {
  schemaId: typeof CLAIM_GROUNDING_EVAL_SCHEMA;
  version: 1;
  passed: boolean;
  answerMode: string;
  sufficiency: string | null;
  candidateClaimTypes: string[];
  claimsTotal: number;
  groundedCount: number;
  ungroundedCount: number;
  strongWithoutVerified: boolean;
  softRecommendBlockedBySafety: boolean;
  violations: ClaimGroundingViolation[];
  claims: Array<{
    claimId: string;
    type: string;
    strength: string;
    status: 'GROUNDED' | 'UNGROUNDED';
    evidenceKeys: string[];
  }>;
};

function toEvidenceFacts(
  claim: System1Claim,
  evidence: System1Evidence[],
): EvidenceFactV1[] {
  return evidence
    .filter((e) => claim.evidenceKeys.includes(e.key))
    .map((e) => ({
      key: e.key,
      valueZh: typeof e.value === 'string' ? e.value : JSON.stringify(e.value ?? ''),
      freshness: e.status,
      source: e.sourceRef,
    }));
}

function groundingStatus(
  claimId: string,
  groundingResult: System1ClaimGrounding[],
): 'GROUNDED' | 'UNGROUNDED' {
  return groundingResult.find((g) => g.claimId === claimId)?.status === 'UNGROUNDED'
    ? 'UNGROUNDED'
    : 'GROUNDED';
}

/**
 * 从 System1 Turn Trace 产出 Harness 可断言的 Claim Grounding Eval。
 */
export function evaluateClaimGroundingForHarness(
  trace: Pick<
    System1TurnTrace,
    | 'candidateClaimTypes'
    | 'requiredEvidence'
    | 'retrievedEvidence'
    | 'sufficiency'
    | 'claims'
    | 'groundingResult'
    | 'routeDecision'
    | 'taskFrame'
  >,
): ClaimGroundingEvalV1 {
  const violations: ClaimGroundingViolation[] = [];
  const answerMode = trace.routeDecision.answerMode;
  const sufficiency = trace.sufficiency?.status ?? null;
  const candidateClaimTypes = trace.candidateClaimTypes ?? [];
  const groundingResult = trace.groundingResult ?? [];
  const claims = trace.claims ?? [];

  if (
    answerMode === 'STRONG' &&
    (sufficiency === 'INSUFFICIENT' || sufficiency === 'PARTIAL')
  ) {
    violations.push({
      code: 'STRONG_ANSWER_WITH_WEAK_SUFFICIENCY',
      messageZh: '证据不足却输出强结论',
    });
  }

  let strongWithoutVerified = false;
  for (const claim of claims) {
    if (claim.strength !== 'STRONG') continue;
    const facts = toEvidenceFacts(claim, trace.retrievedEvidence);
    const check = assertEvidenceSufficiencyForConclusion({
      desiredStrength: 'STRONG',
      evidence: facts,
    });
    if (!check.ok) {
      strongWithoutVerified = true;
      violations.push({
        code: 'STRONG_CLAIM_WITHOUT_VERIFIED',
        messageZh: `强 Claim「${claim.claimId}」缺少 VERIFIED 证据`,
        claimId: claim.claimId,
      });
    }
    if (
      claim.type === 'FEASIBILITY' &&
      !facts.some((f) => f.key === 'route.status' && f.freshness === 'VERIFIED')
    ) {
      violations.push({
        code: 'FEASIBILITY_STRONG_MISSING_ROAD',
        messageZh: '可行性强结论缺少 VERIFIED 路况',
        claimId: claim.claimId,
      });
    }
  }

  const outputIds = new Set(claims.map((c) => c.claimId));
  for (const g of groundingResult) {
    if (g.status === 'UNGROUNDED' && outputIds.has(g.claimId)) {
      violations.push({
        code: 'UNGROUNDED_CLAIM_IN_OUTPUT',
        messageZh: `未接地 Claim「${g.claimId}」仍进入输出`,
        claimId: g.claimId,
      });
    }
  }

  const softRecommendOnly =
    candidateClaimTypes.length > 0 &&
    candidateClaimTypes.every((t) => t === 'RECOMMENDATION' || t === 'STATE_FACT') &&
    candidateClaimTypes.includes('RECOMMENDATION');
  const safetyKeys = trace.requiredEvidence.filter(
    (r) =>
      (r.key === 'weather.wind' || r.key === 'route.status') &&
      r.required &&
      r.importance === 'CRITICAL',
  );
  const softRecommendBlockedBySafety = softRecommendOnly && safetyKeys.length > 0;
  if (softRecommendBlockedBySafety) {
    violations.push({
      code: 'SOFT_RECOMMEND_REQUIRES_SAFETY_EVIDENCE',
      messageZh: '软推荐被安全证据合同误杀',
    });
  }

  const ungroundedCount = groundingResult.filter((g) => g.status === 'UNGROUNDED').length;
  const groundedCount = groundingResult.filter((g) => g.status === 'GROUNDED').length;

  return {
    schemaId: CLAIM_GROUNDING_EVAL_SCHEMA,
    version: 1,
    passed: violations.length === 0,
    answerMode,
    sufficiency,
    candidateClaimTypes,
    claimsTotal: claims.length + ungroundedCount,
    groundedCount,
    ungroundedCount,
    strongWithoutVerified,
    softRecommendBlockedBySafety,
    violations,
    claims: [
      ...claims.map((c) => ({
        claimId: c.claimId,
        type: c.type,
        strength: c.strength,
        status: groundingStatus(c.claimId, groundingResult),
        evidenceKeys: c.evidenceKeys,
      })),
      ...groundingResult
        .filter((g) => g.status === 'UNGROUNDED' && !outputIds.has(g.claimId))
        .map((g) => ({
          claimId: g.claimId,
          type: 'UNKNOWN',
          strength: g.strengthAllowed,
          status: 'UNGROUNDED' as const,
          evidenceKeys: [] as string[],
        })),
    ],
  };
}

export function projectClaimGroundingEvalForObservability(
  evalResult: ClaimGroundingEvalV1,
): Record<string, unknown> {
  return {
    schema_id: evalResult.schemaId,
    passed: evalResult.passed,
    answer_mode: evalResult.answerMode,
    sufficiency: evalResult.sufficiency,
    candidate_claim_types: evalResult.candidateClaimTypes,
    grounded_count: evalResult.groundedCount,
    ungrounded_count: evalResult.ungroundedCount,
    strong_without_verified: evalResult.strongWithoutVerified,
    soft_recommend_blocked_by_safety: evalResult.softRecommendBlockedBySafety,
    violations: evalResult.violations.map((v) => v.code),
    claims: evalResult.claims,
  };
}
