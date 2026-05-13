import { TransportResearchMember } from './transport-research.member';
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

describe('TransportResearchMember (4.0 cognitive gossip)', () => {
  it('体验Gossip 时注入 privateTransferLeaning', async () => {
    const execute = jest.fn().mockResolvedValue({ evidence_id: 't1' });
    const skillsRegistry = { getSkill: jest.fn().mockReturnValue({ execute }) };
    const member = new TransportResearchMember(skillsRegistry as any, undefined);
    const researchData: Record<string, unknown> = {};
    await member.runTransportSearch({
      requestId: 'r1',
      tripPlanRequest: {
        origin: 'Reykjavik',
        destination: 'Akureyri',
        mode: 'mixed',
      } as any,
      researchData,
      evidenceRefs: [],
      userCognitiveProfile: minimalProfile(-0.5),
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: expect.anything(),
        destination: expect.anything(),
        search_preferences: { privateTransferLeaning: true },
      }),
    );
    expect(researchData.transport_cognitive_gossip).toEqual({ private_transfer_leaning: true });
  });

  it('negative_feedback_proxy 高时不注入', async () => {
    const execute = jest.fn().mockResolvedValue({ evidence_id: 't1' });
    const skillsRegistry = { getSkill: jest.fn().mockReturnValue({ execute }) };
    const member = new TransportResearchMember(skillsRegistry as any, undefined);
    const researchData: Record<string, unknown> = {};
    await member.runTransportSearch({
      requestId: 'r2',
      tripPlanRequest: {
        origin: 'Reykjavik',
        destination: 'Akureyri',
      } as any,
      researchData,
      evidenceRefs: [],
      userCognitiveProfile: minimalProfile(-0.9, 0.6),
    });
    expect(execute.mock.calls[0][0]).not.toHaveProperty('search_preferences');
    expect(researchData.transport_cognitive_gossip).toBeUndefined();
  });
});
