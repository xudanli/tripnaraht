/**
 * 问题级 Evidence Sufficiency：RequiredEvidenceSpec × Actual Evidence × Freshness × Importance × Conflict。
 * 与 assertEvidenceSufficiencyForConclusion（至少 1 条 VERIFIED）分层：后者只做 Claim 级 primitive。
 */

import type {
  EvidenceSufficiencyResult,
  RequiredEvidenceSpec,
  System1Evidence,
  System1EvidenceStatus,
} from './system1-runtime.types';

const STATUS_RANK: Record<System1EvidenceStatus, number> = {
  VERIFIED: 0,
  STALE: 1,
  ASSUMED: 2,
  UNAVAILABLE: 3,
};

function bestStatus(rows: System1Evidence[]): System1EvidenceStatus | null {
  if (rows.length === 0) return null;
  return rows.reduce<System1EvidenceStatus>((acc, row) => {
    return STATUS_RANK[row.status] < STATUS_RANK[acc] ? row.status : acc;
  }, rows[0]!.status);
}

function normalizeValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim().toLowerCase();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isClosedSignal(value: unknown): boolean {
  return /封路|关闭|不可通行|closed|blocked|禁行|门控=block|\bblock\b/i.test(normalizeValue(value));
}

function isOpenSignal(value: unknown): boolean {
  return /通行|开放|open|clear/i.test(normalizeValue(value));
}

function findConflicts(key: string, rows: System1Evidence[]): string[] {
  const verified = rows.filter((r) => r.status === 'VERIFIED' || r.status === 'STALE');
  if (verified.length < 2) return [];
  const closed = verified.filter((r) => isClosedSignal(r.value));
  const open = verified.filter((r) => isOpenSignal(r.value));
  if (closed.length && open.length) {
    return [...closed, ...open].map((r) => r.evidenceId);
  }
  return [];
}

export function evaluateEvidenceSufficiency(input: {
  required: RequiredEvidenceSpec[];
  evidence: System1Evidence[];
}): EvidenceSufficiencyResult {
  const missingEvidence: string[] = [];
  const staleEvidence: string[] = [];
  const conflictingEvidence: EvidenceSufficiencyResult['conflictingEvidence'] = [];
  let hardNegative = false;
  let criticalMissing = 0;
  let criticalStale = 0;
  let criticalAssumed = 0;
  let anyPresent = false;

  for (const spec of input.required) {
    const rows = input.evidence.filter((e) => e.key === spec.key);
    if (rows.length) anyPresent = true;
    const conflictIds = findConflicts(spec.key, rows);
    if (conflictIds.length) {
      conflictingEvidence.push({ key: spec.key, evidenceIds: conflictIds });
    }
    const status = bestStatus(rows);
    const requireLive = spec.freshnessRequirement?.requireLive === true;
    const liveOk = status === 'VERIFIED';
    const staleOk = status === 'STALE';

    if (spec.key === 'route.status' && rows.some((r) => isClosedSignal(r.value) && r.status === 'VERIFIED')) {
      hardNegative = true;
    }

    if (status === 'ASSUMED' && spec.required && spec.importance === 'CRITICAL' && !requireLive) {
      criticalAssumed += 1;
      continue;
    }

    const absent =
      status == null ||
      status === 'UNAVAILABLE' ||
      (requireLive && !liveOk && !staleOk) ||
      (status === 'ASSUMED' && spec.importance === 'CRITICAL' && requireLive);

    if (absent && spec.required) {
      missingEvidence.push(spec.key);
      if (spec.importance === 'CRITICAL') criticalMissing += 1;
      continue;
    }
    if (staleOk && spec.required) {
      staleEvidence.push(spec.key);
      if (spec.importance === 'CRITICAL') criticalStale += 1;
    }
  }

  if (conflictingEvidence.length > 0) {
    return {
      status: 'CONFLICTED',
      missingEvidence,
      staleEvidence,
      conflictingEvidence,
      canAnswer: false,
      answerMode: 'NO_ANSWER',
      recommendedRoute: 'SYSTEM2_ASSISTED',
      reason: 'conflicted_critical_evidence',
    };
  }

  if (criticalMissing > 0 && !anyPresent) {
    return {
      status: 'INSUFFICIENT',
      missingEvidence,
      staleEvidence,
      conflictingEvidence,
      canAnswer: false,
      answerMode: 'NO_ANSWER',
      recommendedRoute: missingEvidence.length ? 'FETCH_MORE' : 'ASK_USER',
      reason: 'no_evidence',
    };
  }

  if (criticalMissing > 0) {
    const ask = input.required.some(
      (s) => s.onMissing === 'ASK_USER' && missingEvidence.includes(s.key),
    );
    return {
      status: 'INSUFFICIENT',
      missingEvidence,
      staleEvidence,
      conflictingEvidence,
      canAnswer: hardNegative,
      answerMode: hardNegative ? 'STRONG' : 'NO_ANSWER',
      recommendedRoute: hardNegative ? 'SYSTEM1_ANSWER' : ask ? 'ASK_USER' : 'FETCH_MORE',
      reason: hardNegative ? 'hard_negative_with_missing_context' : 'critical_missing',
    };
  }

  if (criticalStale > 0) {
    return {
      status: 'PARTIAL',
      missingEvidence,
      staleEvidence,
      conflictingEvidence,
      canAnswer: false,
      answerMode: 'CONDITIONAL',
      recommendedRoute: 'FETCH_MORE',
      reason: 'critical_stale',
    };
  }

  if (criticalAssumed > 0) {
    return {
      status: 'PARTIAL',
      missingEvidence,
      staleEvidence,
      conflictingEvidence,
      canAnswer: true,
      answerMode: 'CONDITIONAL',
      recommendedRoute: 'SYSTEM1_ANSWER',
      reason: 'critical_assumed',
    };
  }

  const importantMissing = input.required.filter(
    (s) => s.importance === 'IMPORTANT' && missingEvidence.includes(s.key),
  );
  if (importantMissing.length > 0) {
    return {
      status: 'PARTIAL',
      missingEvidence,
      staleEvidence,
      conflictingEvidence,
      canAnswer: true,
      answerMode: 'CONDITIONAL',
      recommendedRoute: 'SYSTEM1_ANSWER',
      reason: 'important_missing_conditional',
    };
  }

  return {
    status: 'SUFFICIENT',
    missingEvidence,
    staleEvidence,
    conflictingEvidence,
    canAnswer: true,
    answerMode: 'STRONG',
    recommendedRoute: 'SYSTEM1_ANSWER',
    reason: 'critical_verified',
  };
}
