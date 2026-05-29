import type { AgentMemoryUserBasics } from '../interfaces/agent-memory-context.interface';
import type { RouteRunPartyProfileSnapshot } from '../interfaces/agent-memory-context.interface';
import type {
  RiskTolerance,
  TravelPhilosophy,
  UserTravelProfile,
} from '../interfaces/user-travel-profile.interface';

function normInterestCode(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, '_');
}

/** L1：由旅行哲学派生的隐式兴趣码（与设置页景点枚举可部分重叠，供 mergedInterests 尾部补位）。 */
export function travelPhilosophyToImplicitInterestCodes(philosophy?: TravelPhilosophy): string[] {
  switch (philosophy) {
    case 'ADVENTURE':
      return ['ADVENTURE'];
    case 'SCENIC':
      return ['SCENIC', 'NATURE'];
    case 'RELAXED':
      return ['RELAXED', 'LEISURE'];
    default:
      return [];
  }
}

/** 高风险：尾部偏探索/自然序列；低风险：尾部偏城市/文化主序列（确定性 tie-break）。 */
const HIGH_RISK_TAIL_PRIORITY: readonly string[] = [
  'ADVENTURE',
  'HIKING',
  'NATURE',
  'SEA',
  'ROAD_TRIP',
  'CULTURAL',
  'URBAN',
  'RELAXED',
  'LEISURE',
  'SCENIC',
];

const LOW_RISK_TAIL_PRIORITY: readonly string[] = [
  'CULTURAL',
  'URBAN',
  'NATURE',
  'SCENIC',
  'RELAXED',
  'LEISURE',
  'HIKING',
  'SEA',
  'ROAD_TRIP',
  'ADVENTURE',
];

export function sortInterestTailByRiskTolerance(codes: readonly string[], risk: RiskTolerance | undefined): string[] {
  if (codes.length <= 1) return [...codes];
  const order = risk === 'HIGH' ? HIGH_RISK_TAIL_PRIORITY : LOW_RISK_TAIL_PRIORITY;
  const rank = (c: string) => {
    const i = order.indexOf(c);
    return i === -1 ? 999 : i;
  };
  return [...codes].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * L0 显式景点类型优先，L1（路线类型 + 哲学隐式码）去重补尾；`riskTolerance` 仅对 **L1 尾部** 做二次排序。
 * 供 `AgentMemoryContext.travelPreference` 单桶消费。
 */
export function buildMergedTravelPreferenceSummary(input: {
  profile: UserTravelProfile | null;
  routeParty: RouteRunPartyProfileSnapshot | null;
  basics: AgentMemoryUserBasics | null;
}): Record<string, unknown> | null {
  const { profile, routeParty, basics } = input;

  const fromProfile = profile
    ? {
        pacePreference: profile.pacePreference,
        riskTolerance: profile.riskTolerance,
        travelPhilosophy: profile.travelPhilosophy,
        preferredRouteTypes: profile.preferredRouteTypes,
        confidence: profile.confidence,
      }
    : null;

  const fromRoute =
    routeParty &&
    (routeParty.fitness_level != null ||
      routeParty.risk_tolerance != null ||
      routeParty.party_total != null ||
      routeParty.has_children != null ||
      routeParty.has_elderly != null ||
      (typeof routeParty.mobility_note_zh === 'string' && routeParty.mobility_note_zh.trim().length > 0))
      ? {
          route_fitness_level: routeParty.fitness_level ?? null,
          route_risk_tolerance: routeParty.risk_tolerance ?? null,
          route_party_total: routeParty.party_total ?? null,
          route_has_children: routeParty.has_children ?? null,
          route_has_elderly: routeParty.has_elderly ?? null,
          route_mobility_note_zh: routeParty.mobility_note_zh?.trim() ?? null,
        }
      : null;

  const l0Codes = (basics?.preferredAttractionTypes?.length
    ? [...basics.preferredAttractionTypes]
    : []
  )
    .map(t => normInterestCode(String(t)))
    .filter(Boolean);
  const l0Set = new Set(l0Codes);

  const routeTypeCodes = (profile?.preferredRouteTypes ?? []).map(rt => normInterestCode(String(rt)));
  const philosophyCodes = travelPhilosophyToImplicitInterestCodes(profile?.travelPhilosophy).map(normInterestCode);
  const l1Candidates = [...routeTypeCodes, ...philosophyCodes].filter(Boolean);
  const l1TailUnique = [...new Set(l1Candidates.filter(c => !l0Set.has(c)))];

  const mergedInterests =
    l0Codes.length > 0
      ? [...l0Codes, ...sortInterestTailByRiskTolerance(l1TailUnique, profile?.riskTolerance)]
      : sortInterestTailByRiskTolerance([...new Set(l1Candidates)], profile?.riskTolerance);

  const hasExplicitSettings = (basics?.preferredAttractionTypes?.length ?? 0) > 0;
  const constraintStrictness = hasExplicitSettings ? 'high' : 'normal';
  const explorationBias = profile?.riskTolerance === 'HIGH' ? 'high' : 'normal';

  const hasAnySignal =
    fromProfile != null ||
    fromRoute != null ||
    mergedInterests.length > 0 ||
    hasExplicitSettings ||
    !!basics?.nationality ||
    !!basics?.residencyCountry ||
    (basics?.tags?.length ?? 0) > 0 ||
    (basics?.dietaryRestrictions?.length ?? 0) > 0;

  if (!hasAnySignal) {
    return null;
  }

  return {
    ...(fromProfile ?? {}),
    ...(fromRoute ?? {}),
    mergedInterests,
    hasExplicitSettings,
    constraintStrictness,
    explorationBias,
    confidence: profile?.confidence ?? (hasExplicitSettings ? 0.5 : 0.3),
    ...(basics?.profilePreferencesUpdatedAt
      ? { l0_preferences_updated_at: basics.profilePreferencesUpdatedAt }
      : {}),
  };
}
