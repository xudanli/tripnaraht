import {
  shouldReportSoftTightTravel,
  DEFAULT_SHORT_HOP_MAX_KM,
} from './same-day-travel-noise.util';

describe('shouldReportSoftTightTravel', () => {
  it('always reports start-too-early hard conflicts', () => {
    expect(
      shouldReportSoftTightTravel({
        isStartTooEarly: true,
        gapMinutes: -20,
        distanceKm: 10,
        travelMinutes: 12,
      }),
    ).toBe(true);
  });

  it('skips soft tight buffer on short hops (瀑布串 / 钻石沙滩)', () => {
    expect(
      shouldReportSoftTightTravel({
        isStartTooEarly: false,
        gapMinutes: 15,
        distanceKm: 25.8,
        travelMinutes: 26,
      }),
    ).toBe(false);
    expect(
      shouldReportSoftTightTravel({
        isStartTooEarly: false,
        gapMinutes: 10,
        distanceKm: 21.3,
        travelMinutes: 21,
      }),
    ).toBe(false);
  });

  it('reports soft tight buffer on long legs', () => {
    expect(
      shouldReportSoftTightTravel({
        isStartTooEarly: false,
        gapMinutes: 15,
        distanceKm: DEFAULT_SHORT_HOP_MAX_KM + 5,
        travelMinutes: 55,
      }),
    ).toBe(true);
  });

  it('skips when gap already comfortable', () => {
    expect(
      shouldReportSoftTightTravel({
        isStartTooEarly: false,
        gapMinutes: 45,
        distanceKm: 80,
        travelMinutes: 70,
      }),
    ).toBe(false);
  });
});
