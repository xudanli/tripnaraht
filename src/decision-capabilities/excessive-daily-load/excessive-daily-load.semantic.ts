/**
 * RFC-002 Slice 3 — EXCESSIVE_DAILY_LOAD semantic capability.
 */

export const EXCESSIVE_DAILY_LOAD = 'EXCESSIVE_DAILY_LOAD' as const;

export function buildExcessiveDailyLoadSemanticKey(triggerEventId: string): string {
  return `${EXCESSIVE_DAILY_LOAD}:${triggerEventId}`;
}

export function normalizeExcessiveDailyLoadSemanticKey(raw?: string): string | undefined {
  if (!raw) return undefined;
  if (raw.startsWith(`${EXCESSIVE_DAILY_LOAD}:`)) return raw;
  if (raw.startsWith('rfc001:load:')) {
    return buildExcessiveDailyLoadSemanticKey(raw.replace('rfc001:load:', ''));
  }
  return raw;
}

export function baseExcessiveDailyLoadCapability(semanticKey: string): string {
  if (semanticKey.startsWith(`${EXCESSIVE_DAILY_LOAD}:`)) {
    return EXCESSIVE_DAILY_LOAD;
  }
  const normalized = normalizeExcessiveDailyLoadSemanticKey(semanticKey);
  if (normalized?.startsWith(`${EXCESSIVE_DAILY_LOAD}:`)) {
    return EXCESSIVE_DAILY_LOAD;
  }
  return semanticKey;
}
