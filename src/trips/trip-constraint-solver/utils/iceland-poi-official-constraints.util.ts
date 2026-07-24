/**
 * 冰岛 POI 准入规则 → 动态官方约束卡片（按行程 POI + 日期窗口）
 */

import { ICELAND_ALL_ACCESS_RULES } from '../../../poi-access-capacity/fixtures/iceland-poi-registry';
import type { PoiAccessRule } from '../../../poi-access-capacity/interfaces/poi-access-capacity.interface';
import {
  readCanonicalPoiIdFromMetadata,
  resolveCanonicalPoiIdSync,
  resolvePoiIdsFromTextBlob,
} from '../../../canonical-poi-resolution/utils/resolve-poi-id-sync.util';
import type { TripConstraint } from '../types/trip-constraint.types';

export const OFFICIAL_POI_CONSTRAINT_ID_PREFIX = 'c_official_poi_';

export function officialConstraintIdForPoiAccessRule(ruleId: string): string {
  return `${OFFICIAL_POI_CONSTRAINT_ID_PREFIX}${ruleId.replace(/\./g, '_')}`;
}

export function isOfficialPoiConstraintId(id: string): boolean {
  return id.startsWith(OFFICIAL_POI_CONSTRAINT_ID_PREFIX);
}

const POI_SHORT_LABEL: Record<string, string> = {
  'is.landmannalaugar': 'Landmannalaugar',
  'is.blue_lagoon': '蓝湖',
  'is.sky_lagoon': 'Sky Lagoon',
  'is.skaftafell': 'Skaftafell',
  'is.dyrholaey': 'Dyrhólaey',
  'is.reynisfjara': 'Reynisfjara 黑沙滩',
  'is.dettifoss': 'Dettifoss',
  'is.thingvellir': 'Þingvellir',
};

type ItineraryPlaceLike = {
  nameCN?: string | null;
  nameEN?: string | null;
  metadata?: unknown;
};

export type IcelandItineraryItemLike = {
  type?: string;
  note?: string | null;
  Place?: ItineraryPlaceLike | null;
};

export type IcelandTripContextLike = {
  id: string;
  destination?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  TripDay?: Array<{
    date?: Date;
    ItineraryItem?: IcelandItineraryItemLike[];
  }>;
  metadata?: unknown;
};

function readMustPlaces(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const constraints = (metadata as Record<string, unknown>).constraints;
  if (!constraints || typeof constraints !== 'object') return [];
  const must = (constraints as Record<string, unknown>).mustPlaces;
  return Array.isArray(must) ? must.map(String) : [];
}

export function collectItineraryMatchTexts(input: {
  tripDays?: IcelandTripContextLike['TripDay'];
  mustPlaces?: string[];
}): string[] {
  const parts: string[] = [...(input.mustPlaces ?? [])];
  for (const day of input.tripDays ?? []) {
    for (const item of day.ItineraryItem ?? []) {
      parts.push(item.type ?? '', item.note ?? '');
      parts.push(item.Place?.nameCN ?? '', item.Place?.nameEN ?? '');
    }
  }
  return parts.filter(Boolean);
}

export function resolveIcelandPoiSlugsFromTrip(trip: IcelandTripContextLike): string[] {
  const slugs = new Set<string>();
  const mustPlaces = readMustPlaces(trip.metadata);
  const countryCode = 'IS';

  for (const day of trip.TripDay ?? []) {
    for (const item of day.ItineraryItem ?? []) {
      const fromMeta = readCanonicalPoiIdFromMetadata(item.Place?.metadata);
      if (fromMeta) {
        slugs.add(fromMeta);
        continue;
      }

      const name = [item.Place?.nameCN, item.Place?.nameEN, item.note].filter(Boolean).join(' ');
      const resolved = resolveCanonicalPoiIdSync({ name, countryCode });
      if (resolved.poiId && resolved.status === 'MATCHED') {
        slugs.add(resolved.poiId);
      }
    }
  }

  for (const mention of mustPlaces) {
    const resolved = resolveCanonicalPoiIdSync({ name: mention, countryCode });
    if (resolved.poiId && resolved.status === 'MATCHED') {
      slugs.add(resolved.poiId);
    }
  }

  const blob = collectItineraryMatchTexts({ tripDays: trip.TripDay, mustPlaces }).join('\n');
  for (const poiId of resolvePoiIdsFromTextBlob(blob, countryCode)) {
    slugs.add(poiId);
  }

  return Array.from(slugs);
}

