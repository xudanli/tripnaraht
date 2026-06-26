import type { TripWorldState } from '../../decision/world-model';
import {
  attachIcelandAssessmentToState,
  buildIcelandAssessmentFromTripState,
  isIcelandDestination,
} from './trip-world-state-iceland-causal.util';

describe('trip-world-state-iceland-causal', () => {
  const state = (): TripWorldState =>
    ({
      context: {
        tripId: 't1',
        destination: 'Iceland South Coast',
        startDate: '2026-07-01',
        durationDays: 5,
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
      },
      candidatesByDate: {},
      signals: {
        lastUpdatedAt: new Date().toISOString(),
        weatherByDate: {
          '2026-07-01': { windSpeedMs: 17, crosswindRisk: 'HIGH' },
        },
      },
    }) as TripWorldState;

  it('detects iceland destinations', () => {
    expect(isIcelandDestination('IS')).toBe(true);
    expect(isIcelandDestination('Tokyo')).toBe(false);
  });

  it('builds assessment from weather + defaults', () => {
    const out = buildIcelandAssessmentFromTripState(state(), null);
    expect(out).toBeDefined();
    expect(out!.userFacingAssessment.length).toBeGreaterThan(20);
    expect(out!.travelTime.p90Minutes).toBeGreaterThan(out!.input.baseDurationMinutes);
  });

  it('attaches to world state signals', () => {
    const s = state();
    attachIcelandAssessmentToState(s, buildIcelandAssessmentFromTripState(s, null));
    expect(s.signals.icelandSelfDriveCausalAssessment?.schema).toBe('tripnara/iceland-self-drive-causal/v1');
  });
});
