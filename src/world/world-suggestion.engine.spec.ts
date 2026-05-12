import { suggestWorldMutationsAfterRoadBlocked } from './world-suggestion.engine';

describe('suggestWorldMutationsAfterRoadBlocked', () => {
  it('returns avoid-road mutation and a generic replan option', () => {
    const s = suggestWorldMutationsAfterRoadBlocked({
      roadId: 'F208',
      affectedSlotIds: ['s1'],
    });
    expect(s).toHaveLength(2);
    expect(s[0]?.suggestedCommand).toEqual({
      type: 'BLOCK_ROAD',
      roadId: 'F208',
      affectedSlotIds: ['s1'],
    });
    expect(s[1]?.type).toBe('REPLAN_OPTION');
  });
});
