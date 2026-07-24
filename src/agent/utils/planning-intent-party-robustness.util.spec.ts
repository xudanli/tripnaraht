import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { applyPlanningPhaseIntentToIntake } from './planning-intent-intake.util';
import {
  applyPartyNegotiationToTripPlanRequest,
  buildStubItineraryFromTripDaySnapshots,
  injectPartyNegotiationIntoRouteAndRunRequest,
  tryComputeOrganizationalRobustnessPreview,
} from './planning-intent-party-robustness.util';
import { buildPartyNegotiationPayload } from './planning-intent-party.util';
import { projectRobustnessPartyFromNegotiationProfiles } from '../../trips/execution-simulation/planning-party-robustness.util';
import { resolveRobustnessPartyFromRouteAndRunRequest } from '../../trips/execution-simulation/planning-party-robustness.util';
import { runRobustnessRolloutForItinerary } from './robustness-rollout-gateway.util';
import type { TripDaySnapshotForPlacement } from './route-and-run-intent-analyzer.util';

describe('planning-intent-party-robustness.util', () => {
  const snapshots: TripDaySnapshotForPlacement[] = [
    { dayNumber: 2, dateYmd: '2026-07-02', itemCount: 5, textBlob: 'drive long' },
    { dayNumber: 5, dateYmd: '2026-07-05', itemCount: 1, textBlob: 'rest' },
  ];

  it('buildStubItineraryFromTripDaySnapshots produces drive-heavy days', () => {
    const it = buildStubItineraryFromTripDaySnapshots(snapshots, 'req-1');
    expect(it?.days).toHaveLength(2);
    expect(it?.days[0].items[0].metadata?.duration_minutes).toBeGreaterThanOrEqual(90);
  });

  it('tryComputeOrganizationalRobustnessPreview returns dual scores for 4-person party', () => {
    const partyNeg = buildPartyNegotiationPayload({
      intakeMsg: '4 个人拼车，特种兵 vs 躺平，遗憾度最低',
      tripDaySnapshots: snapshots,
    });
    const preview = tryComputeOrganizationalRobustnessPreview({
      tripDaySnapshots: snapshots,
      partyNegotiation: partyNeg,
      requestId: 'req-d3',
      sampleCount: 10,
    });
    expect(preview).not.toBeNull();
    expect(preview!.organizational_robustness_score).toBeGreaterThanOrEqual(0);
    expect(preview!.timeline.length).toBeGreaterThan(0);
    expect(preview!.is_preview).toBe(true);
  });

  it('injectPartyNegotiationIntoRouteAndRunRequest writes member profiles to options', () => {
    const partyNeg = buildPartyNegotiationPayload({
      intakeMsg: '搭子分歧 Hold Proceed',
    });
    const req = {
      request_id: 'r1',
      trip_id: 't1',
      options: {},
    } as RouteAndRunRequestDto;
    injectPartyNegotiationIntoRouteAndRunRequest(req, partyNeg);
    expect(req.options?.party_negotiation_member_profiles?.length).toBeGreaterThanOrEqual(2);
    expect(req.party_profile?.party_total).toBe(partyNeg.party_size);
  });

  it('resolveRobustnessPartyFromRouteAndRunRequest maps multi-member latent', () => {
    const req = {
      request_id: 'r2',
      options: {
        party_negotiation_member_profiles: [
          { member_id: 'm1', pace: 'intensive', risk_tolerance: 'HIGH', adventure_weight: 0.8 },
          { member_id: 'm2', pace: 'relaxed', risk_tolerance: 'LOW', adventure_weight: 0.3 },
        ],
      },
    } as RouteAndRunRequestDto;
    const party = resolveRobustnessPartyFromRouteAndRunRequest(req);
    expect(party?.members).toHaveLength(2);
    expect(party!.members[0].latentState.motive_distribution.exploration).toBeGreaterThan(
      party!.members[1].latentState.motive_distribution.exploration,
    );
  });

  it('runRobustnessRolloutForItinerary uses injected party for lower org score vs single traveler', () => {
    const itinerary = buildStubItineraryFromTripDaySnapshots(snapshots, 'req-compare')!;
    const mixedParty = projectRobustnessPartyFromNegotiationProfiles(
      buildPartyNegotiationPayload({
        intakeMsg: '4人 特种兵 躺平',
        tripDaySnapshots: snapshots,
      }).member_profiles,
      'trip-x',
      0.55,
    );
    const mixed = runRobustnessRolloutForItinerary({
      request: { request_id: 'r', options: {} } as RouteAndRunRequestDto,
      itinerary,
      sampleCount: 12,
      partyOverride: mixedParty,
    });
    expect(mixed).not.toBeNull();
    expect(mixed!.organizationalRobustnessScore).toBeLessThanOrEqual(1);
  });
});

describe('planning-intent-intake D3 + robustness preview', () => {
  it('applyPlanningPhaseIntentToIntake injects request options and preview', () => {
    const state = {
      request_id: 'req-d3-preview',
      current_step: 'INTAKE',
      decision_log: [],
      metadata: {},
      trip_plan_request: { message: '', destination: '新疆' },
    } as import('../interfaces/trip-plan.interface').OrchestratorState;

    const request = {
      request_id: 'req-d3-preview',
      trip_id: 'trip-1',
      options: {},
    } as RouteAndRunRequestDto;

    const query =
      '我们 4 个搭子走独库，我想特种兵朋友想躺平，有没有遗憾度最低的排期？';
    const payload = applyPlanningPhaseIntentToIntake({
      intakeMsg: query,
      state,
      trip: state.trip_plan_request as import('../interfaces/trip-plan.interface').TripPlanRequest,
      tripDaySnapshots: [
        { dayNumber: 1, dateYmd: '2026-07-01', itemCount: 4, textBlob: '' },
        { dayNumber: 2, dateYmd: '2026-07-02', itemCount: 6, textBlob: '' },
      ],
      request,
    });

    expect(payload?.party_negotiation?.party_size).toBe(4);
    expect(request.options?.party_negotiation_member_profiles?.length).toBe(4);
    expect(
      payload?.party_negotiation?.organizational_robustness_preview?.organizational_robustness_score,
    ).toBeGreaterThanOrEqual(0);
    expect(state.trip_plan_request?.party?.count).toBe(4);
  });
});
