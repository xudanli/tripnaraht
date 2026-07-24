// src/trips/iceland/market-preference/iceland-market-preference-memory.util.ts

import type { AgentMemoryContext } from '../../../agent/memory/interfaces/agent-memory-context.interface';
import type { IcelandMarketSegmentResolution } from './iceland-market-preference.types';

const SNAPSHOT_KEY = 'iceland_market_segment';

export function writeIcelandMarketSegmentToTravelPreference(
  memory: AgentMemoryContext,
  resolution: IcelandMarketSegmentResolution,
): void {
  const tp: Record<string, unknown> = { ...(memory.travelPreference ?? {}) };
  tp[SNAPSHOT_KEY] = {
    segmentId: resolution.segmentId,
    confidence: resolution.confidence,
    blended: resolution.blended,
    canonicalRouteId: resolution.canonicalRouteId,
    routeDirectionName: resolution.routeDirectionName,
    runnerUpSegmentId: resolution.runnerUpSegmentId,
    routeDirectionTagAffinities: resolution.routeDirectionTagAffinities,
    preferredRouteTypes: resolution.preferredRouteTypes,
    rentalIntentProfile: resolution.rentalIntentProfile,
    worldModelIntents: resolution.worldModelIntents,
    promptBlockZh: resolution.promptBlockZh,
  };
  memory.travelPreference = tp;
  if (!memory.observability.layers.includes('iceland_market_prior')) {
    memory.observability.layers.push('iceland_market_prior');
  }
}

export function readIcelandMarketSegmentFromTravelPreference(
  memory: AgentMemoryContext | null | undefined,
): IcelandMarketSegmentResolution | null {
  const raw = memory?.travelPreference?.[SNAPSHOT_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.segmentId !== 'string' || typeof s.confidence !== 'number') return null;
  return {
    segmentId: s.segmentId as IcelandMarketSegmentResolution['segmentId'],
    confidence: s.confidence,
    blended: Boolean(s.blended),
    runnerUpSegmentId: s.runnerUpSegmentId as IcelandMarketSegmentResolution['runnerUpSegmentId'],
    canonicalRouteId: String(s.canonicalRouteId ?? ''),
    routeDirectionName:
      typeof s.routeDirectionName === 'string' ? s.routeDirectionName : undefined,
    routeDirectionTagAffinities:
      (s.routeDirectionTagAffinities as Record<string, number>) ?? {},
    preferredRouteTypes: s.preferredRouteTypes as string[] | undefined,
    rentalIntentProfile: s.rentalIntentProfile as IcelandMarketSegmentResolution['rentalIntentProfile'],
    worldModelIntents: s.worldModelIntents as Record<string, number> | undefined,
    promptBlockZh: String(s.promptBlockZh ?? ''),
  };
}
