import type {
  CanonicalActivityType,
  TravelGraphDependency,
  TravelIntentTag,
} from '../contracts/canonical-travel-graph.types';

export type IcelandPoiSemanticRule = {
  poiId: string;
  intentTags: TravelIntentTag[];
  activityType?: CanonicalActivityType;
  requiresBooking?: boolean;
  bookingKind?: 'ticket' | 'tour' | 'rental_car' | 'hotel' | 'ferry' | 'other';
  requiresGuide?: boolean;
  requiresFRoad?: boolean;
  constraintCode?: string;
  constraintMessage?: string;
};

/** Iceland MVP — keyed by canonical poiId (aligned with CPRE catalog) */
export const ICELAND_POI_SEMANTIC_RULES: IcelandPoiSemanticRule[] = [
  {
    poiId: 'is.blue_lagoon',
    intentTags: ['relax', 'wellness'],
    activityType: 'spa',
    requiresBooking: true,
    bookingKind: 'ticket',
    constraintCode: 'IS_BLUE_LAGOON_BOOKING',
    constraintMessage: '蓝湖通常需提前预约门票',
  },
  {
    poiId: 'is.sky_lagoon',
    intentTags: ['relax', 'wellness'],
    activityType: 'spa',
    requiresBooking: true,
    bookingKind: 'ticket',
  },
  {
    poiId: 'is.landmannalaugar',
    intentTags: ['adventure', 'nature'],
    activityType: 'hiking',
    requiresFRoad: true,
    requiresBooking: true,
    bookingKind: 'ticket',
    constraintCode: 'IS_F_ROAD_REQUIRED',
    constraintMessage: 'Landmannalaugar 高地路段需 F-road 开放季与 4WD',
  },
  {
    poiId: 'is.reynisfjara',
    intentTags: ['photography', 'nature'],
    activityType: 'sightseeing',
    constraintCode: 'IS_COAST_SAFETY',
    constraintMessage: '黑沙滩须注意浪潮与离岸流',
  },
  {
    poiId: 'is.jokulsarlon',
    intentTags: ['photography', 'nature'],
    activityType: 'sightseeing',
  },
];

const KEYWORD_INTENT_RULES: Array<{ pattern: RegExp; intents: TravelIntentTag[]; activityType?: CanonicalActivityType }> = [
  { pattern: /温泉|spa|lagoon|泡/i, intents: ['relax', 'wellness'], activityType: 'spa' },
  { pattern: /冰川|ice cave|冰洞/i, intents: ['adventure'], activityType: 'ice_hiking' },
  { pattern: /观鲸|whale/i, intents: ['nature'], activityType: 'tour' },
  { pattern: /摄影|photo|拍照/i, intents: ['photography'] },
  { pattern: /黄金圈|golden circle/i, intents: ['sightseeing', 'culture'] },
];

export function resolveIcelandPoiRule(poiId?: string): IcelandPoiSemanticRule | undefined {
  if (!poiId) return undefined;
  return ICELAND_POI_SEMANTIC_RULES.find((r) => r.poiId === poiId);
}

export function inferIntentFromText(rawText: string): {
  intentTags: TravelIntentTag[];
  activityType?: CanonicalActivityType;
} {
  const intentTags = new Set<TravelIntentTag>();
  let activityType: CanonicalActivityType | undefined;

  for (const rule of KEYWORD_INTENT_RULES) {
    if (rule.pattern.test(rawText)) {
      rule.intents.forEach((t) => intentTags.add(t));
      activityType = activityType ?? rule.activityType;
    }
  }

  if (intentTags.size === 0) {
    intentTags.add('sightseeing');
  }

  return { intentTags: [...intentTags], activityType };
}

export function buildDependencyFromRule(
  rule: IcelandPoiSemanticRule,
  subjectNodeId: string,
): TravelGraphDependency[] {
  const deps: TravelGraphDependency[] = [];
  if (rule.requiresBooking) {
    deps.push({
      dependencyId: `dep_booking_${subjectNodeId}`,
      kind: 'REQUIRES_BOOKING',
      subjectNodeId,
      objectRef: rule.bookingKind ?? 'ticket',
      satisfied: false,
      reason: 'Compile-time: booking status unknown',
    });
  }
  if (rule.requiresGuide) {
    deps.push({
      dependencyId: `dep_guide_${subjectNodeId}`,
      kind: 'REQUIRES_GUIDE',
      subjectNodeId,
      objectRef: 'guide',
      satisfied: false,
      reason: 'Activity requires licensed guide',
    });
  }
  if (rule.requiresFRoad) {
    deps.push({
      dependencyId: `dep_froad_${subjectNodeId}`,
      kind: 'REQUIRES_F_ROAD',
      subjectNodeId,
      objectRef: 'f-road-open',
      satisfied: false,
      reason: 'Highland / F-road access required',
    });
  }
  return deps;
}
