/**
 * V1 Claim Grounding：确定性校验，不再二次 LLM。
 * Claim → evidenceKeys 是否存在 → 状态是否合法 → Strength 是否越界。
 */

import { assertEvidenceSufficiencyForConclusion } from '../harness/hardening/evidence.contract';
import type {
  System1Claim,
  System1ClaimGrounding,
  System1ClaimStrength,
  System1Evidence,
} from './system1-runtime.types';

const RANK: Record<System1ClaimStrength, number> = {
  STRONG: 3,
  CONDITIONAL: 2,
  WEAK: 1,
};

function minStrength(a: System1ClaimStrength, b: System1ClaimStrength): System1ClaimStrength {
  return RANK[a] <= RANK[b] ? a : b;
}

function strengthFromEvidence(rows: System1Evidence[]): System1ClaimStrength | null {
  if (rows.length === 0) return null;
  const check = assertEvidenceSufficiencyForConclusion({
    desiredStrength: 'STRONG',
    evidence: rows.map((e) => ({
      key: e.key,
      valueZh: typeof e.value === 'string' ? e.value : JSON.stringify(e.value ?? ''),
      freshness: e.status,
      source: e.sourceRef,
    })),
  });
  return check.strengthAllowed;
}

export function groundSystem1Claims(input: {
  claims: System1Claim[];
  evidence: System1Evidence[];
}): { grounded: System1Claim[]; dropped: System1Claim[]; result: System1ClaimGrounding[] } {
  const grounded: System1Claim[] = [];
  const dropped: System1Claim[] = [];
  const result: System1ClaimGrounding[] = [];

  for (const claim of input.claims) {
    const rows = input.evidence.filter((e) => claim.evidenceKeys.includes(e.key));
    const missingKeys = claim.evidenceKeys.filter((k) => !rows.some((e) => e.key === k));
    if (missingKeys.length || rows.some((e) => e.status === 'UNAVAILABLE')) {
      dropped.push(claim);
      result.push({
        claimId: claim.claimId,
        status: 'UNGROUNDED',
        strengthAllowed: 'WEAK',
        reason: `missing_or_unavailable:${missingKeys.join(',') || 'UNAVAILABLE'}`,
      });
      continue;
    }
    const allowed = strengthFromEvidence(rows) ?? 'WEAK';
    if (RANK[claim.strength] > RANK[allowed]) {
      if (allowed === 'WEAK' && claim.strength === 'STRONG') {
        dropped.push(claim);
        result.push({
          claimId: claim.claimId,
          status: 'UNGROUNDED',
          strengthAllowed: allowed,
          reason: 'strength_overflow',
        });
        continue;
      }
      grounded.push({ ...claim, strength: minStrength(claim.strength, allowed) });
      result.push({
        claimId: claim.claimId,
        status: 'GROUNDED',
        strengthAllowed: allowed,
        reason: 'strength_downgraded',
      });
      continue;
    }
    grounded.push(claim);
    result.push({
      claimId: claim.claimId,
      status: 'GROUNDED',
      strengthAllowed: allowed,
      reason: 'ok',
    });
  }

  return { grounded, dropped, result };
}

export function buildLiveFeasibilityClaims(input: {
  conclusionZh: string;
  verdict: 'YES' | 'NO' | 'CONDITIONAL';
  hasEta?: boolean;
  etaText?: string;
  hasWeather?: boolean;
  weatherText?: string;
}): System1Claim[] {
  const strength: System1ClaimStrength = input.verdict === 'CONDITIONAL' ? 'CONDITIONAL' : 'STRONG';
  const claims: System1Claim[] = [
    {
      claimId: 'c_feasibility',
      type: 'FEASIBILITY',
      text: input.conclusionZh,
      evidenceKeys: input.hasWeather ? ['route.status', 'weather.wind'] : ['route.status'],
      strength,
    },
  ];
  if (input.hasEta) {
    claims.push({
      claimId: 'c_eta',
      type: 'TIME_ESTIMATE',
      text: input.etaText ?? '预计驾驶时间',
      evidenceKeys: ['route.eta'],
      strength: 'CONDITIONAL',
    });
  }
  if (input.hasWeather) {
    claims.push({
      claimId: 'c_wind',
      type: 'RISK_ASSESSMENT',
      text: input.weatherText ?? '风力风险评估',
      evidenceKeys: ['weather.wind'],
      strength,
    });
  }
  return claims;
}

