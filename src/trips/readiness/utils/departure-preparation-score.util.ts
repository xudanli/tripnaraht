/**
 * 出发准备完成度 — 仅从 Readiness Pack 投影，不含方案可执行性维度
 * @see internal-docs/product/PRODUCT_READINESS_MODEL.md PR-1
 */

import type { ReadinessCategory } from '../types/readiness-pack.types';
import type { ReadinessCheckResult } from '../types/readiness-findings.types';
import type { ReadinessScoreBreakdown } from '../types/coverage-map.types';
import {
  collectDeparturePrepItems,
  partitionDeparturePrepItems,
} from '../../trip-constraint-solver/utils/departure-prep-projection.util';

const CATEGORY_DIMENSION: Partial<
  Record<ReadinessCategory, keyof Omit<ReadinessScoreBreakdown, 'overall'>>
> = {
  entry_transit: 'entryTransit',
  health_insurance: 'healthInsurance',
  gear_packing: 'gearPacking',
  activities_bookings: 'bookingsCredentials',
  logistics: 'logisticsComms',
  safety_hazards: 'emergency',
};

const PREP_DIMENSION_KEYS = [
  'entryTransit',
  'healthInsurance',
  'gearPacking',
  'bookingsCredentials',
  'logisticsComms',
  'emergency',
] as const;

function bucketScore(items: { level: string }[]): number {
  if (items.length === 0) return 100;
  let penalty = 0;
  for (const item of items) {
    if (item.level === 'blocker') penalty += 35;
    else if (item.level === 'must') penalty += 12;
    else if (item.level === 'should') penalty += 4;
    else penalty += 1;
  }
  return Math.max(0, Math.min(100, 100 - penalty));
}

function emptyBreakdown(): ReadinessScoreBreakdown {
  return {
    overall: 100,
    entryTransit: 100,
    healthInsurance: 100,
    gearPacking: 100,
    bookingsCredentials: 100,
    logisticsComms: 100,
    emergency: 100,
  };
}

export function buildDeparturePreparationScore(
  readinessResult: ReadinessCheckResult | null | undefined,
): ReadinessScoreBreakdown {
  if (!readinessResult?.findings?.length) {
    return emptyBreakdown();
  }

  const items = collectDeparturePrepItems(readinessResult);
  if (items.length === 0) {
    return emptyBreakdown();
  }

  const byCategory = new Map<ReadinessCategory, typeof items>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }

  const breakdown = emptyBreakdown();
  for (const key of PREP_DIMENSION_KEYS) {
    breakdown[key] = 100;
  }

  for (const [category, catItems] of byCategory) {
    const dim = CATEGORY_DIMENSION[category];
    if (dim) {
      breakdown[dim] = bucketScore(catItems);
    }
  }

  const { blockers, must, should } = partitionDeparturePrepItems(items);
  const tracked = [...blockers, ...must, ...should];
  breakdown.overall =
    tracked.length === 0
      ? 100
      : Math.round(
          PREP_DIMENSION_KEYS.reduce((sum, k) => sum + breakdown[k], 0) /
            PREP_DIMENSION_KEYS.length,
        );

  return breakdown;
}