function tripDateRange(trip: IcelandTripContextLike): { start: Date; end: Date } | null {
  if (trip.startDate && trip.endDate) {
    return { start: trip.startDate, end: trip.endDate };
  }
  const days = (trip.TripDay ?? []).map((d) => d.date).filter(Boolean) as Date[];
  if (days.length === 0) return null;
  days.sort((a, b) => a.getTime() - b.getTime());
  return { start: days[0], end: days[days.length - 1] };
}

export function poiAccessRuleOverlapsTripDates(
  rule: PoiAccessRule,
  range: { start: Date; end: Date },
): boolean {
  if (!rule.validFrom && !rule.validTo) return true;
  const tripStart = range.start.getTime();
  const tripEnd = range.end.getTime();
  if (rule.validFrom) {
    const from = new Date(`${rule.validFrom}T00:00:00.000Z`).getTime();
    if (tripEnd < from) return false;
  }
  if (rule.validTo) {
    const to = new Date(`${rule.validTo}T23:59:59.999Z`).getTime();
    if (tripStart > to) return false;
  }
  return true;
}

function shouldExposePoiAccessRule(rule: PoiAccessRule): boolean {
  if (rule.status === 'INACTIVE') return false;
  if (rule.enforcement === 'HARD') return true;
  if (rule.reservationRequired) return true;
  if (rule.ruleType === 'RESERVATION_REQUIRED' || rule.ruleType === 'PARKING_RESERVATION') {
    return true;
  }
  if (rule.ruleType === 'VEHICLE_RESTRICTION') return true;
  if (rule.ruleType === 'TRAIL_RESTRICTION' && rule.enforcement !== 'SOFT') return true;
  if (rule.ruleType === 'SAFETY_RESTRICTION' && rule.enforcement === 'SOFT') return true;
  return false;
}

function ruleSeverity(rule: PoiAccessRule): 'CRITICAL' | 'WARNING' {
  if (rule.enforcement === 'SOFT') return 'WARNING';
  if (rule.ruleType === 'SAFETY_RESTRICTION') return 'WARNING';
  if (rule.status === 'PENDING_CONFIRMATION') return 'WARNING';
  return 'CRITICAL';
}

function ruleDisplayName(rule: PoiAccessRule): string {
  const poi = POI_SHORT_LABEL[rule.poiId] ?? rule.poiId;
  switch (rule.ruleType) {
    case 'PARKING_RESERVATION':
      return `${poi} 停车预约`;
    case 'RESERVATION_REQUIRED':
      return `${poi} 须预约入场`;
    case 'VEHICLE_RESTRICTION':
      return `${poi} 车型/路况限制`;
    case 'TRAIL_RESTRICTION':
      return `${poi} 步道/进入限制`;
    case 'SAFETY_RESTRICTION':
      return `${poi} 安全提示`;
    default:
      return `${poi} 准入规则`;
  }
}

function ruleCategory(rule: PoiAccessRule): TripConstraint['category'] {
  if (rule.ruleType === 'VEHICLE_RESTRICTION') return 'TRANSPORT';
  if (rule.ruleType === 'SAFETY_RESTRICTION') return 'SAFETY';
  return 'ACTIVITY';
}

