import { normalizeTravelSignals } from './travel-signal-normalizer';

describe('travel-signal-normalizer', () => {
  it('normalizes explicit travel signals and derived flight signals', () => {
    const signals = normalizeTravelSignals(
      {
        environmentState: {
          flights: [{ flight: 'CA123', status: 'delayed', observedAt: '2026-06-14T08:00:00.000Z' }],
        },
      } as any,
      {
        requestId: 'r1',
        researchData: {
          __travel_signals: [
            {
              id: 'road-signal',
              type: 'ROAD_CLOSED',
              entityRef: { type: 'ROAD', id: 'F208' },
              observedAt: '2026-06-14T07:00:00.000Z',
              source: 'road-authority',
              severity: 'HIGH',
            },
          ],
        },
      },
    );

    expect(signals.map((s) => s.type)).toEqual(expect.arrayContaining(['ROAD_CLOSED', 'FLIGHT_DELAYED']));
  });
});
