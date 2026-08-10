/**
 * Harness Hardening — Evidence Contract。
 * Freshness: VERIFIED | STALE | ASSUMED | UNAVAILABLE
 * Evidence Sufficiency 与结论权限绑定：无充分证据不得强结论。
 */

export type EvidenceFreshnessV1 = 'VERIFIED' | 'STALE' | 'ASSUMED' | 'UNAVAILABLE';

export type EvidenceFactV1 = {
  key: string;
  valueZh: string;
  freshness: EvidenceFreshnessV1;
  source?: string;
  observedAt?: string;
};

export type ConclusionStrength = 'STRONG' | 'CONDITIONAL' | 'WEAK';

export type EvidenceSufficiencyResult =
  | { ok: true; strengthAllowed: ConclusionStrength; reason: string }
  | {
      ok: false;
      code: 'INSUFFICIENT_EVIDENCE_FOR_STRONG_CONCLUSION';
      reason: string;
      strengthAllowed: ConclusionStrength;
    };

/** 将旧 Live freshness 映射到 Evidence Contract */
export function normalizeEvidenceFreshness(
  raw: string | null | undefined,
): EvidenceFreshnessV1 {
  const t = String(raw ?? '').toUpperCase();
  if (t === 'VERIFIED' || t === 'LIVE') return 'VERIFIED';
  if (t === 'STALE') return 'STALE';
  if (t === 'UNAVAILABLE' || t === 'UNKNOWN') return 'UNAVAILABLE';
  return 'ASSUMED';
}

export function classifyEvidenceBucket(facts: EvidenceFactV1[]): {
  verified: number;
  stale: number;
  assumed: number;
  unavailable: number;
} {
  const out = { verified: 0, stale: 0, assumed: 0, unavailable: 0 };
  for (const f of facts) {
    if (f.freshness === 'VERIFIED') out.verified += 1;
    else if (f.freshness === 'STALE') out.stale += 1;
    else if (f.freshness === 'UNAVAILABLE') out.unavailable += 1;
    else out.assumed += 1;
  }
  return out;
}

/**
 * 强结论（YES/NO 硬判）须至少 1 条 VERIFIED。
 * 仅 ASSUMED / UNAVAILABLE → 只允许 CONDITIONAL/WEAK。
 * STALE 可支撑 CONDITIONAL，不可单独支撑 STRONG。
 */
export function assertEvidenceSufficiencyForConclusion(input: {
  desiredStrength: ConclusionStrength;
  evidence: EvidenceFactV1[];
}): EvidenceSufficiencyResult {
  const bag = classifyEvidenceBucket(input.evidence);
  const hasVerified = bag.verified > 0;
  const onlyWeak =
    bag.verified === 0 &&
    bag.stale === 0 &&
    (bag.assumed > 0 || bag.unavailable > 0 || input.evidence.length === 0);

  if (input.desiredStrength === 'STRONG') {
    if (!hasVerified) {
      return {
        ok: false,
        code: 'INSUFFICIENT_EVIDENCE_FOR_STRONG_CONCLUSION',
        reason: `strong_conclusion_requires_verified_evidence:verified=${bag.verified},stale=${bag.stale},assumed=${bag.assumed}`,
        strengthAllowed: bag.stale > 0 ? 'CONDITIONAL' : 'WEAK',
      };
    }
    return { ok: true, strengthAllowed: 'STRONG', reason: 'has_verified_evidence' };
  }

  if (input.desiredStrength === 'CONDITIONAL') {
    if (onlyWeak && bag.stale === 0 && bag.verified === 0 && input.evidence.length === 0) {
      return {
        ok: true,
        strengthAllowed: 'WEAK',
        reason: 'empty_evidence_conditional_degrades_to_weak',
      };
    }
    return {
      ok: true,
      strengthAllowed: hasVerified || bag.stale > 0 ? 'CONDITIONAL' : 'WEAK',
      reason: 'conditional_allowed',
    };
  }

  return { ok: true, strengthAllowed: 'WEAK', reason: 'weak_always_allowed' };
}

/** 将 Live verdict 映射为结论强度 */
export function liveVerdictToStrength(
  verdict: 'YES' | 'NO' | 'CONDITIONAL',
): ConclusionStrength {
  if (verdict === 'CONDITIONAL') return 'CONDITIONAL';
  return 'STRONG';
}

/**
 * 若证据不足支撑 STRONG，强制降级为 CONDITIONAL（验收：无证据强结论率=0）。
 */
export function enforceConclusionAgainstEvidence<T extends { verdict: 'YES' | 'NO' | 'CONDITIONAL'; conclusionZh: string }>(
  conclusion: T,
  evidence: EvidenceFactV1[],
): T & { evidenceEnforced?: boolean } {
  const strength = liveVerdictToStrength(conclusion.verdict);
  const check = assertEvidenceSufficiencyForConclusion({
    desiredStrength: strength,
    evidence,
  });
  if (check.ok) return conclusion;
  return {
    ...conclusion,
    verdict: 'CONDITIONAL',
    conclusionZh:
      conclusion.conclusionZh +
      '（证据不足以为 VERIFIED 支撑强硬结论，已降级为有条件判断。）',
    evidenceEnforced: true,
  };
}