function poiDestinationRuleMeta(rule: PoiAccessRule): {
  destinationRuleCategory: import('../types/trip-constraint.types').DestinationRuleCategory;
  destinationRuleTier: import('../types/trip-constraint.types').DestinationRuleTier;
  templateId: string;
  sourceAgency: string;
  applicableScope: string;
  judgmentRule: string;
  violationResult: string;
  evidenceRef?: string;
} {
  const poi = POI_SHORT_LABEL[rule.poiId] ?? rule.poiId;
  const severity = ruleSeverity(rule);
  if (rule.ruleType === 'RESERVATION_REQUIRED' || rule.ruleType === 'PARKING_RESERVATION') {
    return {
      destinationRuleCategory: 'VENUE_ACCESS',
      destinationRuleTier: 'CONDITIONAL',
      templateId: 'poi_reservation_required',
      sourceAgency: '景点运营方',
      applicableScope: `${poi} 入场/停车`,
      judgmentRule: `${poi} 须提前预约方可入场`,
      violationResult: '检查条件是否满足',
      evidenceRef: rule.sourceUrl,
    };
  }
  if (rule.ruleType === 'VEHICLE_RESTRICTION') {
    return {
      destinationRuleCategory: 'TRAFFIC',
      destinationRuleTier: severity === 'WARNING' ? 'CONDITIONAL' : 'BLOCK',
      templateId: 'poi_vehicle_restriction',
      sourceAgency: '冰岛道路 / 景区管理',
      applicableScope: `${poi} 周边路况`,
      judgmentRule: rule.notes ?? `${poi} 车型或路况限制`,
      violationResult: severity === 'WARNING' ? '检查条件是否满足' : '阻断路线',
      evidenceRef: rule.sourceUrl,
    };
  }
  if (rule.ruleType === 'SAFETY_RESTRICTION') {
    return {
      destinationRuleCategory: 'NATURAL_RISK',
      destinationRuleTier: 'ADVISORY',
      templateId: 'poi_safety_advisory',
      sourceAgency: '景区安全指引',
      applicableScope: poi,
      judgmentRule: rule.notes ?? `${poi} 安全提示`,
      violationResult: '影响风险评分',
      evidenceRef: rule.sourceUrl,
    };
  }
  return {
    destinationRuleCategory: 'REGULATION',
    destinationRuleTier: severity === 'WARNING' ? 'ADVISORY' : 'CONDITIONAL',
    templateId: 'poi_access_rule',
    sourceAgency: '目的地管理方',
    applicableScope: poi,
    judgmentRule: rule.notes ?? `${poi} 准入规则`,
    violationResult: severity === 'WARNING' ? '影响风险评分' : '检查条件是否满足',
    evidenceRef: rule.sourceUrl,
  };
}

function poiRuleToConstraint(
  trip: IcelandTripContextLike,
  rule: PoiAccessRule,
  userId: string,
): TripConstraint {
  const severity = ruleSeverity(rule);
  const meta = poiDestinationRuleMeta(rule);
  return {
    id: officialConstraintIdForPoiAccessRule(rule.id),
    tripId: trip.id,
    name: ruleDisplayName(rule),
    description: rule.notes,
    category: ruleCategory(rule),
    type: 'EXTERNAL',
    status: rule.status === 'PENDING_CONFIRMATION' ? 'DRAFT' : 'ACTIVE',
    scope: { type: 'ITEM', ids: [rule.poiId] },
    operator: 'CUSTOM',
    value: {
      poiAccessRuleId: rule.id,
      poiId: rule.poiId,
      ruleType: rule.ruleType,
      countryCode: 'IS',
      severity,
      validFrom: rule.validFrom,
      validTo: rule.validTo,
      sourceUrl: rule.sourceUrl,
      templateId: meta.templateId,
      destinationRuleCategory: meta.destinationRuleCategory,
      destinationRuleTier: meta.destinationRuleTier,
      sourceAgency: meta.sourceAgency,
      applicableScope: meta.applicableScope,
      judgmentRule: meta.judgmentRule,
      violationResult: meta.violationResult,
      evidenceRef: meta.evidenceRef,
      evidenceVerifiedAt: trip.updatedAt.toISOString(),
    },
    allowRelaxation: meta.destinationRuleTier === 'ADVISORY',
    locked: true,
    source: { type: 'OFFICIAL_RULE', sourceId: rule.id, templateId: meta.templateId },
    visibility: 'TEAM',
    createdBy: userId,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
    backing: { kind: 'official_rule', field: `poi-access:${rule.id}` },
    enabled: true,
  };
}

