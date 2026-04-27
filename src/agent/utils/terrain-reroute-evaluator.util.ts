export interface AltPathEvalPolicy {
  /** Soft acceptable extra driving minutes (prefer accept) */
  max_extra_drive_min_soft: number;
  /** Hard upper bound; beyond this v0 rejects to avoid cascading time_space blowups */
  max_extra_drive_min_hard: number;
}

export interface AltPathCandidate {
  slope_ok: boolean;
  /** Optional: positive means margin; negative means still violates */
  slope_slack_pct?: number;
  delta_drive_min: number;
  delta_distance_km?: number;
  path_fingerprint: string;
}

export type AltPathDecision =
  | { accept: true; reason: 'HARD_SLOPE_FIXED_SOFT_COST_OK' | 'HARD_SLOPE_FIXED_BORDERLINE' }
  | { accept: false; reason: 'HARD_SLOPE_NOT_FIXED' | 'SOFT_COST_TOO_HIGH' | 'BORDERLINE_REJECTED_V0' };

/**
 * v0 Lean-style decision: satisfy HARD first, then prune by SOFT cost caps.
 */
export function evaluateAltPath(
  cand: AltPathCandidate,
  policy: AltPathEvalPolicy,
): AltPathDecision {
  if (!cand.slope_ok) return { accept: false, reason: 'HARD_SLOPE_NOT_FIXED' };

  const d = Number(cand.delta_drive_min);
  const soft = Math.max(0, Math.round(policy.max_extra_drive_min_soft));
  const hard = Math.max(soft, Math.round(policy.max_extra_drive_min_hard));
  if (!Number.isFinite(d)) return { accept: false, reason: 'BORDERLINE_REJECTED_V0' };

  if (d <= soft) return { accept: true, reason: 'HARD_SLOPE_FIXED_SOFT_COST_OK' };
  if (d > hard) return { accept: false, reason: 'SOFT_COST_TOO_HIGH' };
  // v0: conservative reject; v1 can use persona/risk tolerance.
  return { accept: false, reason: 'BORDERLINE_REJECTED_V0' };
}

