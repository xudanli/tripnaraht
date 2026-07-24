import type { DailyDrivePlan } from '../contracts/tep-self-drive.types';
import { projectDayScheduleTimeline } from './day-schedule-timeline.util';

const sampleDay: DailyDrivePlan = {
  date: '2026-01-15',
  dayIndex: 1,
  origin: { ref: 'anchor_a', label: 'A' },
  destination: { ref: 'anchor_b', label: 'B' },
  legs: [
    {
      legId: 'drive_leg_1_1',
      fromRef: 'item_a',
      toRef: 'item_b',
      baseNavigationMinutes: 600,
      roadRefs: ['segment:ring'],
      importance: 'MANDATORY',
      flexibility: 'FIXED',
    },
  ],
  activities: [
    {
      ref: 'activity_outdoor',
      importance: 'RECOMMENDED',
      flexibility: 'REMOVABLE',
      weatherSensitive: true,
      reservationRequired: false,
      durationMinutes: 120,
      bufferMinutes: 15,
      fixedStartAt: '2026-01-15T14:00:00.000Z',
    },
  ],
  buffers: [],
};

describe('day-schedule-timeline.util', () => {
  it('projects leg finish and activity end from 08:00 baseline', () => {
    const timeline = projectDayScheduleTimeline(sampleDay);
    expect(timeline.lastLegFinishMinutesLocal).toBe(8 * 60 + 600);
    const outdoor = timeline.activities.find((a) => a.ref === 'activity_outdoor');
    expect(outdoor?.startMinutesLocal).toBe(14 * 60);
    expect(outdoor?.endMinutesLocal).toBe(14 * 60 + 120 + 15);
  });
});
