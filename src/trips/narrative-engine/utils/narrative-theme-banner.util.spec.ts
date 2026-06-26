import {
  buildNarrativeThemeBanner,
  isNarrativeThemeBannerEnabled,
  readTripNarrativeThemeMetadata,
} from '../utils/narrative-theme-banner.util';
import { inferNarrativeIntakeFromText } from '../utils/narrative-intake-inference.util';

describe('narrative-theme-banner.util', () => {
  it('builds banner from trip metadata', () => {
    const banner = buildNarrativeThemeBanner({
      narrativeTheme: {
        schemaVersion: 1,
        selectedThemeId: 't1',
        title: '《在风里重新认识自己》',
        tagline: '把不确定留在大风里',
        arcTemplate: 'exploration',
        reflectionMode: 'resonance',
        selectedAt: '2026-06-16T10:00:00.000Z',
        regenerateCount: 0,
      },
    });
    expect(banner?.visible).toBe(true);
    expect(banner?.arcLabel).toBe('探索');
  });

  it('returns null when no theme', () => {
    expect(buildNarrativeThemeBanner({})).toBeNull();
  });
});

describe('narrative-intake-inference.util', () => {
  it('infers discovery motivation from user text', () => {
    const intake = inferNarrativeIntakeFromText('想去冰岛探索未知，需要放松');
    expect(intake.motivations).toContain('discovery');
    expect(intake.motivations).toContain('rest');
  });

  it('falls back to unsure for empty input', () => {
    expect(inferNarrativeIntakeFromText('').motivations).toEqual(['unsure']);
  });
});

describe('banner feature flag', () => {
  const prev = process.env.NARRATIVE_THEME_V1;
  afterEach(() => {
    if (prev === undefined) delete process.env.NARRATIVE_THEME_V1;
    else process.env.NARRATIVE_THEME_V1 = prev;
  });

  it('respects NARRATIVE_THEME_V1', () => {
    process.env.NARRATIVE_THEME_V1 = 'true';
    expect(isNarrativeThemeBannerEnabled()).toBe(true);
  });
});
