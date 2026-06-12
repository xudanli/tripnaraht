/**
 * D3：规划期多人偏好仲裁 — 群聊 Profile 聚合与遗憾度上界估算。
 */

import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  PartyBranchPolicy,
  PartyMemberProfile,
  PartyNegotiationPayload,
} from './planning-intent-processor.util';
import type { TripDaySnapshotForPlacement } from './route-and-run-intent-analyzer.util';
import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';
import {
  hasCompleteInjectedPartyProfiles,
  resolvePartySizeWithInjection,
} from './party-member-profile-bridge.util';

const PACE_INTENSIVE_RE = /特种兵|硬核|紧凑|赶/i;
const PACE_RELAXED_RE = /躺平|留白|慢节奏|松弛/i;
const RISK_HOLD_RE = /避险|hold|小雪就|保守|安全优先/i;
const RISK_PROCEED_RE = /冒险|proceed|冲/i;

export function extractPartySizeFromMessage(text: string): number {
  const nl = stripSystemMessageBlocksForIntakeNl(text);
  const countMatch = nl.match(/(\d+)\s*(?:个人|人|位|名|个(?:人|搭子)?)/);
  if (countMatch) {
    return Math.min(20, Math.max(2, parseInt(countMatch[1], 10)));
  }
  if (/搭子|朋友|队友|群里/.test(nl)) return 2;
  return 2;
}

function paceToScore(pace: PartyMemberProfile['pace']): number {
  if (pace === 'intensive') return 1;
  if (pace === 'relaxed') return 0;
  return 0.5;
}

function riskToScore(risk: PartyMemberProfile['risk_tolerance']): number {
  if (risk === 'HIGH') return 1;
  if (risk === 'LOW') return 0;
  return 0.5;
}

export function computePartyRegretUpperBound(profiles: PartyMemberProfile[]): number {
  if (profiles.length < 2) return 0;
  let max = 0;
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const paceDelta = Math.abs(paceToScore(profiles[i].pace) - paceToScore(profiles[j].pace));
      const riskDelta = Math.abs(riskToScore(profiles[i].risk_tolerance) - riskToScore(profiles[j].risk_tolerance));
      const adventureDelta = Math.abs(profiles[i].adventure_weight - profiles[j].adventure_weight);
      const regret = paceDelta * 0.45 + riskDelta * 0.35 + adventureDelta * 0.2;
      max = Math.max(max, regret);
    }
  }
  return Math.round(max * 100) / 100;
}

function aggregatePace(profiles: PartyMemberProfile[]): PartyMemberProfile['pace'] {
  const avg = profiles.reduce((s, p) => s + paceToScore(p.pace), 0) / profiles.length;
  if (avg >= 0.65) return 'intensive';
  if (avg <= 0.35) return 'relaxed';
  return 'moderate';
}

function aggregateRisk(profiles: PartyMemberProfile[]): PartyMemberProfile['risk_tolerance'] {
  const avg = profiles.reduce((s, p) => s + riskToScore(p.risk_tolerance), 0) / profiles.length;
  if (avg >= 0.65) return 'HIGH';
  if (avg <= 0.35) return 'LOW';
  return 'MEDIUM';
}

function initiatorAnchorFromTrip(trip?: TripPlanRequest | null): Partial<PartyMemberProfile> {
  const pp = trip?.party_profile;
  const fitness = pp?.fitness ?? trip?.party?.fitness_level;
  let pace: PartyMemberProfile['pace'] = 'moderate';
  if (fitness === 'high') pace = 'intensive';
  if (fitness === 'low') pace = 'relaxed';
  return {
    risk_tolerance: pp?.risk_tolerance ?? 'MEDIUM',
    pace,
    adventure_weight: fitness === 'high' ? 0.75 : fitness === 'low' ? 0.25 : 0.5,
  };
}

export function buildSyntheticPartyProfiles(params: {
  intakeMsg: string;
  partySize: number;
  trip?: TripPlanRequest | null;
  /** 群成员 DecisionParams 快照（member_id → 部分 profile）；缺省则启发式合成 */
  memberProfilesById?: Record<string, Partial<PartyMemberProfile>>;
}): PartyMemberProfile[] {
  const nl = stripSystemMessageBlocksForIntakeNl(params.intakeMsg);
  const hasIntensive = PACE_INTENSIVE_RE.test(nl);
  const hasRelaxed = PACE_RELAXED_RE.test(nl);
  const hasHold = RISK_HOLD_RE.test(nl);
  const hasProceed = RISK_PROCEED_RE.test(nl);
  const anchor = initiatorAnchorFromTrip(params.trip);
  const profiles: PartyMemberProfile[] = [];

  for (let i = 0; i < params.partySize; i++) {
    const memberId = `member_${i + 1}`;
    const injected = params.memberProfilesById?.[memberId];
    if (injected) {
      profiles.push({
        member_id: String(injected.member_id ?? memberId),
        pace: injected.pace ?? 'moderate',
        risk_tolerance: injected.risk_tolerance ?? 'MEDIUM',
        adventure_weight: injected.adventure_weight ?? 0.5,
      });
      continue;
    }

    let pace: PartyMemberProfile['pace'] = i === 0 ? (anchor.pace ?? 'moderate') : 'moderate';
    if (hasIntensive && hasRelaxed) {
      pace = i < Math.ceil(params.partySize / 2) ? 'intensive' : 'relaxed';
    } else if (hasIntensive) {
      pace = 'intensive';
    } else if (hasRelaxed) {
      pace = 'relaxed';
    }

    let risk: PartyMemberProfile['risk_tolerance'] =
      i === 0 ? (anchor.risk_tolerance ?? 'MEDIUM') : 'MEDIUM';
    if (hasHold && hasProceed) {
      risk = i % 2 === 0 ? 'LOW' : 'HIGH';
    } else if (hasHold) {
      risk = 'LOW';
    } else if (hasProceed) {
      risk = 'HIGH';
    }

    const adventure_weight =
      pace === 'intensive' ? 0.8 : pace === 'relaxed' ? 0.25 : risk === 'HIGH' ? 0.65 : 0.45;

    profiles.push({ member_id: memberId, pace, risk_tolerance: risk, adventure_weight });
  }

  return profiles;
}

