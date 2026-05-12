import type { TripWorldState } from '../world-model';
import { enrichTripWorldStateInventoryPlaceholders } from './inventory-candidate-enrichment';

describe('enrichTripWorldStateInventoryPlaceholders', () => {
  it('adds degraded hotel_room snapshot when missing', () => {
    const state: TripWorldState = {
      context: {
        destination: 'IS',
        startDate: '2026-06-01',
        durationDays: 1,
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'low' },
      },
      candidatesByDate: {
        '2026-06-01': [
          {
            id: 'h1',
            name: { en: 'Hotel A' },
            type: 'hotel',
            durationMin: 0,
            inventoryRisk: 4,
          },
        ],
      },
      signals: { lastUpdatedAt: new Date().toISOString() },
    };

    enrichTripWorldStateInventoryPlaceholders(state, '2026-06-01T12:00:00.000Z');

    const c = state.candidatesByDate['2026-06-01']![0]!;
    expect(c.supplySnapshot?.kind).toBe('hotel_room');
    expect(c.supplySnapshot?.degraded).toBe(true);
    expect(c.supplySnapshot?.supply_risk).toBeGreaterThan(0.7);
  });

  it('skips non-hotel types', () => {
    const state: TripWorldState = {
      context: {
        destination: 'IS',
        startDate: '2026-06-01',
        durationDays: 1,
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'low' },
      },
      candidatesByDate: {
        '2026-06-01': [
          {
            id: 'p1',
            name: { en: 'Waterfall' },
            type: 'nature',
            durationMin: 60,
          },
        ],
      },
      signals: { lastUpdatedAt: new Date().toISOString() },
    };

    enrichTripWorldStateInventoryPlaceholders(state);
    expect(state.candidatesByDate['2026-06-01']![0]!.supplySnapshot).toBeUndefined();
  });
});
