import {
  buildProcessFairnessSuggestedOperations,
  buildTeamStructuredDiscussionAnswer,
  isTeamStructuredDiscussionQuery,
  primaryDecisionNodeFromMessage,
} from './team-structured-discussion.util';

describe('team-structured-discussion.util', () => {
  it('detects accommodation team discussion', () => {
    const msg = '住宿选公寓还是木屋？帮团队结构化讨论一下';
    expect(isTeamStructuredDiscussionQuery(msg)).toBe(true);
    expect(primaryDecisionNodeFromMessage(msg)).toBe('accommodation');
  });

  it('does not match plain hotel lookup', () => {
    expect(isTeamStructuredDiscussionQuery('推荐雷克雅未克酒店')).toBe(false);
  });

  it('returns only agentIntroZh when round is active', () => {
    const intro =
      '我们进入住宿的结构化偏好分享轮次（已开启）。请按顺序表达你的偏好和理由；轮到其他成员发言时请先倾听。当前轮到：莎莎。';
    const text = buildTeamStructuredDiscussionAnswer({
      message: '住宿选公寓还是木屋？帮团队结构化讨论一下',
      tripName: '冰岛完整环岛公路',
      memberCount: 4,
      hint: {
        triggered: true,
        status: 'ACTIVE',
        decisionNode: 'accommodation',
        roundId: 'round-1',
        round: { currentSpeakerDisplayName: '莎莎' } as never,
        agentIntroZh: intro,
        clientNavigation: {
          route: 'structured_negotiation',
          tripId: 'trip-1',
          roundId: 'round-1',
          domain: 'accommodation',
        },
      },
    });
    expect(text).toBe(intro);
    expect(text).not.toContain('公寓 vs 木屋');
    expect(text).not.toContain('Round Robin');
  });

  it('builds single-member guidance without accommodation essay', () => {
    const text = buildTeamStructuredDiscussionAnswer({
      message: '住宿选公寓还是木屋？帮团队结构化讨论一下',
      tripName: '冰岛完整环岛公路',
      memberCount: 1,
      hint: {
        triggered: false,
        decisionNode: 'accommodation',
        roundId: null,
        round: null,
        agentIntroZh: null,
        clientNavigation: null,
        skippedReason: 'single_member_trip',
      },
    });
    expect(text).toContain('冰岛完整环岛公路');
    expect(text).toContain('仅有 **1** 位成员');
    expect(text).toContain('邀请协作者');
    expect(text).not.toContain('公寓 vs 木屋');
    expect(text).not.toContain('Round Robin');
  });

  it('omits nav button when inline round card is present', () => {
    const ops = buildProcessFairnessSuggestedOperations({
      triggered: true,
      status: 'ACTIVE',
      decisionNode: 'accommodation',
      roundId: 'round-1',
      round: { id: 'round-1' } as never,
      agentIntroZh: 'intro',
      clientNavigation: {
        route: 'structured_negotiation',
        tripId: 'trip-1',
        roundId: 'round-1',
        domain: 'accommodation',
      },
    });
    expect(ops).toHaveLength(0);
  });

  it('keeps nav button for scaffold without inline round', () => {
    const ops = buildProcessFairnessSuggestedOperations({
      triggered: false,
      status: 'SCAFFOLD',
      decisionNode: 'accommodation',
      roundId: 'round-1',
      round: null,
      agentIntroZh: 'intro',
      clientNavigation: {
        route: 'structured_negotiation',
        tripId: 'trip-1',
        roundId: 'round-1',
        domain: 'accommodation',
      },
      skippedReason: 'member_access_pending',
    });
    expect(ops).toHaveLength(1);
    expect(ops[0]?.label).toBe('进入结构化协商');
  });
});
