import { isIcelandHighlandFRoadSeasonallyClosed } from './iceland-f-road-policy.util';

describe('isIcelandHighlandFRoadSeasonallyClosed', () => {
  it('treats May (Iceland F-Road highland) as seasonally closed', () => {
    expect(isIcelandHighlandFRoadSeasonallyClosed(new Date('2026-05-10T12:00:00.000Z'))).toBe(true);
  });

  it('treats mid-summer as open', () => {
    expect(isIcelandHighlandFRoadSeasonallyClosed(new Date('2026-08-01T12:00:00.000Z'))).toBe(false);
  });

  it('opens on Jun 20 and closes again Oct 15', () => {
    expect(isIcelandHighlandFRoadSeasonallyClosed(new Date('2026-06-19T12:00:00.000Z'))).toBe(true);
    expect(isIcelandHighlandFRoadSeasonallyClosed(new Date('2026-06-20T12:00:00.000Z'))).toBe(false);
    expect(isIcelandHighlandFRoadSeasonallyClosed(new Date('2026-10-14T12:00:00.000Z'))).toBe(false);
    expect(isIcelandHighlandFRoadSeasonallyClosed(new Date('2026-10-15T12:00:00.000Z'))).toBe(true);
  });
});
