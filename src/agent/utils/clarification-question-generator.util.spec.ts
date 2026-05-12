import {
  identifyGapsFromRequest,
  isTransportGeographicPlaceholder,
  isUnresolvedDestinationPlaceholder,
  generateClarificationQuestions,
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

describe('isTransportGeographicPlaceholder', () => {
  it('treats common endpoint pronouns as placeholders', () => {
    expect(isTransportGeographicPlaceholder('起点')).toBe(true);
    expect(isTransportGeographicPlaceholder('终点')).toBe(true);
    expect(isTransportGeographicPlaceholder('origin')).toBe(true);
    expect(isTransportGeographicPlaceholder('Destination')).toBe(true);
  });

  it('does not treat concrete place names as placeholders', () => {
    expect(isTransportGeographicPlaceholder('上海')).toBe(false);
    expect(isTransportGeographicPlaceholder('起点站餐厅')).toBe(false);
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

describe('generateClarificationQuestions', () => {
  it('uses EN copy when locale is en', () => {
    const qs = generateClarificationQuestions(
      [{ type: 'MISSING_DATES', severity: 'HARD', detail: 'x' }],
      { request_id: 'r1', origin: 'a', destination: '冰岛' },
      { locale: 'en-US' },
    );
    expect(qs[0]?.question).toMatch(/travel/i);
  });
});
