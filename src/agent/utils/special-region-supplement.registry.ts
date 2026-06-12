/**
 * 特殊区域 POI 补检注册表 — Golden Circle / Westfjords / 未来 Svalbard 等。
 */

import type { PoiSearchContext } from '../../planning-policy/types/poi-search-context.types';
import { buildGoldenCircleSupplementPlans } from './golden-circle-poi-supplement.util';
import type { PoiSearchPlan } from './query-rewriting-poi-context.util';
import { buildWestfjordsSupplementLanes } from './westfjords-poi-supplement.util';

export interface SpecialRegionSupplementInput {
  poiSearchCtx: PoiSearchContext;
  boostedTerms?: string[];
  gapSuffix?: string;
  maxRoutesPerLane?: number;
}

export interface SpecialRegionSupplementLane {
  key: string;
  plan: PoiSearchPlan;
  limit: number;
}

export interface SpecialRegionSupplementHandler {
  regionTag: string;
  buildLanes(input: SpecialRegionSupplementInput): SpecialRegionSupplementLane[];
}

const goldenCircleHandler: SpecialRegionSupplementHandler = {
  regionTag: 'golden_circle',
  buildLanes(input) {
    const plans = buildGoldenCircleSupplementPlans(input);
    const lanes: SpecialRegionSupplementLane[] = [];
    if (plans.anchor) {
      lanes.push({ key: 'golden_circle_anchor', plan: plans.anchor, limit: 12 });
    }
    lanes.push({ key: 'golden_circle_pair', plan: plans.pair, limit: 14 });
    return lanes;
  },
};

const westfjordsHandler: SpecialRegionSupplementHandler = {
  regionTag: 'westfjords',
  buildLanes(input) {
    return buildWestfjordsSupplementLanes(input).map((lane) => ({
      key: lane.key,
      plan: lane.plan,
      limit: 12,
    }));
  },
};

export const SPECIAL_REGION_SUPPLEMENT_REGISTRY: Record<string, SpecialRegionSupplementHandler> = {
  golden_circle: goldenCircleHandler,
  westfjords: westfjordsHandler,
};

/** 按 regionTags 顺序构建补检车道（去重） */
export function buildSpecialRegionSupplementLanes(
  regionTags: string[],
  input: SpecialRegionSupplementInput,
): SpecialRegionSupplementLane[] {
  const lanes: SpecialRegionSupplementLane[] = [];
  const seen = new Set<string>();

  for (const tag of regionTags) {
    const handler = SPECIAL_REGION_SUPPLEMENT_REGISTRY[tag];
    if (!handler || seen.has(tag)) continue;
    seen.add(tag);
    lanes.push(...handler.buildLanes(input));
  }

  return lanes;
}
