/**
 * Slice 3 E4 — execution slip assessor unit tests.
 */

import {
  assessExecutionScheduleFeasibility,
  computeSlipMinutes,
} from './execution-slip-assessor.util';

describe('execution-slip-assessor', () => {
  const baseInput = {
    observation: {
      activityId: 'item_a',
      plannedDepartAt: '2026-07-12T13:00:00.000Z',
      observedAt: '2026-07-12T13:35:00.000Z',
      stillAtPoi: true,
    },
    currentActivity: {
      activityId: 'item_a',
      plannedDepartAt: '2026-07-12T13:00:00.000Z',
      travelDurationMinutes: 0,
      remainingStayMinutes: 60,
      dayIndex: 0,
    },
    nextActivity: {
      activityId: 'item_b',
      plannedDepartAt: '2026-07-12T16:00:00.000Z',
      travelDurationMinutes: 103,
      remainingStayMinutes: 0,
      dayIndex: 0,
    },
    travelDurationMinutes: 103,
    nextWindow: {
      poiId: 'poi_b',
      activityId: 'item_b',
      lastEntryAt: '16:00',
      closesAt: '18:00',
      timezone: 'Atlantic/Reykjavik',
      sourceProvider: 'plan_activity_metadata',
      confidence: 0.95,
    },
  };

  it('computes 35 minute slip', () => {
    expect(
      computeSlipMinutes(
        '2026-07-12T13:00:00.000Z',
        '2026-07-12T13:35:00.000Z',
      ),
    ).toBe(35);
  });

  it('10 minute delay still feasible → ALLOW', () => {
    const result = assessExecutionScheduleFeasibility({
      ...baseInput,
      observation: {
        ...baseInput.observation,
        observedAt: '2026-07-12T13:10:00.000Z',
      },
      currentActivity: {
        ...baseInput.currentActivity,
        remainingStayMinutes: 30,
      },
    });
    expect(result.result).toBe('STILL_FEASIBLE');
    expect(result.gate).toBe('ALLOW');
    expect(result.infeasible).toBe(false);
  });

  it('35 minute delay misses lastEntryAt → WINDOW_MISSED', () => {
    const result = assessExecutionScheduleFeasibility(baseInput);
    expect(result.result).toBe('WINDOW_MISSED');
    expect(result.gate).toBe('SUGGEST_REPLACE');
    expect(result.infeasible).toBe(true);
    expect(result.projectedEta).toContain('2026-07-12');
  });

  it('returns UNKNOWN when no lastEntryAt', () => {
    const result = assessExecutionScheduleFeasibility({
      ...baseInput,
      nextWindow: null,
    });
    expect(result.result).toBe('UNKNOWN');
    expect(result.infeasible).toBe(false);
  });
});
