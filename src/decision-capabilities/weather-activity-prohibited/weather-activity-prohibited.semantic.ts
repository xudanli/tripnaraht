/**
 * RFC-002 Slice 2 — WEATHER_ACTIVITY_PROHIBITED semantic capability.
 */

export const WEATHER_ACTIVITY_PROHIBITED = 'WEATHER_ACTIVITY_PROHIBITED' as const;
export const WEATHER_ROUTE_RISK = 'WEATHER_ROUTE_RISK' as const;

export type WeatherActivitySemanticKey =
  | typeof WEATHER_ACTIVITY_PROHIBITED
  | typeof WEATHER_ROUTE_RISK;

export function buildWeatherActivityProhibitedSemanticKey(
  triggerEventId: string,
): string {
  return `${WEATHER_ACTIVITY_PROHIBITED}:${triggerEventId}`;
}

export function normalizeWeatherSemanticKey(raw?: string): string | undefined {
  if (!raw) return undefined;
  if (raw.startsWith(`${WEATHER_ACTIVITY_PROHIBITED}:`)) return raw;
  if (raw.startsWith('rfc001:weather:')) {
    return buildWeatherActivityProhibitedSemanticKey(
      raw.replace('rfc001:weather:', ''),
    );
  }
  return raw;
}

export function baseWeatherSemanticCapability(semanticKey: string): string {
  if (semanticKey.startsWith(`${WEATHER_ACTIVITY_PROHIBITED}:`)) {
    return WEATHER_ACTIVITY_PROHIBITED;
  }
  if (semanticKey.startsWith(`${WEATHER_ROUTE_RISK}:`)) {
    return WEATHER_ROUTE_RISK;
  }
  const normalized = normalizeWeatherSemanticKey(semanticKey);
  if (normalized?.startsWith(`${WEATHER_ACTIVITY_PROHIBITED}:`)) {
    return WEATHER_ACTIVITY_PROHIBITED;
  }
  return semanticKey;
}
