import { compileIntent } from '../intent/intent.compiler';
import {
  reconcileIntentWithReality,
  toIntentReconciliationOverlay,
} from './intent-reality.mapper';

describe('reconcileIntentWithReality', () => {
  const plan = {
    version: '1',
    createdAt: 't',
    days: [
      {
        day: 1,
        date: '2026-06-01',
        timeSlots: [
          { id: 's1', time: '09:00', title: 'Drive', type: 'nature' as const },
        ],
      },
    ],
  };

  it('flags HIGH conflict when daily drive exceeds intent cap', () => {
    const compiled = compileIntent({
      explicitIntent: {
        mobilityPreference: 'LOW_DRIVE',
        pace: 'NORMAL',
        riskTolerance: 'MEDIUM',
        experienceBias: { nature: 1, driving: 1, city: 1 },
      },
    });
    const reality = {
      totalDriveHours: 20,
      dailyDriveHoursMax: 6,
    };
    const r = reconcileIntentWithReality(compiled, reality, plan);
    expect(r.conflicts.some((c) => c.type === 'DRIVE_EXCEEDED')).toBe(true);
    expect(r.alignedPlan.days[0]!.timeSlots[0]!.reasons?.length).toBeGreaterThan(
      0,
    );
  });

  it('builds semantic overlay with priorities', () => {
    const compiled = compileIntent({
      explicitIntent: {
        mobilityPreference: 'BALANCED',
        pace: 'NORMAL',
        riskTolerance: 'MEDIUM',
        experienceBias: { nature: 1, driving: 1, city: 1 },
      },
    });
    const r = reconcileIntentWithReality(
      compiled,
      { totalDriveHours: 4, dailyDriveHoursMax: 4 },
      plan,
    );
    const overlay = toIntentReconciliationOverlay(r, compiled.priorities);
    expect(overlay.priorities.length).toBeGreaterThan(0);
  });
});
