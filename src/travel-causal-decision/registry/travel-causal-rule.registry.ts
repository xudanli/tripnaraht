/**
 * TravelCausalRule registry — P0 standard cases + Destination Pack migration.
 */

import { STANDARD_CAUSAL_CASE_IDS } from '../fixtures/case-ids';
import {
  TRAVEL_CAUSAL_RULE_SCHEMA,
  type TravelCausalRule,
} from '../types/travel-causal-rule.types';
import { loadPackTravelCausalRules } from './load-pack-causal-rules';

const VALID_FROM = '2026-07-01T00:00:00.000Z';

export const STANDARD_CAUSAL_RULES: TravelCausalRule[] = [
  {
    schema: TRAVEL_CAUSAL_RULE_SCHEMA,
    ruleId: 'is.wind.gust_reduces_speed',
    version: '1.0.0',
    cause: [
      {
        predicateId: 'weather.gust_mps_gte',
        params: { thresholdMps: 18 },
        label: '阵风达到或超过阈值',
      },
    ],
    effects: [
      {
        effectType: 'DRIVING_SPEED_REDUCED',
        affectedEntityType: 'SEGMENT',
        predictedChange: { speedFactorDelta: -0.2 },
        explanationKey: 'wind_reduces_safe_speed',
      },
    ],
    basis: 'PHYSICAL',
    evidenceRefs: ['vedur.is', 'iceland_self_drive_causal.engine'],
    validFrom: VALID_FROM,
    reviewStatus: 'APPROVED',
    confidence: 0.88,
    destinationPack: 'IS',
    caseTags: [STANDARD_CAUSAL_CASE_IDS.STRONG_WIND_APPOINTMENT],
  },
  {
    schema: TRAVEL_CAUSAL_RULE_SCHEMA,
    ruleId: 'is.wind.delay_misses_checkin',
    version: '1.0.0',
    cause: [
      { predicateId: 'segment.eta_p90_exceeds_slack', label: 'P90 延误超过预约缓冲' },
    ],
    effects: [
      {
        effectType: 'ACTIVITY_WINDOW_MISSED',
        affectedEntityType: 'ACTIVITY',
        predictedChange: { missProbabilityMin: 0.5 },
        explanationKey: 'delay_misses_checkin_window',
      },
    ],
    basis: 'DOMAIN_EXPERT',
    evidenceRefs: ['iceland_self_drive_causal.engine', 'wind-causal-chain.rules'],
    validFrom: VALID_FROM,
    reviewStatus: 'APPROVED',
    confidence: 0.85,
    destinationPack: 'IS',
    caseTags: [STANDARD_CAUSAL_CASE_IDS.STRONG_WIND_APPOINTMENT],
  },
  {
    schema: TRAVEL_CAUSAL_RULE_SCHEMA,
    ruleId: 'is.road.closed_forces_detour',
    version: '1.0.0',
    cause: [
      { predicateId: 'road.segment_closed', label: '路段封闭' },
    ],
    effects: [
      {
        effectType: 'ROUTE_DETOUR_REQUIRED',
        affectedEntityType: 'SEGMENT',
        predictedChange: { detourMinutesMin: 40 },
        explanationKey: 'road_closed_detour',
      },
    ],
    basis: 'REGULATION',
    evidenceRefs: ['road.is', 'pack:IS_ROAD_CLOSED_BLOCK'],
    validFrom: VALID_FROM,
    reviewStatus: 'APPROVED',
    confidence: 0.92,
    destinationPack: 'IS',
    caseTags: [STANDARD_CAUSAL_CASE_IDS.ROAD_CLOSURE_OVERNIGHT],
  },
  {
    schema: TRAVEL_CAUSAL_RULE_SCHEMA,
    ruleId: 'is.detour.overnight_cascade',
    version: '1.0.0',
    cause: [
      { predicateId: 'driving.daily_minutes_exceeds_limit', label: '绕行后日驾驶超限' },
    ],
    effects: [
      {
        effectType: 'OVERNIGHT_ARRIVAL_LATE',
        affectedEntityType: 'DAY',
        predictedChange: { nextDayImpact: true },
        explanationKey: 'late_overnight_affects_next_day',
      },
    ],
    basis: 'DOMAIN_EXPERT',
    evidenceRefs: ['dre-daily-load-constraint', 'overnight-restructuring'],
    validFrom: VALID_FROM,
    reviewStatus: 'APPROVED',
    confidence: 0.8,
    destinationPack: 'IS',
    caseTags: [STANDARD_CAUSAL_CASE_IDS.ROAD_CLOSURE_OVERNIGHT],
  },
  {
    schema: TRAVEL_CAUSAL_RULE_SCHEMA,
    ruleId: 'is.fatigue.sleep_deficit_raises_risk',
    version: '1.0.0',
    cause: [
      { predicateId: 'traveler.sleep_hours_lt', params: { hours: 6 }, label: '睡眠不足' },
      { predicateId: 'day.has_hike_and_long_drive', label: '同日徒步+长驾驶' },
    ],
    effects: [
      {
        effectType: 'FATIGUE_ACCUMULATION',
        affectedEntityType: 'TRAVELER',
        predictedChange: { fatigueIndexDelta: 0.25 },
        explanationKey: 'sleep_deficit_plus_load',
      },
      {
        effectType: 'DRIVING_RISK_INCREASED',
        affectedEntityType: 'SEGMENT',
        predictedChange: { riskBand: 'HIGH' },
        explanationKey: 'fatigue_raises_driving_risk',
      },
    ],
    basis: 'PHYSICAL',
    evidenceRefs: ['human_capability.model', 'dre-daily-load'],
    validFrom: VALID_FROM,
    reviewStatus: 'APPROVED',
    confidence: 0.78,
    destinationPack: 'IS',
    caseTags: [STANDARD_CAUSAL_CASE_IDS.MEMBER_FATIGUE],
  },
];

