import { computeCollabTeamHealth, resolveTeamId, resolveTravelerCount } from './collab-overview.util';
import type { CollaborativeTaskItem } from '../domain-influence/types/trip-domain.types';

describe('collab-overview.util', () => {
  const baseTasks: CollaborativeTaskItem[] = [
    {
      id: 'task:dining',
      source: 'domain_influence',
      problemId: null,
      domain: 'dining',
      title: '餐饮',
      description: 'd',
      crossLevel: 'high',
      status: 'consensus_reached',
      statusLabel: '已共识',
      claimCount: 2,
      leaderDisplayName: 'A',
      endorsementSummary: null,
      weightSource: 'computed',
      closesAt: null,
      activeRoundId: null,
    },
    {
      id: 'task:transport',
      source: 'domain_influence',
      problemId: null,
      domain: 'main_transport',
      title: '交通',
      description: 'd',
      crossLevel: 'medium',
      status: 'in_discussion',
      statusLabel: '讨论中',
      claimCount: 1,
      leaderDisplayName: null,
      endorsementSummary: null,
      weightSource: 'negotiation',
      closesAt: null,
      activeRoundId: 'round-1',
    },
  ];

  it('computes team health with weighted progress', () => {
    const health = computeCollabTeamHealth({
      profilingCompletionRate: 80,
      domainCompletionRate: 60,
      collaborativeTasks: baseTasks,
      openSilentVoteCount: 1,
      highFrictionCount: 0,
      compatibilityBand: 'needs_negotiation',
    });

    expect(health.progressPercent).toBe(64);
    expect(health.discussionCount).toBe(2);
    expect(health.status).toBe('attention');
  });

  it('marks at_risk when high friction alerts exist', () => {
    const health = computeCollabTeamHealth({
      profilingCompletionRate: 100,
      domainCompletionRate: 100,
      collaborativeTasks: [],
      openSilentVoteCount: 0,
      highFrictionCount: 2,
      compatibilityBand: 'high_risk',
    });
    expect(health.status).toBe('at_risk');
  });

  it('resolves teamId and traveler count from metadata', () => {
    expect(resolveTeamId({ teamId: 'team-abc' })).toBe('team-abc');
    expect(resolveTravelerCount({ travelers: [{}, {}] }, 3)).toBe(2);
    expect(resolveTravelerCount({}, 4)).toBe(4);
  });
});
