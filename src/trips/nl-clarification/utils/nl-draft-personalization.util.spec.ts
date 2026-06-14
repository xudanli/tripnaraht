import {
  applyNlPersonalizationToParams,
  mapFitnessLevelToNlPace,
  mapProfilePaceToNl,
} from './nl-draft-personalization.util';
import { IntensityLevel } from '../../dto/trip-draft.dto';

describe('nl-draft-personalization.util', () => {
  it('maps profile and fitness pace without overriding NL answers', () => {
    expect(mapProfilePaceToNl('SLOW')).toBe('relaxed');
    expect(mapFitnessLevelToNlPace('HIGH')).toBe('intensive');

    const fromProfile = applyNlPersonalizationToParams(
      { destination: 'IS' },
      {
        profile: { userId: 'u1', pacePreference: 'SLOW', confidence: 0.8 },
        fitnessModel: null,
      },
    );
    expect(fromProfile.preferencePace).toBe('relaxed');
    expect(fromProfile._nlPaceSource).toBe('profile');
    expect(fromProfile._fitnessAssessmentMissing).toBe(true);

    const fromNl = applyNlPersonalizationToParams(
      { preferencePace: 'intensive' },
      {
        profile: { userId: 'u1', pacePreference: 'SLOW', confidence: 0.8 },
        fitnessModel: { userId: 'u1', fitnessLevel: 'LOW' } as any,
      },
    );
    expect(fromNl.preferencePace).toBe('intensive');
    expect(fromNl._nlPaceSource).toBe('nl');
  });

  it('injects fitness-based intensity when preferences are empty', () => {
    const result = applyNlPersonalizationToParams(
      {},
      {
        profile: null,
        fitnessModel: { userId: 'u1', fitnessLevel: 'LOW' } as any,
      },
    );
    expect(result.preferences.intensity).toBe(IntensityLevel.RELAXED);
    expect(result.preferencePace).toBe('relaxed');
    expect(result._fitnessAssessmentMissing).toBe(false);
  });
});
