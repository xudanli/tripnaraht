export function firstPositiveFiniteMs(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

/** Prefer event-level wall-hit (decision_log metadata), then audit_report latency. */
export function mergeWallHitDistanceMs(eventMd: Record<string, unknown> | undefined, auditReportWallMs: unknown): number | undefined {
  const md = eventMd as any;
  return firstPositiveFiniteMs(md?.wall_hit_distance_ms, md?.wall_hit_distance?.latency_ms, auditReportWallMs);
}

/**
 * Scan decision_log (newest-first friendly) for wall-hit latency embedded in metadata.
 */
export function extractWallHitDistanceMsFromDecisionLog(log: unknown[] | undefined): number | undefined {
  if (!Array.isArray(log)) return undefined;
  for (let i = log.length - 1; i >= 0; i--) {
    const md = (log[i] as any)?.metadata as Record<string, unknown> | undefined;
    if (!md || typeof md !== 'object') continue;
    const hit = firstPositiveFiniteMs(
      (md as any).wall_hit_distance_ms,
      (md as any).wall_hit_distance?.latency_ms,
      (md as any).behavioral_gap?.wall_hit_distance?.latency_ms,
      (md as any).audit_report?.behavioral_gap?.wall_hit_distance?.latency_ms,
    );
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/**
 * Resolve wall-hit latency for constraint / narration: metadata → audit on state → decision_log.
 */
export function resolveWallHitDistanceMsForConstraints(args: {
  orchestratorState?: Record<string, unknown> | null;
  decisionLog?: unknown[] | null;
}): number | undefined {
  const st = args.orchestratorState as any;
  const log = (args.decisionLog ?? st?.decision_log) as unknown[] | undefined;
  return firstPositiveFiniteMs(
    st?.metadata?.wall_hit_distance_ms,
    st?.audit_report?.behavioral_gap?.wall_hit_distance?.latency_ms,
    st?.behavioral_gap?.wall_hit_distance?.latency_ms,
    extractWallHitDistanceMsFromDecisionLog(log),
  );
}
