/**
 * Map POI Access Capacity verdict → Situation winter attractionAccess.
 *
 * Winter card = seasonal / trail opening uncertainty only.
 * Soft safety (涌浪) and crowding FEASIBLE_WITH_RISK must NOT become
 * PENDING_CONFIRMATION — that surfaces as「冬季开放状态待确认」in summer.
 *
 * OPEN is only emitted from FEASIBLE.
 * Non-seasonal FEASIBLE_WITH_RISK returns null / undefined (never OPEN/ALLOW).
 */

import type { AccessCapacityVerdict } from '../../../../poi-access-capacity/interfaces/poi-access-capacity.interface';
import type {
  AttractionWinterAccessInput,
  AttractionWinterEnforcement,
  AttractionWinterAccessStatus,
} from './iceland-winter-knowledge.types';

const VERDICT_RANK: Record<AccessCapacityVerdict, number> = {
  BLOCKED: 5,
  RESERVATION_REQUIRED: 4,
  NEEDS_CONFIRMATION: 3,
  FEASIBLE_WITH_RISK: 2,
  FEASIBLE: 1,
};

/** Rule types that belong on the winter/seasonal opening card. */
export function isSeasonalWinterAccessRuleType(ruleType?: string): boolean {
  const rule = (ruleType ?? '').toUpperCase();
  if (!rule) return false;
  return (
    rule.includes('SEASONAL') ||
    rule.includes('TRAIL_RESTRICTION') ||
    rule.includes('CLOSED') ||
    rule.includes('TRAIL')
  );
}

/**
 * Whether this POI verdict should feed Situation.attractionAccess (winter opening).
 * Soft safety / crowding risk alone → false (stay on POI detail / risk hints).
 */
export function isSeasonalWinterAccessConcern(
  verdict: AccessCapacityVerdict,
  bottleneckRuleType?: string,
): boolean {
  switch (verdict) {
    case 'BLOCKED':
    case 'NEEDS_CONFIRMATION':
    case 'RESERVATION_REQUIRED':
      return true;
    case 'FEASIBLE_WITH_RISK':
      // Only when the bottleneck itself is seasonal/trail — not SAFETY soft / crowding
      return isSeasonalWinterAccessRuleType(bottleneckRuleType);
    case 'FEASIBLE':
    default:
      return false;
  }
}

export function mapAccessVerdictToAttractionWinterStatus(
  verdict: AccessCapacityVerdict,
  opts?: {
    enforcement?: AttractionWinterEnforcement;
    bottleneckRuleType?: string;
  },
): {
  status: AttractionWinterAccessStatus;
  enforcement?: AttractionWinterEnforcement;
  reasons: string[];
} | null {
  const rule = opts?.bottleneckRuleType?.toUpperCase() ?? '';
  const hardClosure =
    opts?.enforcement === 'HARD' ||
    rule.includes('SEASONAL_CLOSURE') ||
    rule.includes('CLOSED') ||
    rule.includes('TRAIL_RESTRICTION');

  switch (verdict) {
    case 'BLOCKED':
      return {
        status: 'CLOSED',
        enforcement: hardClosure ? 'HARD' : opts?.enforcement ?? 'HARD',
        reasons: ['POI_ACCESS_BLOCKED', ...(rule ? [`RULE_${rule}`] : [])],
      };
    case 'RESERVATION_REQUIRED':
      return {
        status: 'PENDING_CONFIRMATION',
        enforcement: 'SOFT',
        reasons: ['POI_RESERVATION_REQUIRED'],
      };
    case 'NEEDS_CONFIRMATION':
      return {
        status: 'PENDING_CONFIRMATION',
        enforcement: 'SOFT',
        reasons: ['POI_ACCESS_NEEDS_CONFIRMATION'],
      };
    case 'FEASIBLE_WITH_RISK':
      // Seasonal trail risk → winter pending; soft safety / crowding → omit (never OPEN/ALLOW)
      if (isSeasonalWinterAccessRuleType(opts?.bottleneckRuleType)) {
        return {
          status: 'PENDING_CONFIRMATION',
          enforcement: 'SOFT',
          reasons: ['POI_ACCESS_SEASONAL_RISK'],
        };
      }
      return null;
    case 'FEASIBLE':
      return {
        status: 'OPEN',
        enforcement: opts?.enforcement,
        reasons: ['POI_ACCESS_FEASIBLE'],
      };
    default:
      return {
        status: 'UNKNOWN',
        enforcement: 'SOFT',
        reasons: ['POI_ACCESS_UNKNOWN'],
      };
  }
}

export function attractionWinterFromPoiAccessEvaluation(input: {
  poiId: string;
  verdict: AccessCapacityVerdict;
  enforcement?: AttractionWinterEnforcement;
  bottleneckRuleType?: string;
}): AttractionWinterAccessInput | undefined {
  const mapped = mapAccessVerdictToAttractionWinterStatus(input.verdict, {
    enforcement: input.enforcement,
    bottleneckRuleType: input.bottleneckRuleType,
  });
  if (!mapped) return undefined;
  return {
    poiId: input.poiId,
    status: mapped.status,
    enforcement: mapped.enforcement,
    reasons: mapped.reasons,
  };
}

/**
 * Prefer the worst **seasonal** access verdict among trip evaluations.
 * Returns undefined when the trip only has soft-safety / crowding risk
 * (so Situation omits the winter-opening card).
 */
export function pickWorstAttractionWinterAccess(
  items: Array<{
    poiId: string;
    verdict: AccessCapacityVerdict;
    enforcement?: AttractionWinterEnforcement;
    bottleneckRuleType?: string;
  }>,
): AttractionWinterAccessInput | undefined {
  const seasonal = items.filter((item) =>
    isSeasonalWinterAccessConcern(item.verdict, item.bottleneckRuleType),
  );
  if (!seasonal.length) return undefined;

  let best = seasonal[0]!;
  for (const item of seasonal.slice(1)) {
    if (VERDICT_RANK[item.verdict] > VERDICT_RANK[best.verdict]) {
      best = item;
    }
  }
  return attractionWinterFromPoiAccessEvaluation(best);
}
