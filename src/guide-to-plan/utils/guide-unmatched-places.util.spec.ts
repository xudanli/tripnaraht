import { countUnmatchedPoiCandidates } from './guide-unmatched-places.util';

describe('countUnmatchedPoiCandidates', () => {
  it('counts unmatched poi and activity, not route_theme', () => {
    expect(
      countUnmatchedPoiCandidates([
        { candidateType: 'poi', matchStatus: 'unmatched' },
        { candidateType: 'activity', matchStatus: 'unmatched' },
        { candidateType: 'route_theme', matchStatus: 'unmatched' },
        { candidateType: 'poi', matchStatus: 'matched' },
      ]),
    ).toBe(2);
  });
});
