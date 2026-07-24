import { HotelResearchMember } from './hotel-research.member';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import { FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD } from '../../memory/emotional-resonance/emotional-resonance.constants';
import type { UserEmotionalAccount } from '../../memory/emotional-resonance/user-emotional-account.types';
import type { UserCognitiveProfile } from '../../memory/experience-replay/user-cognitive-profile.types';

function minimalProfile(axis: number): UserCognitiveProfile {
  return {
    schema_version: 1,
    subject_ref: 'u',
    updated_at: '2026-01-01T00:00:00.000Z',
    evidence_weight: 2,
    compliance_experience_axis: axis,
    price_sensitivity_proxy: 0,
    stitch_transparency_exposure_proxy: 0,
    negative_feedback_proxy: 0,
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

describe('HotelResearchMember (4.0 cognitive gossip)', () => {
  it('体验轴偏负时向 hotel Skill 注入 search_preferences.relaxedSafety', async () => {
    const execute = jest.fn().mockResolvedValue({ hotels: [{ id: 'h1' }] });
    const skillsRegistry = {
      getSkill: jest.fn().mockReturnValue({ execute }),
    };
    const member = new HotelResearchMember(skillsRegistry as any, undefined);
    const researchData: Record<string, unknown> = {};
    const evidenceRefs: string[] = [];
    await member.runScopedCommerce({
      requestId: 'r1',
      tripPlanRequest: { destination: 'Reykjavik' } as any,
      researchData,
      evidenceRefs,
      userCognitiveProfile: minimalProfile(-0.5),
    });
    expect(execute).toHaveBeenCalled();
    expect(execute.mock.calls[0][0]).toMatchObject({
      query: expect.stringContaining('Reykjavik'),
      limit: 8,
      search_preferences: { relaxedSafety: true, environment_confidence: 'MEDIUM' },
    });
    expect((researchData.live_hotel_refresh as any)?.cognitive_gossip).toEqual({
      relaxed_safety: true,
      environment_confidence: 'MEDIUM',
    });
  });

  it('无认知档案或轴未达阈值时不注入 search_preferences', async () => {
    const execute = jest.fn().mockResolvedValue({ hotels: [{ id: 'h1' }] });
    const skillsRegistry = {
      getSkill: jest.fn().mockReturnValue({ execute }),
    };
    const member = new HotelResearchMember(skillsRegistry as any, undefined);
    const researchData: Record<string, unknown> = {};
    await member.runScopedCommerce({
      requestId: 'r2',
      tripPlanRequest: { destination: 'X' } as any,
      researchData,
      evidenceRefs: [],
      userCognitiveProfile: minimalProfile(0),
    });
    expect(execute.mock.calls[0][0]).not.toHaveProperty('search_preferences');
    expect((researchData.live_hotel_refresh as any)?.cognitive_gossip).toBeUndefined();
  });

  it('高挫败感时启用稳健模式：仅 hotel.search、stabilityMode、不写认知 Gossip', async () => {
    const execute = jest.fn().mockResolvedValue({ hotels: [{ id: 'h1' }] });
    const skillsRegistry = {
      getSkill: jest.fn().mockReturnValue({ execute }),
    };
    const member = new HotelResearchMember(skillsRegistry as any, undefined);
    const researchData: Record<string, unknown> = {};
    const emotional: UserEmotionalAccount = {
      accumulated_goodwill: 0,
      current_tolerance_bonus: 0.3,
      frustration_score: FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD,
    };
    await member.runScopedCommerce({
      requestId: 'r4',
      tripPlanRequest: { destination: 'Tokyo' } as any,
      researchData,
      evidenceRefs: [],
      userCognitiveProfile: minimalProfile(-0.9),
      userEmotionalAccount: emotional,
    });
    expect(execute).toHaveBeenCalled();
    expect(execute.mock.calls[0][0]).toMatchObject({
      query: expect.stringContaining('Tokyo'),
      limit: 8,
      search_preferences: {
        stabilityMode: 'STABILITY_FIRST',
        mode: 'STABILITY_DRIVEN',
        risk_buffer: 'MAXIMUM',
        guarantee_priority: true,
        environment_confidence: 'MEDIUM',
      },
    });
    expect((researchData.live_hotel_refresh as any)?.cognitive_gossip).toBeUndefined();
    expect((researchData.live_hotel_refresh as any)?.stability_mode_active).toBe(true);
    expect((researchData.live_hotel_refresh as any)?.stability_env_modulation).toEqual({
      environment_confidence: 'MEDIUM',
      risk_buffer: 'MAXIMUM',
    });
  });

  it('高挫败 + 低不确定性熵：窄轨内 risk_buffer 为 MODERATE', async () => {
    const execute = jest.fn().mockResolvedValue({ hotels: [{ id: 'h1' }] });
    const skillsRegistry = {
      getSkill: jest.fn().mockReturnValue({ execute }),
    };
    const member = new HotelResearchMember(skillsRegistry as any, undefined);
    const researchData: Record<string, unknown> = {};
    const emotional: UserEmotionalAccount = {
      accumulated_goodwill: 0,
      current_tolerance_bonus: 0.3,
      frustration_score: FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD,
    };
    const dso = {
      uncertaintyProfile: { entropy01: 0.25 },
    } as DecisionState;
    await member.runScopedCommerce({
      requestId: 'r5',
      tripPlanRequest: { destination: 'Oslo' } as any,
      researchData,
      evidenceRefs: [],
      userEmotionalAccount: emotional,
      dso,
    });
    expect(execute.mock.calls[0][0]).toMatchObject({
      search_preferences: expect.objectContaining({
        risk_buffer: 'MODERATE',
        environment_confidence: 'HIGH',
      }),
    });
    expect((researchData.live_hotel_refresh as any)?.stability_env_modulation).toEqual({
      environment_confidence: 'HIGH',
      risk_buffer: 'MODERATE',
    });
  });

  it('negative_feedback_proxy 高时不注入 relaxedSafety（自愈）', async () => {
    const execute = jest.fn().mockResolvedValue({ hotels: [{ id: 'h1' }] });
    const skillsRegistry = {
      getSkill: jest.fn().mockReturnValue({ execute }),
    };
    const member = new HotelResearchMember(skillsRegistry as any, undefined);
    const researchData: Record<string, unknown> = {};
    await member.runScopedCommerce({
      requestId: 'r3',
      tripPlanRequest: { destination: 'Y' } as any,
      researchData,
      evidenceRefs: [],
      userCognitiveProfile: {
        ...minimalProfile(-0.9),
        negative_feedback_proxy: 0.6,
      },
    });
    expect(execute.mock.calls[0][0]).not.toHaveProperty('search_preferences');
  });
});
