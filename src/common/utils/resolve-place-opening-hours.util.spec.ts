import {
  extractOpeningHoursFromPlaceMetadata,
  hasResolvableOpeningHours,
  openingHoursToEvidenceString,
} from './resolve-place-opening-hours.util';

describe('resolve-place-opening-hours', () => {
  it('reads structured openingHours.osmFormat from metadata', () => {
    const raw = extractOpeningHoursFromPlaceMetadata({
      openingHours: { osmFormat: '24/7', mon: '09:00-18:00' },
    });
    expect(hasResolvableOpeningHours(raw)).toBe(true);
    expect(openingHoursToEvidenceString(raw)).toBe('24 Hours');
  });

  it('normalizes 全天开放 string to 24 Hours for verify', () => {
    expect(openingHoursToEvidenceString('全天开放')).toBe('24 Hours');
  });

  it('reads rawTags.opening_hours fallback', () => {
    const raw = extractOpeningHoursFromPlaceMetadata({
      rawTags: { opening_hours: 'Mo-Su 08:00-20:00' },
    });
    expect(hasResolvableOpeningHours(raw)).toBe(true);
  });

  it('rejects empty / unknown placeholders', () => {
    expect(hasResolvableOpeningHours(null)).toBe(false);
    expect(hasResolvableOpeningHours('营业时间未知')).toBe(false);
  });
});
