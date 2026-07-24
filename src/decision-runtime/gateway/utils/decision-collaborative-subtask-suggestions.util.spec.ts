import { buildSuggestedSubTasks } from './decision-collaborative-subtask-suggestions.util';

describe('buildSuggestedSubTasks', () => {
  it('suggests team confirm + booking follow-up for road closure', () => {
    const items = buildSuggestedSubTasks('ROAD_SEGMENT_UNAVAILABLE:evt1');
    expect(items.map((i) => i.kind)).toEqual(['TEAM_CONFIRM', 'BOOKING_FOLLOWUP']);
  });

  it('suggests accommodation tasks for booking problems', () => {
    const items = buildSuggestedSubTasks('BOOKING_INVALID');
    expect(items.map((i) => i.kind)).toEqual(['ACCOMMODATION_LOOKUP', 'CANCELLATION_POLICY']);
  });

  it('defaults to team confirm', () => {
    const items = buildSuggestedSubTasks('UNKNOWN_KEY');
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('TEAM_CONFIRM');
  });
});
