/**
 * D3 PartyMemberProfile → RobustnessPartyContext（供 INTAKE 预演与 Gateway Rollout）。
 */

import type { PartyMemberProfile } from '../../agent/utils/planning-intent-processor.util';
import type {
  MotiveDistribution,
  RobustnessPartyContext,
  TravelLatentState,
} from '../multiverse/travel-latent-state.types';

const CLAMP01 = (x: number) => Math.max(0, Math.min(1, x));

function latentFromPartyMemberProfile(p: PartyMemberProfile): TravelLatentState {
  const exploration =
    p.pace === 'intensive' ? 0.85 : p.pace === 'relaxed' ? 0.25 : 0.5;
  const relaxation =
    p.pace === 'relaxed' ? 0.85 : p.pace === 'intensive' ? 0.2 : 0.5;
  const risk_aversion =
    p.risk_tolerance === 'LOW' ? 0.85 : p.risk_tolerance === 'HIGH' ? 0.15 : 0.5;
  const fatigue_tolerance =
    p.pace === 'relaxed' ? 0.35 : p.pace === 'intensive' ? 0.78 : 0.55;

  const motive_distribution: MotiveDistribution = {
    detachment: CLAMP01(1 - exploration * 0.6),
    exploration,
    social_seeking: CLAMP01(0.35 + p.adventure_weight * 0.45),
    relaxation,
  };

  return {
    motive_distribution,
    fatigue_tolerance,
    social_expressiveness: CLAMP01(p.adventure_weight),
    risk_aversion,
  };
}

export function projectRobustnessPartyFromNegotiationProfiles(
  profiles: PartyMemberProfile[],
  partyId: string,
  regretUpperBound?: number,
): RobustnessPartyContext {
  if (!profiles.length) {
    const fallback: PartyMemberProfile = {
      member_id: 'member_1',
      pace: 'moderate',
      risk_tolerance: 'MEDIUM',
      adventure_weight: 0.5,
    };
    return {
      partyId,
      members: [{ userId: 'member_1', latentState: latentFromPartyMemberProfile(fallback) }],
      cohesionIndex: 0.5,
    };
  }

  const members = profiles.map(p => ({
    userId: p.member_id,
    displayName: p.member_id,
    latentState: latentFromPartyMemberProfile(p),
  }));

  const heterogeneity =
    profiles.length > 1
      ? profiles.reduce((sum, p, i, arr) => {
          if (i === 0) return sum;
          const prev = arr[i - 1];
          return (
            sum +
            Math.abs(p.adventure_weight - prev.adventure_weight) +
            (p.pace !== prev.pace ? 0.25 : 0) +
            (p.risk_tolerance !== prev.risk_tolerance ? 0.2 : 0)
          );
        }, 0) /
        (profiles.length - 1)
      : 0;

  const cohesionIndex = CLAMP01(0.65 - (regretUpperBound ?? heterogeneity) * 0.35);

  return { partyId, members, cohesionIndex };
}

export function projectRobustnessPartyFromNegotiationMemberProfiles(
  profiles: Array<{
    member_id: string;
    pace: string;
    risk_tolerance: string;
    adventure_weight: number;
  }>,
  partyId: string,
): RobustnessPartyContext {
  const normalized: PartyMemberProfile[] = profiles.map(p => ({
    member_id: p.member_id,
    pace: (p.pace === 'intensive' || p.pace === 'relaxed' ? p.pace : 'moderate') as PartyMemberProfile['pace'],
    risk_tolerance: (['LOW', 'MEDIUM', 'HIGH'].includes(p.risk_tolerance)
      ? p.risk_tolerance
      : 'MEDIUM') as PartyMemberProfile['risk_tolerance'],
    adventure_weight: p.adventure_weight,
  }));
  return projectRobustnessPartyFromNegotiationProfiles(normalized, partyId);
}

export function resolveRobustnessPartyFromRouteAndRunRequest(
  request: import('../../agent/dto/route-and-run.dto').RouteAndRunRequestDto | undefined,
): RobustnessPartyContext | undefined {
  if (!request) return undefined;
  const injected = request.options?.party_negotiation_member_profiles;
  if (!Array.isArray(injected) || injected.length < 2) {
    return undefined;
  }
  return projectRobustnessPartyFromNegotiationMemberProfiles(
    injected,
    request.trip_id?.trim() || request.request_id,
  );
}
