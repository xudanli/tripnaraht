import { projectOsProfileToHabitMemories } from './os-habit-projection.util';
import { buildTravelerHabitSummary } from './trip-override.util';

describe('projectOsProfileToHabitMemories', () => {
  it('projects Chinese habit cards from OS L0/L1', () => {
    const memories = projectOsProfileToHabitMemories({
      userId: 'u1',
      preferences: {
        dietaryRestrictions: ['不吃羊肉', '不吃三文鱼'],
        nationality: 'CN',
        hotelAvoid: ['临街房'],
      },
      travelProfile: {
        pacePreference: 'MODERATE',
        riskTolerance: 'MEDIUM',
        travelPhilosophy: 'SCENIC',
        preferredRouteTypes: ['NATURE', 'ROAD_TRIP'],
        extendedProfile: { maxDailyDrivingHours: 4 },
      },
    });
    const summary = buildTravelerHabitSummary('u1', memories);
    expect(summary.memoryCount).toBeGreaterThan(0);
    expect(summary.appliedSummary).toContain('不吃羊肉');
    expect(summary.appliedSummary).toContain('中国');
    expect(summary.cards.some((c) => c.domain === 'FOOD')).toBe(true);
    expect(summary.cards.some((c) => c.domain === 'PACE')).toBe(true);
  });
});
