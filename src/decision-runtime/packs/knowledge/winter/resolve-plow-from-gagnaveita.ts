/**
 * Map Vegagerðin Snjomokstursregla → plow service band + delay range.
 * Never invents a single-minute clearance ETA.
 */

import {
  loadIcelandSnowPlowPolicy,
  type SnowPlowPolicyFile,
} from './iceland-snow-plow.loader';
import type { PlowServiceBand } from './iceland-winter-knowledge.types';

export interface ResolvedGagnaveitaPlow {
  plowRuleCode: string;
  plowServiceBand: PlowServiceBand;
  plowDelayRangeMin?: [number, number];
}

const BAND_RANK: Record<PlowServiceBand, number> = {
  NOT_PLOWED: 4,
  UNKNOWN: 3,
  REDUCED: 2,
  DAILY: 1,
};

export function resolvePlowFromGagnaveitaCode(
  raw: string | null | undefined,
  policy: SnowPlowPolicyFile = loadIcelandSnowPlowPolicy(),
): ResolvedGagnaveitaPlow | undefined {
  if (raw == null) return undefined;
  const code = String(raw).trim().toUpperCase();
  if (!code) return undefined;

  const cell = policy.plowRuleCodes[code];
  if (cell) {
    return {
      plowRuleCode: code,
      plowServiceBand: cell.serviceBand,
      plowDelayRangeMin: cell.delayRangeMinutes
        ? ([cell.delayRangeMinutes[0], cell.delayRangeMinutes[1]] as [
            number,
            number,
          ])
        : undefined,
    };
  }

  // Unknown Vegagerðin code — keep code, band UNKNOWN (do not invent delay)
  return {
    plowRuleCode: code,
    plowServiceBand: 'UNKNOWN',
  };
}

export function worsePlow(
  a: ResolvedGagnaveitaPlow | undefined,
  b: ResolvedGagnaveitaPlow | undefined,
): ResolvedGagnaveitaPlow | undefined {
  if (!a) return b;
  if (!b) return a;
  return BAND_RANK[a.plowServiceBand] >= BAND_RANK[b.plowServiceBand] ? a : b;
}

/**
 * Recover plow from DB `apiResponse` (embedded plow blob or raw Gagnaveita record).
 */
export function resolvePlowFromStoredApiResponse(
  apiResponse: unknown,
): ResolvedGagnaveitaPlow | undefined {
  if (!apiResponse || typeof apiResponse !== 'object') return undefined;
  const obj = apiResponse as Record<string, unknown>;
  const plow = obj.plow as
    | {
        ruleCode?: string;
        serviceBand?: PlowServiceBand;
        delayRangeMin?: [number, number];
      }
    | undefined;
  if (plow?.serviceBand) {
    return {
      plowRuleCode: plow.ruleCode ?? 'UNKNOWN',
      plowServiceBand: plow.serviceBand,
      plowDelayRangeMin: plow.delayRangeMin,
    };
  }
  if ('Snjomokstursregla' in obj) {
    return resolvePlowFromGagnaveitaCode(
      obj.Snjomokstursregla as string | null | undefined,
    );
  }
  return undefined;
}
