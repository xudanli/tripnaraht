import {
  mergeCommercialIntoMetadata,
  normalizeOsmCommercialAttrs,
  projectCommercialForApi,
  resolveOpenStatusFromHours,
} from './osm-commercial-attrs.util';

describe('osm-commercial-attrs.util', () => {
  it('lifts hours/contact/reservation/fee from rawTags', () => {
    const attrs = normalizeOsmCommercialAttrs({
      metadata: {
        rawTags: {
          opening_hours: 'Mo-Fr 09:00-18:00',
          phone: '+354 555 1234',
          'contact:website': 'https://example.is',
          reservation: 'yes',
          fee: 'yes',
          charge: '2000 ISK',
        },
      },
    });
    expect(attrs.openingHoursRaw).toBe('Mo-Fr 09:00-18:00');
    expect(attrs.openingHours?.weekday).toContain('09:00');
    expect(attrs.phone).toBe('+354 555 1234');
    expect(attrs.website).toBe('https://example.is');
    expect(attrs.reservationRequired).toBe(true);
    expect(attrs.feeCharged).toBe(true);
    expect(attrs.priceHint?.kind).toBe('fee');
  });

  it('maps fee=no to free hint', () => {
    const attrs = normalizeOsmCommercialAttrs({
      tags: { fee: 'no' },
    });
    expect(attrs.feeCharged).toBe(false);
    expect(attrs.priceHint).toEqual({ kind: 'free', label: '免费' });
  });

  it('merges into metadata without dropping rawTags', () => {
    const merged = mergeCommercialIntoMetadata(
      { source: 'osm_amenity_fuel', rawTags: { fee: 'no', phone: '1' } },
      normalizeOsmCommercialAttrs({ tags: { fee: 'no', phone: '1' } }),
    );
    expect(merged.source).toBe('osm_amenity_fuel');
    expect(merged.rawTags).toEqual({ fee: 'no', phone: '1' });
    expect(merged.phone).toBe('1');
    expect((merged.commercial as any).priceHint.kind).toBe('free');
  });

  it('resolves open status from weekday range', () => {
    const hours = { mon: '09:00-18:00', osmFormat: 'Mo 09:00-18:00' };
    // Monday 2026-07-20 12:00 local — use fixed UTC+0 noon on a Monday
    const mondayNoon = new Date('2026-07-20T12:00:00');
    expect(resolveOpenStatusFromHours(hours, mondayNoon)).toBe('open');
    const mondayNight = new Date('2026-07-20T20:00:00');
    expect(resolveOpenStatusFromHours(hours, mondayNight)).toBe('closed');
  });

  it('projects API fields', () => {
    const meta = mergeCommercialIntoMetadata(
      { rawTags: { opening_hours: '24/7', reservation: 'no', fee: 'no' } },
      normalizeOsmCommercialAttrs({
        tags: { opening_hours: '24/7', reservation: 'no', fee: 'no' },
      }),
    );
    const proj = projectCommercialForApi(meta);
    expect(proj.openingHoursText).toBe('24/7');
    expect(proj.openStatus).toBe('open');
    expect(proj.requiresReservation).toBe(false);
    expect(proj.feeLabel).toBe('免费');
  });
});
