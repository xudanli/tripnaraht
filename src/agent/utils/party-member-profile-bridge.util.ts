/**
 * Bridge Match Square / route_and_run injected roster → D3 PartyMemberProfile.
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import type { PartyMemberProfile } from './planning-intent-processor.util';

const PACE_VALUES = new Set<PartyMemberProfile['pace']>(['intensive', 'moderate', 'relaxed']);
const RISK_VALUES = new Set<PartyMemberProfile['risk_tolerance']>(['LOW', 'MEDIUM', 'HIGH']);

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function normalizePace(raw: unknown): PartyMemberProfile['pace'] {
  const p = String(raw ?? '').trim().toLowerCase();
  if (p === 'intensive' || p === 'relaxed') return p;
  return 'moderate';
}

function normalizeRisk(raw: unknown): PartyMemberProfile['risk_tolerance'] {
  const r = String(raw ?? '').trim().toUpperCase();
  if (RISK_VALUES.has(r as PartyMemberProfile['risk_tolerance'])) {
    return r as PartyMemberProfile['risk_tolerance'];
  }
  return 'MEDIUM';
}

/** Normalize one injected roster row (accepts legacy `risk` alias). */
export function normalizePartyMemberProfileInput(
  raw: Record<string, unknown>,
  index: number,
): PartyMemberProfile {
  const member_id =
    String(raw.member_id ?? raw.memberId ?? `member_${index + 1}`).trim() || `member_${index + 1}`;
  const riskRaw = raw.risk_tolerance ?? raw.risk ?? raw.riskTolerance;
  const adventure = Number(raw.adventure_weight ?? raw.adventureWeight);
  return {
    member_id,
    pace: normalizePace(raw.pace),
    risk_tolerance: normalizeRisk(riskRaw),
    adventure_weight: clamp01(Number.isFinite(adventure) ? adventure : 0.5),
  };
}

export function normalizePartyMemberProfileArray(
  raw: unknown[] | undefined | null,
): PartyMemberProfile[] {
  if (!Array.isArray(raw) || !raw.length) return [];
  return raw
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item, i) => normalizePartyMemberProfileInput(item as Record<string, unknown>, i));
}

/**
 * Slot map for legacy `member_1` lookup + stable Match Square member_id keys.
 */
export function memberProfilesByIdFromNegotiationArray(
  profiles: PartyMemberProfile[],
): Record<string, Partial<PartyMemberProfile>> {
  const out: Record<string, Partial<PartyMemberProfile>> = {};
  profiles.forEach((profile, i) => {
    const slotId = `member_${i + 1}`;
    out[slotId] = profile;
    if (profile.member_id !== slotId) {
      out[profile.member_id] = profile;
    }
  });
  return out;
}

export function mergeMemberProfilesById(
  ...maps: Array<Record<string, Partial<PartyMemberProfile>> | undefined>
): Record<string, Partial<PartyMemberProfile>> {
  return Object.assign({}, ...maps.filter(Boolean));
}

/** Read injected roster from route_and_run request (+ optional trip party count). */
export function resolveInjectedPartyMemberProfilesFromRequest(
  request?: RouteAndRunRequestDto | null,
  trip?: TripPlanRequest | null,
): PartyMemberProfile[] {
  const fromOptions = normalizePartyMemberProfileArray(
    request?.options?.party_negotiation_member_profiles as unknown[] | undefined,
  );
  if (fromOptions.length >= 2) {
    return fromOptions;
  }

  const partyTotal = request?.party_profile?.party_total ?? trip?.party?.count;
  if (typeof partyTotal === 'number' && partyTotal >= 2 && fromOptions.length === partyTotal) {
    return fromOptions;
  }

  return fromOptions;
}

export function resolvePartySizeWithInjection(params: {
  intakeMsg: string;
  trip?: TripPlanRequest | null;
  request?: RouteAndRunRequestDto | null;
  injectedProfiles: PartyMemberProfile[];
  extractPartySizeFromMessage: (text: string) => number;
}): number {
  const fromMsg = params.extractPartySizeFromMessage(params.intakeMsg);
  const fromTrip = params.trip?.party?.count ?? 0;
  const fromRequest = params.request?.party_profile?.party_total ?? 0;
  const fromInjected = params.injectedProfiles.length >= 2 ? params.injectedProfiles.length : 0;
  return Math.max(fromMsg, fromTrip, fromRequest, fromInjected);
}

export function hasCompleteInjectedPartyProfiles(
  injected: PartyMemberProfile[],
  partySize: number,
): boolean {
  return injected.length >= 2 && injected.length >= partySize;
}