export function buildIcelandPoiOfficialConstraints(
  trip: IcelandTripContextLike,
  userId: string,
): TripConstraint[] {
  const slugs = resolveIcelandPoiSlugsFromTrip(trip);
  if (slugs.length === 0) return [];

  const slugSet = new Set(slugs);
  const range = tripDateRange(trip);
  const rules = ICELAND_ALL_ACCESS_RULES.filter((r) => slugSet.has(r.poiId) && shouldExposePoiAccessRule(r));
  const filtered = range
    ? rules.filter((r) => poiAccessRuleOverlapsTripDates(r, range))
    : rules;

  const byId = new Map<string, PoiAccessRule>();
  for (const rule of filtered) {
    byId.set(rule.id, rule);
  }

  return Array.from(byId.values()).map((rule) => poiRuleToConstraint(trip, rule, userId));
}

/** POI issue / conflict 文本 → 官方 POI 约束 ID */
export function inferOfficialPoiConstraintIdsFromConflict(
  conflict: import('../types/planning-conflicts.types').PlanningConflictItem,
): string[] {
  const ids = new Set<string>();
  const issue = conflict.issue;
  const msg = `${conflict.title} ${conflict.message}`.toLowerCase();

  for (const proof of issue?.proofs ?? []) {
    if (proof.ruleId) {
      ids.add(officialConstraintIdForPoiAccessRule(proof.ruleId));
    }
  }

  const poiId = issue?.visitorAccess?.evaluation?.poiId;
  if (poiId) {
    for (const rule of ICELAND_ALL_ACCESS_RULES) {
      if (rule.poiId === poiId) {
        ids.add(officialConstraintIdForPoiAccessRule(rule.id));
      }
    }
  } else {
    const resolved = resolveCanonicalPoiIdSync({
      name: `${conflict.title} ${conflict.message}`,
      countryCode: 'IS',
    });
    if (resolved.poiId && resolved.status === 'MATCHED') {
      for (const rule of ICELAND_ALL_ACCESS_RULES) {
        if (rule.poiId === resolved.poiId) {
          ids.add(officialConstraintIdForPoiAccessRule(rule.id));
        }
      }
    }
  }

  for (const rule of ICELAND_ALL_ACCESS_RULES) {
    const label = (POI_SHORT_LABEL[rule.poiId] ?? '').toLowerCase();
    const slugTail = rule.poiId.split('.').pop() ?? '';
    if (label && msg.includes(label.toLowerCase())) {
      ids.add(officialConstraintIdForPoiAccessRule(rule.id));
    }
    if (slugTail && msg.includes(slugTail)) {
      ids.add(officialConstraintIdForPoiAccessRule(rule.id));
    }
    if (msg.includes(rule.id.toLowerCase())) {
      ids.add(officialConstraintIdForPoiAccessRule(rule.id));
    }
  }

  if (/poi_access|预约|reservation|parking|landmannalaugar|蓝湖|blue lagoon|skaftafell|dettifoss|黑沙滩|reynisfjara|dyrhólaey|dyrholaey|entity\.(access|mandatory|parking)/i.test(msg)) {
    for (const rule of ICELAND_ALL_ACCESS_RULES) {
      if (/landmannalaugar|兰德曼纳/i.test(msg) && rule.poiId.includes('landmannalaugar')) {
        ids.add(officialConstraintIdForPoiAccessRule(rule.id));
      }
      if (/blue lagoon|蓝湖/i.test(msg) && rule.poiId.includes('blue_lagoon')) {
        ids.add(officialConstraintIdForPoiAccessRule(rule.id));
      }
    }
  }

  return Array.from(ids);
}
