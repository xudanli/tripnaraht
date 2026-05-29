import {
  normalizeTravelerNationality,
  parseTravelerNationalityFromUserQuery,
  resolveTravelerNationality,
} from './resolve-traveler-nationality.util';

describe('resolve-traveler-nationality.util', () => {
  it('normalizes ISO2 codes', () => {
    expect(normalizeTravelerNationality('cn')).toBe('CN');
    expect(normalizeTravelerNationality('CHN')).toBeUndefined();
  });

  it('parses nationality from userQuery hints', () => {
    expect(parseTravelerNationalityFromUserQuery('我是中国人，想去冰岛')).toBe('CN');
    expect(parseTravelerNationalityFromUserQuery('US passport holder planning NZ')).toBe('US');
    expect(parseTravelerNationalityFromUserQuery('护照: GB')).toBe('GB');
  });

  it('resolves with explicit override first', () => {
    expect(
      resolveTravelerNationality({
        explicit: 'US',
        userBasicsNationality: 'CN',
        userQuery: '中国护照',
      }),
    ).toBe('US');
  });

  it('resolves from userProfile preferences', () => {
    expect(
      resolveTravelerNationality({
        userProfilePreferences: { nationality: 'CN', tags: ['photo'] },
      }),
    ).toBe('CN');
  });

  it('falls back to userQuery', () => {
    expect(
      resolveTravelerNationality({
        userQuery: '持中国护照去新西兰',
      }),
    ).toBe('CN');
  });
});
