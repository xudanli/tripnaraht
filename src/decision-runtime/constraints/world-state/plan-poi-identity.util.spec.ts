import type { TripPlan } from '../../../trips/decision/plan-model';
import { auditPlanPoiIdentity, normalizePlanPoiIds } from './plan-poi-identity.util';

describe('plan-poi-identity.util', () => {
  const plan: TripPlan = {
    tripId: 't1',
    days: [
      {
        day: 1,
        date: '2026-07-05',
        timeSlots: [
          { id: 's1', time: '10:00', title: '蓝湖', type: 'activity', poiId: '蓝湖' },
          { id: 's2', time: '14:00', title: 'Visit', type: 'activity', poiId: 'is.reynisfjara' },
        ],
      },
    ],
  };

  it('auditPlanPoiIdentity resolves legacy label poiId', () => {
    const audit = auditPlanPoiIdentity(plan, 'IS');
    expect(audit.canonicalPoiIds).toContain('is.blue_lagoon');
    expect(audit.canonicalPoiIds).toContain('is.reynisfjara');
    expect(audit.allCanonical).toBe(true);
  });

  it('normalizePlanPoiIds rewrites slot poiId to canonical', () => {
    const normalized = normalizePlanPoiIds(plan, 'IS');
    expect(normalized.days[0]?.timeSlots[0]?.poiId).toBe('is.blue_lagoon');
  });
});
