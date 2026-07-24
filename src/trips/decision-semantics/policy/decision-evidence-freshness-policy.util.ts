/**
 * EvidenceFreshnessPolicy for Decision Semantics auto-repair (POLICY-BLOCKER-STALE-001).
 *
 * High-risk evidence (road closure, weather alert) must be fresh before applyRepair.
 * User long-term preferences are out of scope here.
 */

import type { EvidenceReference } from '../types/decision-semantics.types';

export type DecisionEvidenceFreshnessVerdict = {
  blocked: boolean;
  reasonCode?: 'DATA_STALE';
  staleEvidenceTypes: string[];
  message?: string;
  requiresEvidenceRefresh?: boolean;
};

/** Max age (ms) before auto-repair is blocked — aligned with product policy table */
const REPAIR_EVIDENCE_MAX_AGE_MS: Record<string, number> = {
  official_closure: 15 * 60 * 1000,
  road_closure: 15 * 60 * 1000,
  road_feed: 15 * 60 * 1000,
  weather_alert: 30 * 60 * 1000,
  opening_hours: 24 * 60 * 60 * 1000,
};

function resolveMaxAgeMs(proof: EvidenceReference): number {
  const key = String(proof.evidenceType ?? proof.evidenceSource ?? 'default').toLowerCase();
  if (key.includes('weather')) return REPAIR_EVIDENCE_MAX_AGE_MS.weather_alert;
  if (key.includes('road') || key.includes('closure')) return REPAIR_EVIDENCE_MAX_AGE_MS.official_closure;
  return REPAIR_EVIDENCE_MAX_AGE_MS[key] ?? 60 * 60 * 1000;
}

function proofAgeMs(proof: EvidenceReference, nowMs: number): number | null {
  const raw = proof.observedAt ?? proof.validUntil;
  if (!raw) return null;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return null;
  return Math.max(0, nowMs - t);
}

/**
 * Returns blocked=true when any supporting proof is stale for direct repair execution.
 */
export function assessDecisionRepairEvidenceFreshness(input: {
  proofs: EvidenceReference[];
  nowMs?: number;
}): DecisionEvidenceFreshnessVerdict {
  const nowMs = input.nowMs ?? Date.now();
  const staleEvidenceTypes: string[] = [];

  for (const proof of input.proofs) {
    const age = proofAgeMs(proof, nowMs);
    if (age === null) continue;
    const maxAge = resolveMaxAgeMs(proof);
    if (age > maxAge) {
      staleEvidenceTypes.push(proof.evidenceType ?? proof.evidenceSource ?? 'unknown');
    }
  }

  if (staleEvidenceTypes.length === 0) {
    return { blocked: false, staleEvidenceTypes: [] };
  }

  return {
    blocked: true,
    reasonCode: 'DATA_STALE',
    staleEvidenceTypes,
    requiresEvidenceRefresh: true,
    message: `DATA_STALE: repair evidence expired (${staleEvidenceTypes.join(', ')})`,
  };
}
