/**
 * 从 EffectiveTravelerContext.effective 投影 UserTravelProfile 覆盖字段。
 *
 * 用于 M2：ETC → DecisionParams（经现有 profile mapper，避免平行映射逻辑）。
 * L2 override 已在 Resolver 的 effective.* winner 中体现。
 */

import type {
  PacePreference,
  RiskTolerance,
  TravelPhilosophy,
  UserTravelProfile,
  RouteType,
} from '../../agent/memory/interfaces/user-travel-profile.interface';
import type {
  EffectiveMemoryItemV1,
  EffectiveTravelerContextV1,
} from './effective-traveler-context.types';
import { mayEnterHardDecisionSurface } from './effective-memory-authority.util';

export type ProjectProfileFromEtcResult = {
  profile: UserTravelProfile;
  /** 相对 base 被 ETC 改写的字段 */
  appliedFields: string[];
  /** 来自 L2 的字段 */
  l2Fields: string[];
};

function asPace(value: unknown): PacePreference | undefined {
  const v = String(value ?? '')
    .trim()
    .toUpperCase();
  if (!v) return undefined;
  if (v === 'SLOW' || /RELAX|轻松|慢/.test(v)) return 'SLOW';
  if (v === 'FAST' || /DENSE|PACKED|密集|快/.test(v)) return 'FAST';
  if (v === 'MODERATE' || v === 'MEDIUM' || /平衡|适中/.test(v)) return 'MODERATE';
  return undefined;
}

function asRisk(value: unknown): RiskTolerance | undefined {
  const v = String(value ?? '')
    .trim()
    .toUpperCase();
  if (v === 'LOW' || v === 'MEDIUM' || v === 'HIGH') return v;
  return undefined;
}

function asPhilosophy(value: unknown): TravelPhilosophy | undefined {
  const v = String(value ?? '')
    .trim()
    .toUpperCase();
  if (v === 'SCENIC' || v === 'ADVENTURE' || v === 'RELAXED') return v;
  if (/自然|风景|SCENIC/.test(v)) return 'SCENIC';
  if (/冒险|ADVENTURE/.test(v)) return 'ADVENTURE';
  if (/轻松|休闲|RELAX/.test(v)) return 'RELAXED';
  return undefined;
}

const ROUTE_TYPES: ReadonlySet<string> = new Set([
  'HIKING',
  'ROAD_TRIP',
  'SEA',
  'URBAN',
  'CULTURAL',
  'NATURE',
]);

function asRouteTypes(value: unknown): RouteType[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: RouteType[] = [];
  for (const raw of value) {
    const v = String(raw ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
    if (ROUTE_TYPES.has(v)) out.push(v as RouteType);
  }
  return out.length > 0 ? out : undefined;
}

function layerOf(item: EffectiveMemoryItemV1 | undefined): string | undefined {
  return item?.layer;
}

function hardEligible(item: EffectiveMemoryItemV1 | undefined): item is EffectiveMemoryItemV1 {
  return !!item && mayEnterHardDecisionSurface(item);
}

/**
 * 以 base profile 为底，用 ETC.effective winners 覆盖可映射字段。
 * HABIT(CONTEXT) 不进硬面；CONSTRAINT / L2·REQUEST / L1 ADVISORY 可映射。
 */
export function projectUserTravelProfileFromEffectiveContext(
  base: UserTravelProfile,
  etc: EffectiveTravelerContextV1,
): ProjectProfileFromEtcResult {
  const profile: UserTravelProfile = {
    ...base,
    preferredRouteTypes: base.preferredRouteTypes
      ? [...base.preferredRouteTypes]
      : undefined,
    drivingFatiguePreferences: base.drivingFatiguePreferences
      ? { ...base.drivingFatiguePreferences }
      : undefined,
    companions: base.companions ? { ...base.companions } : undefined,
    updatedAt: base.updatedAt,
  };

  const appliedFields: string[] = [];
  const l2Fields: string[] = [];

  const paceItem = etc.effective.pace;
  if (hardEligible(paceItem)) {
    const pace = asPace(paceItem.value);
    if (pace && pace !== profile.pacePreference) {
      profile.pacePreference = pace;
      appliedFields.push('pacePreference');
      if (layerOf(paceItem) === 'L2_TRIP_OVERRIDE') l2Fields.push('pacePreference');
    } else if (pace && pace === profile.pacePreference && layerOf(paceItem) === 'L2_TRIP_OVERRIDE') {
      l2Fields.push('pacePreference');
    } else if (pace && !profile.pacePreference) {
      profile.pacePreference = pace;
      appliedFields.push('pacePreference');
      if (layerOf(paceItem) === 'L2_TRIP_OVERRIDE') l2Fields.push('pacePreference');
    }
  }

  const riskItem = etc.effective.riskTolerance;
  if (hardEligible(riskItem)) {
    const risk = asRisk(riskItem.value);
    if (risk && risk !== profile.riskTolerance) {
      profile.riskTolerance = risk;
      appliedFields.push('riskTolerance');
      if (layerOf(riskItem) === 'L2_TRIP_OVERRIDE' || layerOf(riskItem) === 'REQUEST_OVERLAY') {
        l2Fields.push('riskTolerance');
      }
    } else if (risk && !profile.riskTolerance) {
      profile.riskTolerance = risk;
      appliedFields.push('riskTolerance');
    }
  }

  const philosophyItem = etc.items.find(
    (i) => i.key === 'travel_philosophy' && i.domain === 'EXPERIENCE',
  );
  const philosophyWinner =
    etc.items
      .filter((i) => i.key === 'travel_philosophy')
      .sort((a, b) => {
        const rank = (l: string) =>
          l === 'L2_TRIP_OVERRIDE' ? 4 : l === 'REQUEST_OVERLAY' ? 3 : 1;
        return rank(b.layer) - rank(a.layer);
      })[0] ?? philosophyItem;
  if (hardEligible(philosophyWinner)) {
    const philosophy = asPhilosophy(philosophyWinner.value);
    if (philosophy && philosophy !== profile.travelPhilosophy) {
      profile.travelPhilosophy = philosophy;
      appliedFields.push('travelPhilosophy');
    } else if (philosophy && !profile.travelPhilosophy) {
      profile.travelPhilosophy = philosophy;
      appliedFields.push('travelPhilosophy');
    }
  }

  const routeItem = etc.items.find((i) => i.key === 'preferred_route_types');
  if (hardEligible(routeItem)) {
    const routes = asRouteTypes(routeItem.value);
    if (routes?.length) {
      const prev = (profile.preferredRouteTypes ?? []).join(',');
      const next = routes.join(',');
      if (prev !== next) {
        profile.preferredRouteTypes = routes;
        appliedFields.push('preferredRouteTypes');
      }
    }
  }

  // confidence：取 ETC winners 的平均置信与 base 的较大值，避免无端降权
  const confSamples = [
    etc.effective.pace?.confidence,
    etc.effective.riskTolerance?.confidence,
  ].filter((c): c is number => typeof c === 'number' && Number.isFinite(c));
  if (confSamples.length > 0) {
    const avg = confSamples.reduce((a, b) => a + b, 0) / confSamples.length;
    const next = Math.max(profile.confidence, avg);
    if (next !== profile.confidence) {
      profile.confidence = next;
      appliedFields.push('confidence');
    }
  }

  if (appliedFields.length > 0 || l2Fields.length > 0) {
    if (profile.source === 'inferred') {
      profile.source = 'mixed';
    } else if (l2Fields.length > 0 && profile.source === 'explicit') {
      profile.source = 'mixed';
    }
  }

  return { profile, appliedFields, l2Fields };
}
