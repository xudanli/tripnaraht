/**
 * 3-tier persuasion state machine (Fact → Impact → Authority).
 * Tier is derived from post–early-warning CLARIFICATION_FEEDBACK rows with reward <= 0.
 */

export type PersuasionTier = 1 | 2 | 3;

export function countNegativeClarificationSinceLastEarlyWarning(log: unknown[] | undefined): number {
  if (!Array.isArray(log)) return 0;
  let lastEw = -1;
  for (let i = 0; i < log.length; i++) {
    const a = String((log[i] as any)?.metadata?.system_action ?? '');
    if (a === 'EARLY_WARNING' || a === 'EARLY_WARNING_INTERCEPT') lastEw = i;
  }
  if (lastEw < 0) return 0;
  let n = 0;
  for (let i = lastEw + 1; i < log.length; i++) {
    const e = log[i] as any;
    if (String(e?.metadata?.system_action ?? '') !== 'CLARIFICATION_FEEDBACK') continue;
    if (Number(e?.metadata?.reward ?? 0) <= 0) n++;
  }
  return n;
}

/** 0 negative rounds → Tier1 fact; 1 → Tier2 impact; ≥2 → Tier3 authority */
export function resolvePersuasionTierFromRejections(rejectionCount: number): PersuasionTier {
  if (rejectionCount <= 0) return 1;
  if (rejectionCount === 1) return 2;
  return 3;
}

export function resolvePersuasionTierFromContext(context: {
  persuasion_tier?: number;
  decision_log?: unknown[];
}): PersuasionTier {
  const forced = Number(context?.persuasion_tier);
  if (forced === 1 || forced === 2 || forced === 3) return forced as PersuasionTier;
  const n = countNegativeClarificationSinceLastEarlyWarning(context.decision_log as any[] | undefined);
  return resolvePersuasionTierFromRejections(n);
}

/** Tier implied by negotiation state up to and including `log[eventIndex]`. */
export function resolvePersuasionTierAtLogIndex(log: unknown[] | undefined, eventIndex: number): PersuasionTier {
  if (!Array.isArray(log) || log.length === 0) return 1;
  const end = Math.max(0, Math.min(eventIndex, log.length - 1));
  return resolvePersuasionTierFromContext({ decision_log: log.slice(0, end + 1) as any[] });
}

/**
 * Pick narrator template: `narrator_hints_by_tier["1"|"2"|"3"]` then fallback `narrator_hint`.
 */
export function pickNarratorHintTemplate(cond: Record<string, unknown> | undefined, tier: PersuasionTier): string | undefined {
  if (!cond || typeof cond !== 'object') return undefined;
  const by = cond.narrator_hints_by_tier as Record<string, unknown> | undefined;
  if (by && typeof by === 'object') {
    const keys = [String(tier), `t${tier}`, `tier_${tier}`];
    for (const k of keys) {
      const hit = by[k];
      if (typeof hit === 'string' && hit.trim()) return hit.trim();
    }
  }
  const legacy = cond.narrator_hint;
  if (typeof legacy === 'string' && legacy.trim()) return legacy.trim();
  return undefined;
}
