/**
 * M5 — Event fingerprint dedup / cooldown (in-memory staging; production uses store).
 */

export interface EventDedupEntry {
  fingerprint: string;
  tripId: string;
  lastSeenAt: string;
  severity: string;
  count: number;
}

export interface EventDedupConfig {
  cooldownMs: number;
  /** Allow severity upgrade to bypass cooldown */
  allowSeverityUpgrade: boolean;
}

const DEFAULT_CONFIG: EventDedupConfig = {
  cooldownMs: 60_000,
  allowSeverityUpgrade: true,
};

const SEVERITY_RANK: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function buildEventFingerprint(input: {
  tripId: string;
  eventType: string;
  source: string;
  affectedEntities?: string[];
}): string {
  const entities = [...(input.affectedEntities ?? [])].sort().join(',');
  return `${input.tripId}|${input.eventType}|${input.source}|${entities}`;
}

export function shouldDedupeEvent(
  fingerprint: string,
  severity: string,
  store: Map<string, EventDedupEntry>,
  nowMs: number,
  config: EventDedupConfig = DEFAULT_CONFIG,
): { dedupe: boolean; reason?: string } {
  const existing = store.get(fingerprint);
  if (!existing) {
    store.set(fingerprint, {
      fingerprint,
      tripId: fingerprint.split('|')[0] ?? '',
      lastSeenAt: new Date(nowMs).toISOString(),
      severity,
      count: 1,
    });
    return { dedupe: false };
  }

  const elapsed = nowMs - Date.parse(existing.lastSeenAt);
  const upgraded =
    config.allowSeverityUpgrade &&
    (SEVERITY_RANK[severity] ?? 0) > (SEVERITY_RANK[existing.severity] ?? 0);

  if (elapsed < config.cooldownMs && !upgraded) {
    existing.count += 1;
    return { dedupe: true, reason: 'cooldown_window' };
  }

  existing.lastSeenAt = new Date(nowMs).toISOString();
  existing.severity = severity;
  existing.count += 1;
  return { dedupe: false };
}
