import {
  inferCountryFromDestination,
  countryDisplayName,
  dedupePois,
  buildPoiCountryClarificationQuestion,
} from './poi-destination-helpers.runner';

describe('poi-destination-helpers.runner', () => {
  it('infers Iceland and Japan', () => {
    expect(inferCountryFromDestination('冰岛')).toBe('IS');
    expect(inferCountryFromDestination('Tokyo')).toBe('JP');
  });

  it('builds country clarification and display name', () => {
    expect(countryDisplayName('IS')).toBe('冰岛');
    const q = buildPoiCountryClarificationQuestion('雷克雅未克', 'IS');
    expect(q.id).toBe('question-poi-country');
  });

  it('dedupes POIs by id/name/address', () => {
    const out = dedupePois([
      { id: 1, name: 'A', address: 'x' },
      { id: 1, name: 'A', address: 'x' },
      { id: 2, name: 'B', address: 'y' },
    ]);
    expect(out).toHaveLength(2);
  });
});