function mergeRules(base: TravelCausalRule[], extra: TravelCausalRule[]): TravelCausalRule[] {
  const byId = new Map<string, TravelCausalRule>();
  for (const r of base) byId.set(`${r.ruleId}@${r.version}`, r);
  for (const r of extra) {
    const key = `${r.ruleId}@${r.version}`;
    if (!byId.has(key)) byId.set(key, r);
  }
  return [...byId.values()];
}

/**
 * Full registry: hand-authored standard cases + Destination Pack rules for a country.
 * Pack rules use ids `pack:IS_ROAD_CLOSED_BLOCK` etc.
 */
export function listAllTravelCausalRules(opts?: {
  destinationPack?: string;
  caseTag?: string;
  reviewStatus?: TravelCausalRule['reviewStatus'];
  includePackRules?: boolean;
}): TravelCausalRule[] {
  const includePack = opts?.includePackRules !== false;
  const packCode = opts?.destinationPack ?? 'IS';
  const packRules = includePack ? loadPackTravelCausalRules(packCode) : [];
  const all = mergeRules(STANDARD_CAUSAL_RULES, packRules);

  return all.filter((r) => {
    if (opts?.caseTag && !r.caseTags?.includes(opts.caseTag)) return false;
    if (opts?.reviewStatus && r.reviewStatus !== opts.reviewStatus) return false;
    if (opts?.destinationPack && r.destinationPack !== opts.destinationPack) return false;
    return true;
  });
}

export function listTravelCausalRules(filter?: {
  caseTag?: string;
  reviewStatus?: TravelCausalRule['reviewStatus'];
  destinationPack?: string;
  includePackRules?: boolean;
}): TravelCausalRule[] {
  return listAllTravelCausalRules(filter);
}

export function getTravelCausalRule(
  ruleId: string,
  version?: string,
): TravelCausalRule | undefined {
  return listAllTravelCausalRules({ includePackRules: true }).find(
    (r) => r.ruleId === ruleId && (version == null || r.version === version),
  );
}

export function composeRuleVersionStamp(rules: TravelCausalRule[]): string {
  return rules
    .map((r) => `${r.ruleId}@${r.version}`)
    .sort()
    .join('+');
}
