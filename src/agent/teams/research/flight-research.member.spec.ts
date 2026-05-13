import { FlightResearchMember } from './flight-research.member';
import { FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD } from '../../memory/emotional-resonance/emotional-resonance.constants';
import type { UserEmotionalAccount } from '../../memory/emotional-resonance/user-emotional-account.types';
import type { UserCognitiveProfile } from '../../memory/experience-replay/user-cognitive-profile.types';

function minimalProfile(axis: number, neg = 0): UserCognitiveProfile {
  return {
    schema_version: 1,
    subject_ref: 'u',
    updated_at: '2026-01-01T00:00:00.000Z',
    evidence_weight: 1,
    compliance_experience_axis: axis,
    price_sensitivity_proxy: 0,
    stitch_transparency_exposure_proxy: 0,
    negative_feedback_proxy: neg,
    derivation: {
      narrate_compliance_first_hits: 0,
      narrate_commerce_over_experience_hits: 0,
      narrate_stitch_transparency_voice_hits: 0,
      mean_conflict_count_when_nonzero: null,
      memory_replay_axis_narrate_hits: 0,
      memory_replay_penalized_hits: 0,
    },
  };
}

describe('FlightResearchMember (4.0 cognitive gossip)', () => {
  it('体验Gossip 时注入 luxuryLeaning 与 maxStops', async () => {
    const execute = jest.fn().mockResolvedValue({ evidence_id: 'f1' });
    const skillsRegistry = { getSkill: jest.fn().mockReturnValue({ execute }) };
    const member = new FlightResearchMember(skillsRegistry as any, undefined);
    const researchData: Record<string, unknown> = {};
    await member.runScopedCommerce({
      requestId: 'r1',
      tripPlanRequest: {
        origin: 'KEF',
        destination: 'JFK',
        date_range: { start_date: '2026-06-01' },
      } as any,
      researchData,
      evidenceRefs: [],
      userCognitiveProfile: minimalProfile(-0.5),
    });
    expect(execute.mock.calls[0][0]).toMatchObject({
      search_preferences: { luxuryLeaning: true, maxStops: 1 },
    });
    expect((researchData.live_flight_refresh as any)?.cognitive_gossip).toEqual({
      luxury_leaning: true,
      max_stops: 1,
    });
  });

  it('高挫败感时启用稳健模式：仅 flight.search、directFlightPriority、excludeLcc', async () => {
    const execute = jest.fn().mockResolvedValue({ evidence_id: 'f2' });
    const skillsRegistry = { getSkill: jest.fn().mockReturnValue({ execute }) };
    const member = new FlightResearchMember(skillsRegistry as any, undefined);
    const researchData: Record<string, unknown> = {};
    const emotional: UserEmotionalAccount = {
      accumulated_goodwill: 0,
      current_tolerance_bonus: 0.3,
      frustration_score: FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD,
    };
    await member.runScopedCommerce({
      requestId: 'r3',
      tripPlanRequest: {
        origin: 'KEF',
        destination: 'CDG',
        date_range: { start_date: '2026-06-01' },
      } as any,
      researchData,
      evidenceRefs: [],
      userCognitiveProfile: minimalProfile(-0.5),
      userEmotionalAccount: emotional,
    });
    expect(execute.mock.calls[0][0]).toMatchObject({
      limit: 4,
      search_preferences: {
        stabilityMode: 'STABILITY_FIRST',
        directFlightPriority: true,
        excludeLcc: true,
      },
    });
    expect((researchData.live_flight_refresh as any)?.cognitive_gossip).toBeUndefined();
    expect((researchData.live_flight_refresh as any)?.stability_mode_active).toBe(true);
  });

  it('negative_feedback_proxy 高时不注入', async () => {
    const execute = jest.fn().mockResolvedValue({ evidence_id: 'f1' });
    const skillsRegistry = { getSkill: jest.fn().mockReturnValue({ execute }) };
    const member = new FlightResearchMember(skillsRegistry as any, undefined);
    const researchData: Record<string, unknown> = {};
    await member.runScopedCommerce({
      requestId: 'r2',
      tripPlanRequest: { origin: 'A', destination: 'B' } as any,
      researchData,
      evidenceRefs: [],
      userCognitiveProfile: minimalProfile(-0.9, 0.55),
    });
    expect(execute.mock.calls[0][0]).not.toHaveProperty('search_preferences');
  });
});
