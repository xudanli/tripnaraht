import {
  applyTripFeedbackOverlayToDecisionParams,
  hydrateRecentTripFeedbacks,
  mapNumericFatigueToLevel,
  projectTripFeedbackSnapshots,
} from './trip-feedback-memory.util';
import { createDefaultDecisionParams } from '../interfaces/decision-params.interface';
import type { TripOutcomeFeedback } from '../interfaces/trip-outcome-feedback.interface';

describe('trip-feedback-memory.util', () => {
  const sampleFeedback: TripOutcomeFeedback = {
    tripId: 'trip-1',
    userId: 'u1',
    overallSuccess: true,
    fatigueLevel: 5,
    satisfaction: 2,
    abandoned: false,
    failurePoints: ['long_drive', 'rainy_day'],
    createdAt: new Date('2026-06-09T00:00:00.000Z'),
  };

  it('projectTripFeedbackSnapshots maps schema fields to snapshot contract', () => {
    const snaps = projectTripFeedbackSnapshots([sampleFeedback]);
    expect(snaps[0]).toMatchObject({
      tripId: 'trip-1',
      satisfactionScore: 2,
      fatigueLevel: 'HIGH',
      primaryTags: ['long_drive', 'rainy_day'],
      createdAt: '2026-06-09T00:00:00.000Z',
    });
  });

  it('applyTripFeedbackOverlayToDecisionParams tightens pace when high fatigue tail', () => {
    const params = createDefaultDecisionParams();
    params.constraints.maxDailyAscentM = 900;
    applyTripFeedbackOverlayToDecisionParams(params, [
      {
        tripId: 't1',
        satisfactionScore: 4,
        fatigueLevel: 'HIGH',
        overallSuccess: true,
        abandoned: false,
        createdAt: '2026-06-09T00:00:00.000Z',
        primaryTags: [],
      },
      {
        tripId: 't2',
        satisfactionScore: 3,
        fatigueLevel: 'HIGH',
        overallSuccess: true,
        abandoned: false,
        createdAt: '2026-06-08T00:00:00.000Z',
        primaryTags: [],
      },
    ]);
    expect(params.constraints.bufferTimeMin).toBeGreaterThanOrEqual(30);
    expect(params.constraints.maxDailyAscentM).toBeLessThanOrEqual(600);
    expect(params.repairPolicy.preferRestDay).toBe(true);
  });

  it('hydrateRecentTripFeedbacks coerces degraded JSON', () => {
    const hydrated = hydrateRecentTripFeedbacks([
      {
        tripId: 't1',
        satisfactionScore: '2',
        fatigueLevel: 'HIGH',
        createdAt: '2026-06-09T00:00:00.000Z',
        primaryTags: ['x'],
      },
    ]);
    expect(hydrated[0].satisfactionScore).toBe(2);
    expect(hydrated[0].fatigueLevel).toBe('HIGH');
  });

  it('mapNumericFatigueToLevel is deterministic', () => {
    expect(mapNumericFatigueToLevel(5)).toBe('HIGH');
    expect(mapNumericFatigueToLevel(3)).toBe('MEDIUM');
    expect(mapNumericFatigueToLevel(1)).toBe('LOW');
  });
});
