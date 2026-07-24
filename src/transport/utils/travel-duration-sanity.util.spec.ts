import { isImplausibleTravelDuration } from './travel-duration-sanity.util';

describe('travel-duration-sanity.util', () => {
  it('flags KEF→Geysir bug (18 km / 219 min walking pace)', () => {
    expect(
      isImplausibleTravelDuration({ distanceMeters: 18244, durationMinutes: 219 }),
    ).toBe(true);
  });

  it('accepts normal airport→rental drive (~18 min)', () => {
    expect(
      isImplausibleTravelDuration({ distanceMeters: 18244, durationMinutes: 18 }),
    ).toBe(false);
  });

  it('flags implausibly short long-haul', () => {
    expect(
      isImplausibleTravelDuration({ distanceMeters: 200_000, durationMinutes: 30 }),
    ).toBe(true);
  });

  it('accepts Landmannalaugar-scale long drive', () => {
    expect(
      isImplausibleTravelDuration({ distanceMeters: 180_000, durationMinutes: 180 }),
    ).toBe(false);
  });
});
