import { describe, expect, it } from '@jest/globals';
import {
  memberProfilesByIdFromNegotiationArray,
  normalizePartyMemberProfileArray,
  normalizePartyMemberProfileInput,
  resolveInjectedPartyMemberProfilesFromRequest,
} from './party-member-profile-bridge.util';
import { buildPartyNegotiationPayload } from './planning-intent-party.util';
import { applyPlanningPhaseIntentToIntake } from './planning-intent-intake.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('party-member-profile-bridge.util', () => {
  it('normalizes legacy risk alias to risk_tolerance', () => {
    const p = normalizePartyMemberProfileInput(
      { member_id: 'captain_1', pace: 'intensive', risk: 'LOW', adventure_weight: 0.8 },
      0,
    );
    expect(p.risk_tolerance).toBe('LOW');
    expect(p.pace).toBe('intensive');
    expect(p.member_id).toBe('captain_1');
  });

  it('builds memberProfilesById with slot and stable ids', () => {
    const profiles = normalizePartyMemberProfileArray([
      { member_id: 'captain_abc', pace: 'moderate', risk_tolerance: 'LOW', adventure_weight: 0.4 },
      { member_id: 'member_def', pace: 'intensive', risk_tolerance: 'HIGH', adventure_weight: 0.9 },
    ]);
    const map = memberProfilesByIdFromNegotiationArray(profiles);
    expect(map.member_1?.member_id).toBe('captain_abc');
    expect(map.captain_abc?.pace).toBe('moderate');
    expect(map.member_2?.risk_tolerance).toBe('HIGH');
  });

  it('buildPartyNegotiationPayload uses injected roster instead of NL heuristics', () => {
    const payload = buildPartyNegotiationPayload({
      intakeMsg: '我们 4 个搭子，我想特种兵朋友想躺平',
      trip: { party: { count: 4 } } as import('../interfaces/trip-plan.interface').TripPlanRequest,
      injectedMemberProfiles: normalizePartyMemberProfileArray([
        { member_id: 'u1', pace: 'intensive', risk_tolerance: 'HIGH', adventure_weight: 0.9 },
        { member_id: 'u2', pace: 'relaxed', risk_tolerance: 'LOW', adventure_weight: 0.2 },
        { member_id: 'u3', pace: 'moderate', risk_tolerance: 'MEDIUM', adventure_weight: 0.5 },
        { member_id: 'u4', pace: 'moderate', risk_tolerance: 'LOW', adventure_weight: 0.4 },
      ]),
      request: {
        party_profile: { party_total: 4 },
      } as RouteAndRunRequestDto,
    });

    expect(payload.party_size).toBe(4);
    expect(payload.member_profiles[0].member_id).toBe('u1');
    expect(payload.member_profiles[1].pace).toBe('relaxed');
    expect(payload.requires_hitl_clarification).toBe(false);
    expect(payload.regret_upper_bound).toBeGreaterThan(0.3);
  });

  it('applyPlanningPhaseIntentToIntake bridges request.options roster to party_negotiation', () => {
    const state = {
      request_id: 'req-ms-bridge',
      current_step: 'INTAKE',
      decision_log: [],
      metadata: {},
      trip_plan_request: { message: '', destination: '冰岛', party: { count: 4 } },
    } as import('../interfaces/trip-plan.interface').OrchestratorState;

    const request = {
      request_id: 'req-ms-bridge',
      trip_id: 'trip-ms',
      party_profile: { party_total: 4, fitness_level: 'medium', risk_tolerance: 'LOW' },
      options: {
        party_negotiation_member_profiles: [
          { member_id: 'captain_1', pace: 'moderate', risk: 'LOW', adventure_weight: 0.42 },
          { member_id: 'member_2', pace: 'intensive', risk_tolerance: 'HIGH', adventure_weight: 0.78 },
          { member_id: 'member_3', pace: 'relaxed', risk_tolerance: 'LOW', adventure_weight: 0.25 },
          { member_id: 'member_4', pace: 'moderate', risk_tolerance: 'MEDIUM', adventure_weight: 0.55 },
        ],
      },
    } as RouteAndRunRequestDto;

    const payload = applyPlanningPhaseIntentToIntake({
      intakeMsg: '我们 4 个搭子走独库，有没有遗憾度最低的排期？',
      state,
      trip: state.trip_plan_request,
      tripDaySnapshots: [
        { dayNumber: 1, dateYmd: '2026-07-01', itemCount: 4, textBlob: '' },
        { dayNumber: 2, dateYmd: '2026-07-02', itemCount: 5, textBlob: '' },
      ],
      request,
    });

    expect(payload?.party_negotiation?.member_profiles[0].member_id).toBe('captain_1');
    expect(payload?.party_negotiation?.member_profiles[1].pace).toBe('intensive');
    expect(payload?.party_negotiation?.requires_hitl_clarification).toBe(false);
    expect(resolveInjectedPartyMemberProfilesFromRequest(request).length).toBe(4);
  });
});
