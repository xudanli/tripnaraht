import {
  computeTeamTaskStats,
  isMineRelevant,
  nextStatusOnAssigneeChange,
  sortTeamTasks,
} from './team-tasks.util';

describe('team-tasks.util', () => {
  const base = {
    assigneeMemberId: null as string | null,
    assigneeName: null as string | null,
    dueAt: null as Date | null,
    updatedAt: new Date('2026-08-05T10:00:00Z'),
  };

  it('isMineRelevant covers assignee / 全员 / open-unassigned', () => {
    expect(
      isMineRelevant(
        { status: 'claimed', assigneeMemberId: 'u1', assigneeName: 'A' },
        'u1',
      ),
    ).toBe(true);
    expect(
      isMineRelevant(
        { status: 'open', assigneeMemberId: null, assigneeName: '全员' },
        'u1',
      ),
    ).toBe(true);
    expect(
      isMineRelevant(
        { status: 'open', assigneeMemberId: null, assigneeName: null },
        'u1',
      ),
    ).toBe(true);
    expect(
      isMineRelevant(
        { status: 'done', assigneeMemberId: null, assigneeName: null },
        'u1',
      ),
    ).toBe(false);
  });

  it('stats ignore cancelled and keep mine count', () => {
    const stats = computeTeamTaskStats(
      [
        { status: 'open', assigneeMemberId: null, assigneeName: null },
        { status: 'claimed', assigneeMemberId: 'u1', assigneeName: 'Me' },
        { status: 'done', assigneeMemberId: 'u2', assigneeName: 'Other' },
        { status: 'cancelled', assigneeMemberId: 'u1', assigneeName: 'Me' },
      ],
      'u1',
    );
    expect(stats).toEqual({
      open: 1,
      claimed: 1,
      done: 1,
      mineOpenOrClaimed: 2,
    });
  });

  it('sorts open → claimed(mine first) → done, then dueAt', () => {
    const sorted = sortTeamTasks(
      [
        {
          ...base,
          status: 'done',
          id: 'd',
          dueAt: new Date('2026-08-01T00:00:00Z'),
        },
        {
          ...base,
          status: 'claimed',
          id: 'c2',
          assigneeMemberId: 'other',
          dueAt: new Date('2026-08-02T00:00:00Z'),
        },
        {
          ...base,
          status: 'claimed',
          id: 'c1',
          assigneeMemberId: 'me',
          dueAt: new Date('2026-08-03T00:00:00Z'),
        },
        {
          ...base,
          status: 'open',
          id: 'o',
          dueAt: null,
        },
      ],
      'me',
    );
    expect(sorted.map((t) => t.id)).toEqual(['o', 'c1', 'c2', 'd']);
  });

  it('nextStatusOnAssigneeChange respects done', () => {
    expect(nextStatusOnAssigneeChange('open', true)).toBe('claimed');
    expect(nextStatusOnAssigneeChange('claimed', false)).toBe('open');
    expect(nextStatusOnAssigneeChange('done', true)).toBeNull();
  });
});
