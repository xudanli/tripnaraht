/**
 * PD-1 — V1 Trigger allowlist (Weather + Road only).
 */

import type { ProactiveWorldSignalKind } from '../contracts/proactive-impact.types';

export const PROACTIVE_V1_SIGNAL_ALLOWLIST: readonly ProactiveWorldSignalKind[] =
  [
    'WEATHER_WIND',
    'WEATHER_BLIZZARD',
    'WEATHER_HEAVY_RAIN',
    'ROAD_CLOSURE',
    'ROAD_DIFFICULTY_CHANGE',
    'ROUTE_AVAILABILITY_CHANGE',
  ] as const;

export function isProactiveV1SignalAllowlisted(
  kind: string,
): kind is ProactiveWorldSignalKind {
  return (PROACTIVE_V1_SIGNAL_ALLOWLIST as readonly string[]).includes(kind);
}
