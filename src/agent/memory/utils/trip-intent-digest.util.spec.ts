import {
  buildDomainInfluenceDigestFromSnapshot,
  buildWishConstraintDigest,
  buildPrivateWishDigest,
  buildDecisionProfilingDigest,
  buildNegotiationDigest,
} from './trip-intent-digest.util';

describe('trip-intent-digest.util', () => {
  it('buildWishConstraintDigest aggregates hints without wish text', () => {
    const digest = buildWishConstraintDigest(
      [
        {
          userId: 'u1',
          visibility: 'private',
          agentEligible: true,
          structuredHints: { must_avoid: ['辣'], must_do: ['温泉'] },
        },
        {
          userId: 'u2',
          visibility: 'signed',
          agentEligible: true,
          structuredHints: { must_avoid: ['早起'] },
        },
        {
          userId: 'u2',
          visibility: 'private',
          agentEligible: false,
          structuredHints: { must_avoid: ['应忽略'] },
        },
      ],
      'u1',
    );

    expect(digest).not.toBeNull();
    expect(digest!.teamActiveCount).toBe(1);
    expect(digest!.privateActiveCount).toBe(1);
    expect(digest!.requestingUserPrivateCount).toBe(1);
    expect(digest!.mustAvoid).toEqual(expect.arrayContaining(['辣', '早起']));
    expect(digest!.mustDo).toContain('温泉');
    expect(digest!.mustAvoid).not.toContain('应忽略');
  });

  it('buildWishConstraintDigest excludes other members private structured hints', () => {
    const digest = buildWishConstraintDigest(
      [
        {
          userId: 'member-a',
          visibility: 'private',
          agentEligible: true,
          structuredHints: { must_avoid: ['恐高', '玻璃栈道'] },
        },
        {
          userId: 'member-b',
          visibility: 'signed',
          agentEligible: true,
          structuredHints: { must_do: ['看极光'] },
        },
      ],
      'member-b',
    );
    expect(digest!.mustAvoid).not.toContain('恐高');
    expect(digest!.mustAvoid).not.toContain('玻璃栈道');
    expect(digest!.mustDo).toContain('看极光');
  });

  it('buildDomainInfluenceDigestFromSnapshot omits solo empty trips', () => {
    const digest = buildDomainInfluenceDigestFromSnapshot({
      tripId: 't1',
      memberCount: 1,
      domains: [],
      completionRate: 0,
      allMembersClaimed: false,
      balanceWarnings: [],
      rulesConfirmed: false,
      rulesConfirmedAt: null,
    });
    expect(digest).toBeNull();
  });

  it('buildPrivateWishDigest includes only requesting user private lines', () => {
    const digest = buildPrivateWishDigest(
      [
        {
          userId: 'u1',
          visibility: 'private',
          agentEligible: true,
          structuredHints: null,
          category: 'activities',
          importance: 3,
          text: '  必去温泉  ',
        },
        {
          userId: 'u2',
          visibility: 'private',
          agentEligible: true,
          structuredHints: null,
          category: 'dining',
          importance: 5,
          text: '不应出现',
        },
      ],
      'u1',
    );
    expect(digest?.items).toEqual([
      { category: 'activities', importance: 3, text: '必去温泉' },
    ]);
  });

  it('buildDecisionProfilingDigest summarizes team style and split lock', () => {
    const digest = buildDecisionProfilingDigest({
      teamCompletionRate: 80,
      requestingUserQuizCompleted: true,
      requestingUserStyle: { styleLabel: '理性探索者', teamRole: '协调者' },
      requestingUserMoney: {
        vector: {
          experienceTendency: 0.7,
          qualityTendency: 0.5,
          timeValueTendency: 0.5,
          socialScarcityTendency: 0.4,
        },
        consumptionPace: 'balanced',
      },
      teamStyleLabels: ['理性探索者', '体验派'],
      highRiskFrictionDomains: ['budget'],
      splitMechanismLocked: true,
      splitMechanismMode: 'split_aa',
    });
    expect(digest?.requestingUserStyleLabel).toBe('理性探索者');
    expect(digest?.splitMechanismMode).toBe('split_aa');
  });

  it('buildNegotiationDigest merges collaborative tasks and guardian summary', () => {
    const digest = buildNegotiationDigest({
      collaborativeTasks: [
        {
          id: 'task:activities',
          domain: 'activities',
          title: '活动',
          description: 'd',
          crossLevel: 'high',
          status: 'in_discussion',
          statusLabel: '讨论中',
          claimCount: 2,
          leaderDisplayName: 'A',
          endorsementSummary: null,
          weightSource: 'computed',
          closesAt: null,
          activeRoundId: null,
        },
      ],
      guardianSnapshot: {
        latest: {
          phase: 'pre_repair',
          tripId: 't1',
          decision: 'REJECT',
          consensusLevel: 0.35,
          humanDecisionPoints: [{ id: 'h1' } as any],
          conditions: [],
          keyTradeoffs: [],
          summary: '需确认关键权衡',
          debateRoundCount: 2,
          suggestedAdjustments: [],
          personaEvaluations: [],
        },
      },
      splitMechanismLocked: false,
      splitMechanismMode: null,
    });
    expect(digest?.collaborativeTasks).toHaveLength(1);
    expect(digest?.guardianSummary).toContain('需确认');
    expect(digest?.guardianHumanDecisionPointCount).toBe(1);
  });
});
