import type { TripWorldState } from '../decision/world-model';
import { applyEcoLedgerTripContext } from './apply-eco-ledger-trip-context';

describe('applyEcoLedgerTripContext', () => {
  it('copies boundTripId when ecoLedgerTripId unset', () => {
    const state = {
      context: {
        destination: 'x',
        startDate: '2026-01-01',
        durationDays: 3,
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'low' },
      },
      candidatesByDate: {},
      signals: { lastUpdatedAt: '2026-01-01T00:00:00.000Z' },
      policies: { ecoClosure: { boundTripId: 'trip-uuid-1' } },
    } as unknown as TripWorldState;
    applyEcoLedgerTripContext(state);
    expect(state.signals.ecoLedgerTripId).toBe('trip-uuid-1');
  });

  it('prefers boundTripId over context.tripId when both set', () => {
    const state = {
      context: {
        destination: 'x',
        startDate: '2026-01-01',
        durationDays: 3,
        tripId: 'from-context',
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'low' },
      },
      candidatesByDate: {},
      signals: { lastUpdatedAt: '2026-01-01T00:00:00.000Z' },
      policies: { ecoClosure: { boundTripId: 'from-policy' } },
    } as unknown as TripWorldState;
    applyEcoLedgerTripContext(state);
    expect(state.signals.ecoLedgerTripId).toBe('from-policy');
  });

  it('uses context.tripId when boundTripId absent', () => {
    const state = {
      context: {
        destination: 'x',
        startDate: '2026-01-01',
        durationDays: 3,
        tripId: 'from-context',
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'low' },
      },
      candidatesByDate: {},
      signals: { lastUpdatedAt: '2026-01-01T00:00:00.000Z' },
    } as unknown as TripWorldState;
    applyEcoLedgerTripContext(state);
    expect(state.signals.ecoLedgerTripId).toBe('from-context');
  });

  it('does not override existing ecoLedgerTripId', () => {
    const state = {
      context: {
        destination: 'x',
        startDate: '2026-01-01',
        durationDays: 3,
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'low' },
      },
      candidatesByDate: {},
      signals: { lastUpdatedAt: '2026-01-01T00:00:00.000Z', ecoLedgerTripId: 'a' },
      policies: { ecoClosure: { boundTripId: 'b' } },
    } as unknown as TripWorldState;
    applyEcoLedgerTripContext(state);
    expect(state.signals.ecoLedgerTripId).toBe('a');
  });
});
