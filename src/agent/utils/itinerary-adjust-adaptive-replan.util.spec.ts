import {
  buildAdaptiveReplanTargetDays,
  detectAdaptiveReplanTrigger,
  resolveAdaptiveReplanFatigueLevel,
  shouldRequestAdaptiveReplan,
} from './itinerary-adjust-adaptive-replan.util';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

describe('itinerary-adjust-adaptive-replan.util', () => {
  it('detects pacing and weather triggers', () => {
    expect(detectAdaptiveReplanTrigger('明天太累了，轻松一点')).toBe('pacing');
    expect(detectAdaptiveReplanTrigger('明天大雨，调整上午安排')).toBe('weather');
    expect(detectAdaptiveReplanTrigger('重新规划第二天行程')).toBe('strong_modification');
  });

  it('requests adaptive replan for ITINERARY_ADJUST', () => {
    expect(
      shouldRequestAdaptiveReplan({
        routePrimary: 'ITINERARY_ADJUST',
      }),
    ).toBe(true);
    expect(
      shouldRequestAdaptiveReplan({
        itineraryAdjustIntake: true,
      }),
    ).toBe(true);
    expect(shouldRequestAdaptiveReplan({ routePrimary: 'GENERAL_PLAN' })).toBe(false);
  });

  it('maps fatigue phrases to levels', () => {
    expect(resolveAdaptiveReplanFatigueLevel('今天太累了')).toBe(85);
    expect(resolveAdaptiveReplanFatigueLevel('有点累')).toBe(70);
    expect(resolveAdaptiveReplanFatigueLevel('重新规划第二天')).toBeUndefined();
  });

  it('buildAdaptiveReplanTargetDays resolves from neighbor anchors', () => {
    const state = {
      metadata: {
        itinerary_adjust_intake: true,
        itinerary_adjust_target_date_iso: '2026-06-02',
        itinerary_adjust_neighbor_anchors: { targetDayNumber: 2, targetDateIso: '2026-06-02' },
      },
      itinerary: {
        days: [
          { date: '2026-06-01', items: [] },
          { date: '2026-06-02', items: [] },
        ],
      },
    } as unknown as OrchestratorState;
    expect(buildAdaptiveReplanTargetDays(state)).toEqual([2]);
  });
});
