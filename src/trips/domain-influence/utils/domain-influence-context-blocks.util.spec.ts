import type { TripDomainInfluenceSnapshot } from '../types/trip-domain.types';
import {
  buildDomainInfluenceContextBlocks,
  shouldIncludeDomainInfluenceContext,
} from './domain-influence-context-blocks.util';

function minimalSnapshot(
  overrides: Partial<TripDomainInfluenceSnapshot> = {},
): TripDomainInfluenceSnapshot {
  return {
    tripId: 'trip-1',
    memberCount: 2,
    domains: [
      {
        domain: 'dining',
        domainLabel: '餐饮',
        decisionRule: {
          crossLevel: 'medium',
          ruleLabelZh: '中交叉领域 / 专家提案 + 团队投票',
          expertCanDecideAlone: false,
          requiresTeamVote: true,
          requiresFullTeamDiscussion: false,
        },
        claims: [
          {
            id: 'c1',
            userId: 'u-leader',
            displayName: '张三',
            claimSource: 'explicit',
            selfScore: 80,
            note: null,
            endorsementCount: 1,
            endorsementTotal: 2,
            endorsedByCurrentUser: false,
          },
        ],
        weights: [
          {
            userId: 'u-leader',
            displayName: '张三',
            weight: 0.6,
            weightPercent: 60,
            isLeader: true,
            selfScore: 80,
            peerTrustScore: 0.5,
            stakeScore: 0.5,
            payerScore: 0.5,
            endorsementCount: 1,
            claimSource: 'explicit',
          },
        ],
        leaderUserId: 'u-leader',
        leaderDisplayName: '张三',
        weightSource: 'computed',
        unclaimed: false,
      },
    ],
    completionRate: 0.13,
    allMembersClaimed: false,
    balanceWarnings: [],
    rulesConfirmed: true,
    rulesConfirmedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('domain-influence-context-blocks.util', () => {
  it('shouldIncludeDomainInfluenceContext: multi-member trip', () => {
    expect(shouldIncludeDomainInfluenceContext(minimalSnapshot())).toBe(true);
  });

  it('shouldIncludeDomainInfluenceContext: solo trip without claims skips', () => {
    expect(
      shouldIncludeDomainInfluenceContext(
        minimalSnapshot({
          memberCount: 1,
          rulesConfirmed: false,
          domains: [],
          balanceWarnings: [],
        }),
      ),
    ).toBe(false);
  });

  it('buildDomainInfluenceContextBlocks: team block + private leader constraints', () => {
    const snapshot = minimalSnapshot();
    const blocks = buildDomainInfluenceContextBlocks({
      tripId: 'trip-1',
      userId: 'u-leader',
      snapshot,
      leaderPrivateBundles: [
        {
          domain: 'dining',
          domainLabel: '餐饮',
          constraints: [
            {
              wishId: 'w1',
              importance: 4,
              text: '不能吃辣',
              structuredHints: { must_avoid: ['辣'] },
              memberSlot: 2,
            },
          ],
        },
      ],
    });

    expect(blocks.some((b) => b.type === 'DOMAIN_INFLUENCE_TEAM')).toBe(true);
    expect(blocks.some((b) => b.type === 'DOMAIN_INFLUENCE_PRIVATE')).toBe(true);
    const privateBlock = blocks.find((b) => b.type === 'DOMAIN_INFLUENCE_PRIVATE');
    expect(privateBlock?.text).toContain('成员#2');
    expect(privateBlock?.text).not.toContain('u-leader');
  });
});
