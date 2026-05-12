import { evaluateMinimalRepairs } from './repair-evaluator';
import type { TripPlan } from '../plan-model';

describe('evaluateMinimalRepairs aurora night observation', () => {
  it('emits SKIP_OPTIONAL_POI for blocked aurora optional slots', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 3,
          date: '2026-01-12',
          timeSlots: [
            {
              id: 'aurora_rvk',
              time: '22:30',
              title: '雷克雅未克郊外极光',
              type: 'nature',
              semanticTags: ['aurora_night'],
              priorityTag: 'optional',
            },
          ],
        },
      ],
    };

    const result = evaluateMinimalRepairs({
      plan,
      timeDrifts: [],
      nightObservationFeasibility: {
        infeasibleAuroraSlotIds: ['aurora_rvk'],
        blockedObservationDates: ['2026-01-12'],
        notes: ['test'],
      },
    });

    const skip = result.repairs.find(r => r.action === 'SKIP_OPTIONAL_POI');
    expect(skip).toBeDefined();
    expect(skip?.targetSlotIds).toContain('aurora_rvk');
    expect(skip?.metadata?.domain).toBe('AURORA');
  });
});
