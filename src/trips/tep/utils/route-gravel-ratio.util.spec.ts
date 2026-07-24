import type { DailyDrivePlan } from '../contracts/tep-self-drive.types';
import {
  computeGravelRatio,
  summarizeDayLegRoadProfiles,
} from './route-gravel-ratio.util';

const day: DailyDrivePlan = {
  date: '2026-08-05',
  dayIndex: 1,
  origin: { ref: 'a', label: 'A' },
  destination: { ref: 'b', label: 'B' },
  legs: [
    {
      legId: 'leg_1',
      fromRef: 'x',
      toRef: 'y',
      baseNavigationMinutes: 60,
      roadRefs: ['segment:test:RING_ROAD'],
      importance: 'MANDATORY',
      flexibility: 'FIXED',
    },
    {
      legId: 'leg_2',
      fromRef: 'y',
      toRef: 'z',
      baseNavigationMinutes: 40,
      roadRefs: ['segment:test:F26'],
      importance: 'RECOMMENDED',
      flexibility: 'REMOVABLE',
    },
  ],
  activities: [],
  buffers: [],
};

describe('route-gravel-ratio.util', () => {
  it('computes gravel ratio from leg profiles', () => {
    const summaries = summarizeDayLegRoadProfiles(day, 'IS');
    expect(summaries).toHaveLength(2);
    expect(summaries[1]?.isGravel).toBe(true);
    expect(computeGravelRatio(summaries)).toBeCloseTo(0.4, 2);
  });
});
