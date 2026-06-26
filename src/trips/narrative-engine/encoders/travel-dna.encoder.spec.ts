import {
  encodeTravelStoryform,
  mergeCompiledIntent,
  resolvePrimaryArcTemplate,
  storyformFromThemeMetadata,
} from './travel-dna.encoder';
import { compileIntent } from '../../intent/intent.compiler';

describe('travel-dna.encoder', () => {
  it('maps motivations to primary arc template', () => {
    expect(resolvePrimaryArcTemplate(['rest'])).toBe('healing');
    expect(resolvePrimaryArcTemplate(['discovery'])).toBe('exploration');
    expect(resolvePrimaryArcTemplate(['connection'])).toBe('connection');
    expect(resolvePrimaryArcTemplate(['unsure'])).toBe('neutral');
  });

  it('encodes intake into four-perspective storyform', () => {
    const form = encodeTravelStoryform({
      intake: {
        recentState: '需要暂停',
        motivations: ['discovery', 'rest'],
        moodKeywords: ['风'],
      },
      trip: { destination: 'Iceland', tripDays: 7 },
    });

    expect(form.schemaVersion).toBe(1);
    expect(form.objective.destination).toBe('Iceland');
    expect(form.catalyst.motivations).toEqual(['discovery', 'rest']);
    expect(form.narrativePreferences.moodKeywords).toEqual(['风']);
    expect(form.narrativePreferences.reflectionMode).toBe('resonance');
  });

  it('merges compiled intent into objective layer', () => {
    const base = encodeTravelStoryform({ intake: { motivations: ['discovery'] } });
    const compiled = compileIntent({
      explicitIntent: {
        mobilityPreference: 'LOW_DRIVE',
        pace: 'RELAXED',
        riskTolerance: 'LOW',
        experienceBias: { nature: 2, driving: 0, city: 0 },
      },
    });
    const merged = mergeCompiledIntent(base, compiled);
    expect(merged.objective.compiledIntent?.priorities).toContain('minimize_daily_drive');
  });

  it('rehydrates storyform from persisted theme metadata', () => {
    const form = storyformFromThemeMetadata(
      {
        schemaVersion: 1,
        selectedThemeId: 't1',
        title: '《测试》',
        tagline: '副标题',
        arcTemplate: 'exploration',
        reflectionMode: 'resonance',
        selectedAt: '2026-06-16T00:00:00.000Z',
        regenerateCount: 0,
        intakeSnapshot: { motivations: ['discovery'] },
      },
      { destination: 'Japan', tripDays: 5 },
    );
    expect(form.selectedTheme?.title).toBe('《测试》');
    expect(form.objective.tripDays).toBe(5);
  });
});
