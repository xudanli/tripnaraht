/**
 * Merge live RoadStatus plow fields into Iceland route facts (structured only).
 */

import type { RoadStatus } from '../../../../skills/world/services/road-status-realtime.service';
import type { IcelandSelfDriveRouteFacts } from '../demo/iceland-self-drive-route-facts.types';
import type { PlowServiceBand } from './iceland-winter-knowledge.types';
import { worsePlow, type ResolvedGagnaveitaPlow } from './resolve-plow-from-gagnaveita';

export function plowFromRoadStatus(
  status: RoadStatus | null | undefined,
): ResolvedGagnaveitaPlow | undefined {
  if (!status?.plow) return undefined;
  return {
    plowRuleCode: status.plow.ruleCode ?? 'UNKNOWN',
    plowServiceBand: status.plow.serviceBand,
    plowDelayRangeMin: status.plow.delayRangeMin,
  };
}

export function mergePlowIntoRouteFacts(
  facts: IcelandSelfDriveRouteFacts,
  roadStatuses: Array<RoadStatus | null | undefined>,
): IcelandSelfDriveRouteFacts {
  let best: ResolvedGagnaveitaPlow | undefined;
  let roadSegmentId: string | undefined =
    facts.winter?.snowPlow?.roadSegmentId ?? facts.roadSegmentIds?.[0];

  for (const status of roadStatuses) {
    const plow = plowFromRoadStatus(status);
    if (!plow) continue;
    const prev = best;
    best = worsePlow(best, plow);
    if (best !== prev && status?.roadId) {
      roadSegmentId = status.roadId;
    }
  }

  if (!best && facts.winter?.snowPlow?.plowRuleCode) {
    return facts; // keep explicit upstream plow
  }
  if (!best) return facts;

  return {
    ...facts,
    winter: {
      ...facts.winter,
      snowPlow: {
        roadSegmentId,
        plowRuleCode: best.plowRuleCode,
        plowServiceBand: best.plowServiceBand as PlowServiceBand,
        plowDelayRangeMin: best.plowDelayRangeMin,
      },
    },
  };
}