export function buildTripQueryStateClaims(input: {
  text: string;
  family: 'TRIP_QUERY_LODGING' | 'TRIP_QUERY_TODAY' | 'TRIP_QUERY_NEXT' | 'TRIP_QUERY_DAY';
}): System1Claim[] {
  const keys =
    input.family === 'TRIP_QUERY_LODGING'
      ? ['trip.day_list', 'trip.accommodation_anchors']
      : input.family === 'TRIP_QUERY_NEXT'
        ? ['trip.current_day', 'trip.timeline', 'trip.next_activity']
        : ['trip.current_day', 'trip.timeline'];
  return [
    {
      claimId: 'c_state',
      type: 'STATE_FACT',
      text: input.text,
      evidenceKeys: keys,
      strength: 'STRONG',
    },
  ];
}

export function buildKnowledgeQaClaims(input: {
  text: string;
  assumed?: boolean;
  /** 软推荐对比用 RECOMMENDATION，避免被当成 STATE_FACT 安全取证 */
  asRecommendation?: boolean;
}): System1Claim[] {
  return [
    {
      claimId: input.asRecommendation ? 'c_recommend' : 'c_knowledge',
      type: input.asRecommendation ? 'RECOMMENDATION' : 'STATE_FACT',
      text: input.text,
      evidenceKeys: ['knowledge.hit'],
      strength: input.assumed ? 'CONDITIONAL' : 'STRONG',
    },
  ];
}

export function buildDecisionSupportClaims(input: {
  text: string;
  conditional?: boolean;
  committed?: boolean;
}): System1Claim[] {
  return [
    {
      claimId: input.committed ? 'c_decision_commit' : 'c_decision_options',
      type: input.committed ? 'CONSTRAINT' : 'RECOMMENDATION',
      text: input.text,
      evidenceKeys: ['decision.options'],
      strength: input.conditional ? 'CONDITIONAL' : 'STRONG',
    },
  ];
}

export function buildWeatherRoadClaims(input: {
  text: string;
  hasWeather: boolean;
  hasRoad: boolean;
  conditional?: boolean;
}): System1Claim[] {
  const strength = input.conditional ? 'CONDITIONAL' : 'STRONG';
  const claims: System1Claim[] = [];
  if (input.hasWeather) {
    claims.push({
      claimId: 'c_weather',
      type: 'WORLD_FACT',
      text: input.text,
      evidenceKeys: ['weather.wind'],
      strength,
    });
  }
  if (input.hasRoad) {
    claims.push({
      claimId: 'c_road',
      type: 'ACCESSIBILITY',
      text: input.text,
      evidenceKeys: ['route.status'],
      strength: 'CONDITIONAL',
    });
  }
  if (!claims.length) {
    claims.push({
      claimId: 'c_weather_gap',
      type: 'WORLD_FACT',
      text: input.text,
      evidenceKeys: ['weather.wind'],
      strength: 'WEAK',
    });
  }
  return claims;
}

export function buildInventoryConsultClaims(input: {
  text: string;
  hasHit: boolean;
}): System1Claim[] {
  return [
    {
      claimId: 'c_inventory',
      type: 'BOOKING_FACT',
      text: input.text,
      evidenceKeys: ['inventory.hit'],
      strength: input.hasHit ? 'STRONG' : 'WEAK',
    },
  ];
}
