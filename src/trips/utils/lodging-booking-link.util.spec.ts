import { resolveLodgingBookingLink } from './lodging-booking-link.util';

describe('resolveLodgingBookingLink', () => {
  it('returns official primary plus Booking/Airbnb/Trip channels', () => {
    const link = resolveLodgingBookingLink({
      nameEn: 'Vík Hostel',
      metadata: { website: 'https://www.vikhostel.is/' },
    });
    expect(link?.bookingUrl).toBe('https://www.vikhostel.is/');
    expect(link?.bookingProvider).toBe('official');
    expect(link?.bookingCtaLabelZh).toBe('去官网预订');
    expect(link?.bookingLinks.map((c) => c.provider)).toEqual([
      'official',
      'booking_com',
      'airbnb',
      'trip_com',
    ]);
  });

  it('falls back to Booking.com as primary with Airbnb and Trip.com', () => {
    const link = resolveLodgingBookingLink({
      nameZh: '维克旅馆',
      nameEn: 'Vík Hostel',
    });
    expect(link?.bookingProvider).toBe('booking_com');
    expect(link?.bookingCtaLabelZh).toBe('在 Booking.com 查看');
    expect(link?.bookingUrl).toContain('booking.com/searchresults.html');
    expect(link?.bookingUrl).toContain(encodeURIComponent('Vík Hostel, Iceland'));

    const byProvider = Object.fromEntries(
      (link?.bookingLinks ?? []).map((c) => [c.provider, c.url]),
    );
    expect(byProvider.booking_com).toContain('booking.com');
    expect(byProvider.airbnb).toContain('airbnb.com/s/homes');
    expect(byProvider.airbnb).toContain(encodeURIComponent('Vík Hostel, Iceland'));
    expect(byProvider.trip_com).toContain('trip.com/hotels/list');
    expect(byProvider.trip_com).toContain(encodeURIComponent('Vík Hostel, Iceland'));
  });

  it('uses metadata provider deep-links when present', () => {
    const link = resolveLodgingBookingLink({
      nameEn: 'Vík Hostel',
      metadata: {
        airbnbUrl: 'https://www.airbnb.com/rooms/123',
        tripComUrl: 'https://www.trip.com/hotels/detail/?hotelId=9',
      },
    });
    const byProvider = Object.fromEntries(
      (link?.bookingLinks ?? []).map((c) => [c.provider, c.url]),
    );
    expect(byProvider.airbnb).toBe('https://www.airbnb.com/rooms/123');
    expect(byProvider.trip_com).toBe(
      'https://www.trip.com/hotels/detail/?hotelId=9',
    );
  });

  it('returns null when no name and no metadata url', () => {
    expect(resolveLodgingBookingLink({})).toBeNull();
  });

  it('uses 携程/飞猪/去哪儿 for China market', () => {
    const link = resolveLodgingBookingLink({
      nameZh: '宽窄巷子精品酒店',
      countryCode: 'CN',
      countryName: 'China',
    });
    expect(link?.bookingProvider).toBe('ctrip');
    expect(link?.bookingUrl).toContain('ctrip.com');
    expect(link?.bookingLinks.map((c) => c.provider)).toEqual([
      'ctrip',
      'fliggy',
      'qunar',
    ]);
    const fliggy = link?.bookingLinks.find((c) => c.provider === 'fliggy');
    expect(fliggy?.labelZh).toBe('飞猪');
    expect(fliggy?.url.startsWith('https://')).toBe(true);
    expect(fliggy?.url).toContain('fliggy.com');
    expect(fliggy?.webUrl?.startsWith('https://')).toBe(true);
    expect((fliggy as { appUrl?: string } | undefined)?.appUrl).toBeUndefined();
    expect(link?.bookingLinks.find((c) => c.provider === 'qunar')?.url).toContain(
      'qunar.com',
    );
  });
});

