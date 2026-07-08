import {
  mapCollaborativeSubTaskItem,
  mapSuggestedCollaborativeSubTaskItem,
} from './decision-collaborative-subtask-projection.util';

describe('decision-collaborative-subtask-projection.util', () => {
  it('maps persisted sub-task with isSubTask=true', () => {
    const item = mapCollaborativeSubTaskItem({
      id: 'csub_abc',
      tripId: 'trip1',
      problemId: 'dp-1',
      resolutionId: 'res_1',
      kind: 'TEAM_CONFIRM',
      title: '团队确认',
      status: 'pending',
      createdAt: '2026-07-03T00:00:00Z',
      createdByUserId: 'user1',
    });

    expect(item.isSubTask).toBe(true);
    expect(item.subTaskKind).toBe('TEAM_CONFIRM');
    expect(item.subTaskStatus).toBe('pending');
    expect(item.resolutionId).toBe('res_1');
    expect(item.assigneeUserId).toBeNull();
    expect(item.problemTitle).toBeNull();
  });

  it('maps assigneeUserId when set on persisted sub-task', () => {
    const item = mapCollaborativeSubTaskItem({
      id: 'csub_xyz',
      tripId: 'trip1',
      problemId: 'dp-1',
      resolutionId: 'res_1',
      kind: 'BOOKING_FOLLOWUP',
      title: '预约跟进',
      status: 'pending',
      assigneeUserId: 'user_42',
      createdAt: '2026-07-03T00:00:00Z',
      createdByUserId: 'user1',
    });

    expect(item.assigneeUserId).toBe('user_42');
  });

  it('prefixes generic title with problemTitle option', () => {
    const item = mapCollaborativeSubTaskItem(
      {
        id: 'csub_abc',
        tripId: 'trip1',
        problemId: 'dp-1',
        resolutionId: 'res_1',
        kind: 'TEAM_CONFIRM',
        title: '团队确认决策结果',
        status: 'pending',
        createdAt: '2026-07-03T00:00:00Z',
        createdByUserId: 'user1',
      },
      { problemTitle: '第3天 · 斯科加瀑布午餐推迟' },
    );

    expect(item.title).toBe('第3天 · 斯科加瀑布午餐推迟 · 团队确认');
    expect(item.problemTitle).toBe('第3天 · 斯科加瀑布午餐推迟');
  });

  it('maps suggested follow-up as sub-task shape', () => {
    const item = mapSuggestedCollaborativeSubTaskItem({
      problemId: 'dp-1',
      title: '第3天 · 斯科加瀑布午餐推迟',
      resolution: {
        resolutionId: 'res_1',
        problemId: 'dp-1',
        selectedActionId: 'option-1',
        writeChain: 'APPLY_AND_POLL',
        status: 'AUTHORIZED',
        decidedAt: '2026-07-03T00:00:00Z',
        decidedByUserId: 'user1',
      },
      suggestion: {
        kind: 'TEAM_CONFIRM',
        title: '团队确认决策结果',
      },
    });

    expect(item.isSubTask).toBe(true);
    expect(item.id).toContain('csub_suggested_');
    expect(item.statusLabel).toBe('建议跟进');
    expect(item.assigneeUserId).toBeNull();
    expect(item.title).toBe('第3天 · 斯科加瀑布午餐推迟 · 团队确认');
    expect(item.problemTitle).toBe('第3天 · 斯科加瀑布午餐推迟');
  });
});
