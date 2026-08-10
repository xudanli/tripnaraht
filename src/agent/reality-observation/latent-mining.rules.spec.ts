/**
 * Latent mining rules 单测。
 */

import { mineLatentHypothesesFromSignals } from './latent-mining.rules';
import type { ObservationExecutionState } from './observation-executor';
import { canActivateLatentForConsumer } from './latent-activation.policy';

describe('latent-mining.rules', () => {
  it('从驾驶分钟与话术挖出多条候选，CONFIRM_REQUIRED 不自动进 Suggest', () => {
    const state = {
      plan: {} as any,
      observedFacts: [],
      derivedFacts: [
        { key: 'derived.day.scheduleDensity', value: 'HIGH', derivedFrom: [], method: 'x', observedAt: '', confidence: 1 },
        { key: 'derived.day.totalDrivingMinutes', value: 300, derivedFrom: [], method: 'x', observedAt: '', confidence: 1 },
        { key: 'derived.day.bufferMinutes', value: 10, derivedFrom: [], method: 'x', observedAt: '', confidence: 1 },
      ],
      unknowns: [],
      reflectRoundsUsed: 0,
      lastReflection: null,
    } as ObservationExecutionState;

    const hs = mineLatentHypothesesFromSignals({
      message: '太赶了，可以去掉一个景点吗',
      state,
    });
    const keys = hs.map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'trip.currentPaceMismatch',
        'user.maxDailyDrivingTolerance',
        'trip.dayBufferStress',
        'user.changeTolerance',
      ]),
    );
    const removal = hs.find((h) => h.key === 'user.changeTolerance')!;
    expect(removal.usagePolicy).toBe('CONFIRM_REQUIRED');
    expect(canActivateLatentForConsumer(removal, 'SUGGEST')).toBe(false);
  });
});
