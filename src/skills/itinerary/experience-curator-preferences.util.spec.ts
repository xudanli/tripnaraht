import { buildExperiencePreferences, resolvePacingStrategy } from './experience-curator-preferences.util';

describe('experience-curator-preferences.util', () => {
  it('maps deep_privacy to slow_burn and scenic drive weight', () => {
    const prefs = buildExperiencePreferences({
      personaSnapshot: {
        travelStyle: 'deep_privacy',
        energyModel: { currentFatigueLevel: 40, maxDailyPoiCount: 3, bufferRatio: 1.4 },
        socialBoundary: 'absolute_privacy',
      },
      userIntent: '车里需要安静，老人怕尴尬',
    });
    expect(prefs.pacingStrategy).toBe('slow_burn');
    expect(prefs.scenicDriveWeight).toBeGreaterThanOrEqual(0.7);
    expect(prefs.sensoryAlternation).toBe(true);
  });

  it('detects cinematic climax from user intent', () => {
    expect(resolvePacingStrategy('adventure', '想要电影感高潮')).toBe('cinematic_climax');
  });

  it('maps 轻松/太累 to slow_burn', () => {
    expect(resolvePacingStrategy('adventure', '明天太累了，轻松一点')).toBe('slow_burn');
    expect(resolvePacingStrategy('adventure', 'want to relax')).toBe('slow_burn');
  });
});
