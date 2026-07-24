/**
 * Stable rootCauseKey for weather strong-wind episodes.
 * Must NOT include observedAt, triggerEventId, polling time, or ETA.
 */

export interface WeatherStrongWindRootCauseKeyInput {
  tripId: string;
  routeSegmentId: string;
  weatherEpisodeId: string;
}

export function buildWeatherStrongWindRootCauseKey(
  input: WeatherStrongWindRootCauseKeyInput,
): string {
  return `weather:strong-wind:${input.tripId}:${input.routeSegmentId}:${input.weatherEpisodeId}`;
}

export function parseWeatherStrongWindRootCauseKey(
  rootCauseKey: string,
): WeatherStrongWindRootCauseKeyInput | null {
  const prefix = 'weather:strong-wind:';
  if (!rootCauseKey.startsWith(prefix)) return null;
  const rest = rootCauseKey.slice(prefix.length);
  const parts = rest.split(':');
  if (parts.length < 3) return null;
  const tripId = parts[0];
  const weatherEpisodeId = parts[parts.length - 1];
  const routeSegmentId = parts.slice(1, -1).join(':');
  return { tripId, routeSegmentId, weatherEpisodeId };
}
