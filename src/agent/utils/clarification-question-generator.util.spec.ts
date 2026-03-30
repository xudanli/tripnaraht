import {
  identifyGapsFromRequest,
  isUnresolvedDestinationPlaceholder,
} from './clarification-question-generator.util';

describe('isUnresolvedDestinationPlaceholder', () => {
  it('treats 未指定 and empty as unresolved', () => {
    expect(isUnresolvedDestinationPlaceholder('未指定')).toBe(true);
    expect(isUnresolvedDestinationPlaceholder('')).toBe(true);
    expect(isUnresolvedDestinationPlaceholder('  ')).toBe(true);
  });

  it('treats concrete city strings as resolved', () => {
    expect(isUnresolvedDestinationPlaceholder('上海')).toBe(false);
    expect(isUnresolvedDestinationPlaceholder('冰岛')).toBe(false);
  });

  it('does not treat coordinate objects as placeholder', () => {
    expect(isUnresolvedDestinationPlaceholder({ lat: 1, lng: 2 })).toBe(false);
  });
});

describe('identifyGapsFromRequest', () => {
  it('does not flag MISSING_DESTINATION when destination is set', () => {
    const gaps = identifyGapsFromRequest({
      request_id: 'r1',
      origin: 'a',
      destination: '上海',
      party: { count: 1 },
    });
    expect(gaps.find((g) => g.type === 'MISSING_DESTINATION')).toBeUndefined();
  });
});
