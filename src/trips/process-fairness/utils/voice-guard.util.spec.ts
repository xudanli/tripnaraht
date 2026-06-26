import {
  CONSECUTIVE_SILENT_THRESHOLD,
  computeEngagementScore,
  detectVoiceGuardInterventions,
} from './voice-guard.util';

describe('voice-guard.util', () => {
  it('weights preference submits higher in engagement score', () => {
    expect(
      computeEngagementScore({
        preferenceSubmits: 2,
        voteParticipations: 0,
        discussionUtterances: 0,
      }),
    ).toBe(4);
  });

  it('flags consecutive silent members', () => {
    const interventions = detectVoiceGuardInterventions([
      {
        userId: 'u1',
        displayName: '妈妈',
        preferenceSubmits: 0,
        voteParticipations: 0,
        discussionUtterances: 0,
        consecutiveSilentRounds: CONSECUTIVE_SILENT_THRESHOLD,
        lastSpokeAt: null,
        engagementScore: 0,
      },
      {
        userId: 'u2',
        displayName: '莎莎',
        preferenceSubmits: 3,
        voteParticipations: 2,
        discussionUtterances: 3,
        consecutiveSilentRounds: 0,
        lastSpokeAt: '2026-01-01T00:00:00.000Z',
        engagementScore: 12,
      },
    ]);
    expect(interventions).toHaveLength(1);
    expect(interventions[0].displayName).toBe('妈妈');
    expect(interventions[0].groupMessageCN).toContain('妈妈');
  });
});
