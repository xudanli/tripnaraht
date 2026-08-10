import {
  clearIcelandSeasonalRoadCorpusCache,
  getIcelandSeasonalRoadInfo,
  resolveIcelandSeasonalRoadStatus,
} from './iceland-seasonal-road-status.util';

describe('iceland-seasonal-road-status', () => {
  beforeEach(() => clearIcelandSeasonalRoadCorpusCache());

  it('loads corpus entries for major F-roads', () => {
    expect(getIcelandSeasonalRoadInfo('F208')?.openMonths).toEqual(
      expect.arrayContaining([6, 7, 8, 9]),
    );
    expect(getIcelandSeasonalRoadInfo('F26')?.openMonths).toEqual([6, 7, 8]);
    expect(getIcelandSeasonalRoadInfo('F35')?.roadNameEN).toMatch(/Kjölur/i);
  });

  it('uses per-road open months (F26 closed in September)', () => {
    expect(resolveIcelandSeasonalRoadStatus('F26', 9)).toBe('closed');
    expect(resolveIcelandSeasonalRoadStatus('F208', 9)).toBe('limited');
    expect(resolveIcelandSeasonalRoadStatus('F208', 2)).toBe('closed');
  });
});
