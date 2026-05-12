import type { TripWorldState } from '../decision/world-model';
import { applyPrismaTripIdToWorldState } from './apply-prisma-trip-id-to-world-state';

describe('applyPrismaTripIdToWorldState', () => {
  it('sets signals and context.tripId when context exists', () => {
    const state = {
      context: {
        destination: 'x',
        startDate: '2026-01-01',
        durationDays: 3,
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'low' },
      },
      candidatesByDate: {},
      signals: { lastUpdatedAt: '2026-01-01T00:00:00.000Z' },
    } as unknown as TripWorldState;
    applyPrismaTripIdToWorldState(state, 'tid-1');
    expect(state.signals.ecoLedgerTripId).toBe('tid-1');
    expect(state.context.tripId).toBe('tid-1');
    expect(state.signals.lastUpdatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('sets signals without context', () => {
    const state = {
      candidatesByDate: {},
      signals: {},
    } as unknown as TripWorldState;
    applyPrismaTripIdToWorldState(state, 'tid-2');
    expect(state.signals.ecoLedgerTripId).toBe('tid-2');
    expect((state as any).context).toBeUndefined();
  });

  it('no-op without tripId', () => {
    const state = {
      context: {
        destination: 'x',
        startDate: '2026-01-01',
        durationDays: 3,
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'low' },
      },
      candidatesByDate: {},
      signals: { lastUpdatedAt: '2026-01-01T00:00:00.000Z' },
    } as unknown as TripWorldState;
    applyPrismaTripIdToWorldState(state, undefined);
    expect(state.signals.ecoLedgerTripId).toBeUndefined();
  });
});