export function buildHoldProceedBranchPolicies(
  profiles: PartyMemberProfile[],
): PartyBranchPolicy[] {
  const low = profiles.filter((p) => p.risk_tolerance === 'LOW');
  const high = profiles.filter((p) => p.risk_tolerance === 'HIGH');
  if (!low.length || !high.length) return [];

  return [
    {
      trigger_condition: "weather_condition === 'LIGHT_SNOW' || wind_gust_mps >= 15",
      hold_route_token: 'hold_in_place_shelter_route',
      proceed_route_token: 'proceed_original_segment_route',
      dissent_member_ids: [
        ...low.map((p) => p.member_id),
        ...high.map((p) => p.member_id),
      ],
    },
  ];
}

export function suggestNashReorderHint(params: {
  profiles: PartyMemberProfile[];
  tripDaySnapshots?: TripDaySnapshotForPlacement[];
  partySize: number;
}): PartyNegotiationPayload['nash_reorder_hint'] | undefined {
  const snaps = params.tripDaySnapshots ?? [];
  if (snaps.length < 2) return undefined;

  const regret = computePartyRegretUpperBound(params.profiles);
  if (regret < 0.25) return undefined;

  const tightest = snaps.reduce((a, b) => (a.itemCount >= b.itemCount ? a : b));
  const loosest = snaps.reduce((a, b) => (a.itemCount <= b.itemCount ? a : b));
  if (tightest.dayNumber === loosest.dayNumber) return undefined;

  return {
    swap_day_a: tightest.dayNumber,
    swap_day_b: loosest.dayNumber,
    rationale_zh: `为 ${params.partySize} 人平衡 pace 分歧（遗憾上界 ${regret}），建议调换 Day ${tightest.dayNumber} 与 Day ${loosest.dayNumber} 的活动密度顺序。`,
  };
}

/**
 * D3 主入口：合成 member profiles → 聚合向量 → 分支策略 / 纳什调换 hint。
 */
export function buildPartyNegotiationPayload(params: {
  intakeMsg: string;
  trip?: TripPlanRequest | null;
  tripDaySnapshots?: TripDaySnapshotForPlacement[];
  memberProfilesById?: Record<string, Partial<PartyMemberProfile>>;
  /** Match Square / route_and_run 预注入的完整 roster */
  injectedMemberProfiles?: PartyMemberProfile[];
  request?: RouteAndRunRequestDto | null;
}): PartyNegotiationPayload {
  const injected = params.injectedMemberProfiles ?? [];
  const partySize = resolvePartySizeWithInjection({
    intakeMsg: params.intakeMsg,
    trip: params.trip,
    request: params.request,
    injectedProfiles: injected,
    extractPartySizeFromMessage,
  });

  const useInjectedDirect = hasCompleteInjectedPartyProfiles(injected, partySize);
  const member_profiles = useInjectedDirect
    ? injected.slice(0, partySize)
    : buildSyntheticPartyProfiles({
        intakeMsg: params.intakeMsg,
        partySize,
        trip: params.trip,
        memberProfilesById: params.memberProfilesById,
      });

  const regret_upper_bound = computePartyRegretUpperBound(member_profiles);
  const branch_policies = buildHoldProceedBranchPolicies(member_profiles);
  const nash_reorder_hint = suggestNashReorderHint({
    profiles: member_profiles,
    tripDaySnapshots: params.tripDaySnapshots,
    partySize,
  });

  const hasInjectedProfiles =
    useInjectedDirect ||
    Boolean(params.memberProfilesById && Object.keys(params.memberProfilesById).length >= partySize);

  return {
    party_size: partySize,
    member_profiles,
    aggregated_pace: aggregatePace(member_profiles),
    aggregated_risk_tolerance: aggregateRisk(member_profiles),
    regret_upper_bound,
    branch_policies: branch_policies.length ? branch_policies : undefined,
    nash_reorder_hint,
    requires_hitl_clarification: !hasInjectedProfiles && partySize > 2 && regret_upper_bound >= 0.5,
  };
}
