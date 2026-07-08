import {
  DECISION_COLLAB_SUBTASK_STATUS_OPTIONS,
  labelForCollaborativeSubTaskStatus,
  previewCollaborativeFollowUps,
} from './decision-collaborative-subtask.util';

describe('decision-collaborative-subtask.util', () => {
  it('maps status labels for UI dropdown', () => {
    expect(labelForCollaborativeSubTaskStatus('pending')).toBe('待处理');
    expect(labelForCollaborativeSubTaskStatus('in_progress')).toBe('进行中');
    expect(labelForCollaborativeSubTaskStatus('completed')).toBe('已完成');
    expect(DECISION_COLLAB_SUBTASK_STATUS_OPTIONS).toHaveLength(4);
  });

  it('previewCollaborativeFollowUps matches road closure seed', () => {
    const items = previewCollaborativeFollowUps('ROAD_SEGMENT_UNAVAILABLE');
    expect(items.map((i) => i.kind)).toEqual(['TEAM_CONFIRM', 'BOOKING_FOLLOWUP']);
  });
});
