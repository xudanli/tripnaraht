/**
 * Anti-noise gates for Vedur weather observation change detection.
 */

import {
  classifyWeatherRiskTier,
  shouldEmitWeatherObservationChange,
} from './weather-observation-change.util';

describe('weather-observation-change.util', () => {
  it('first calm observation does not emit', () => {
    expect(
      shouldEmitWeatherObservationChange({
        next: {
          windSpeedKmh: 18,
          riskTier: 'CALM',
          fingerprint: 'iceland_met|1|w18|g28.8',
          observedAt: '2026-07-10T12:00:00.000Z',
        },
      }),
    ).toBe(false);
  });

  it('first elevated observation emits', () => {
    const tier = classifyWeatherRiskTier(70, 70);
    expect(tier).toBe('ELEVATED');
    expect(
      shouldEmitWeatherObservationChange({
        next: {
          windSpeedKmh: 70,
          windGustKmh: 70,
          riskTier: tier,
          fingerprint: 'iceland_met|1|w70|g70',
          observedAt: '2026-07-10T12:00:00.000Z',
        },
      }),
    ).toBe(true);
  });

  it('same fingerprint does not emit', () => {
    const snap = {
      windSpeedKmh: 18,
      windGustKmh: 28.8,
      riskTier: 'CALM' as const,
      fingerprint: 'iceland_met|1|w18|g28.8',
      observedAt: '2026-07-10T12:00:00.000Z',
      validUntil: '2026-07-10T14:00:00.000Z',
    };
    expect(
      shouldEmitWeatherObservationChange({
        previous: snap,
        next: snap,
      }),
    ).toBe(false);
  });
});
