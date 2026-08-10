import { AirbnbDirectService } from './airbnb-direct.service';

describe('AirbnbDirectService', () => {
  it('buildSearchUrl encodes location and dates', () => {
    const svc = new AirbnbDirectService();
    const url = (svc as any).buildSearchUrl({
      location: 'Höfn, Iceland',
      checkin: '2026-08-19',
      checkout: '2026-08-20',
      adults: 2,
    });
    expect(url).toContain('/s/');
    expect(url).toContain('checkin=2026-08-19');
    expect(url).toContain('checkout=2026-08-20');
    expect(url).toContain('adults=2');
  });

  it('normalizeListing decodes DemandStayListing id', () => {
    const svc = new AirbnbDirectService();
    const demandId = Buffer.from('DemandStayListing:921065132849515213').toString('base64');
    const row = {
      propertyId: 'x',
      demandStayListing: {
        id: demandId,
        description: {
          name: { localizedStringWithTranslationPreference: 'Twin room' },
        },
      },
    };
    const out = (svc as any).normalizeListing(row);
    expect(out.id).toBe('921065132849515213');
    expect(out.url).toContain('/rooms/921065132849515213');
  });
});
