import { extractSeason } from './extract-season.runner';

describe('extract-season.runner', () => {
  it('maps months to seasons', () => {
    expect(extractSeason('2026-03-15')).toBe('spring');
    expect(extractSeason('2026-07-01')).toBe('summer');
    expect(extractSeason('2026-10-10')).toBe('autumn');
    expect(extractSeason('2026-01-05')).toBe('winter');
  });
});
