/**
 * NL 行程创建：将 UserTravelProfile + 体能评估注入草案参数
 */

import type {
  DrivingFatiguePreferences,
  PacePreference,
  UserTravelProfile,
} from '../../../agent/memory/interfaces/user-travel-profile.interface';
import type { HumanCapabilityModel, FitnessLevel } from '../../decision/models/human-capability.model';
import { IntensityLevel, TravelStyle } from '../../dto/trip-draft.dto';

export type NlPreferencePace = 'relaxed' | 'moderate' | 'intensive';

export interface NlDraftPersonalization {
  preferencePace?: NlPreferencePace;
  draftPace?: 'relaxed' | 'normal' | 'dense';
  draftStyle?: TravelStyle | string;
  draftIntensity?: IntensityLevel;
  fitnessLevel?: FitnessLevel;
  hasFitnessAssessment: boolean;
  paceSource?: 'nl' | 'profile' | 'fitness';
  drivingFatiguePreferences?: DrivingFatiguePreferences;
}

function hasNlPaceAnswer(params: Record<string, any>): boolean {
  return Boolean(
    params.pace ||
      params.preferencePace ||
      params.preferences?.pace,
  );
}

export function mapProfilePaceToNl(profile?: PacePreference): NlPreferencePace | undefined {
  switch (profile) {
    case 'SLOW':
      return 'relaxed';
    case 'FAST':
      return 'intensive';
    case 'MODERATE':
      return 'moderate';
    default:
      return undefined;
  }
}

export function mapFitnessLevelToNlPace(level?: FitnessLevel): NlPreferencePace | undefined {
  switch (level) {
    case 'LOW':
    case 'MEDIUM_LOW':
      return 'relaxed';
    case 'MEDIUM':
      return 'moderate';
    case 'MEDIUM_HIGH':
    case 'HIGH':
      return 'intensive';
    default:
      return undefined;
  }
}

export function mapNlPaceToDraftPace(pace: NlPreferencePace): 'relaxed' | 'normal' | 'dense' {
  if (pace === 'relaxed') return 'relaxed';
  if (pace === 'intensive') return 'dense';
  return 'normal';
}

export function mapFitnessLevelToDraftIntensity(level?: FitnessLevel): IntensityLevel {
  switch (level) {
    case 'LOW':
    case 'MEDIUM_LOW':
      return IntensityLevel.RELAXED;
    case 'MEDIUM_HIGH':
    case 'HIGH':
      return IntensityLevel.INTENSE;
    default:
      return IntensityLevel.BALANCED;
  }
}

export function mapProfilePhilosophyToDraftStyle(
  profile?: UserTravelProfile | null,
): TravelStyle | string | undefined {
  switch (profile?.travelPhilosophy) {
    case 'SCENIC':
      return TravelStyle.NATURE;
    case 'ADVENTURE':
      return TravelStyle.ADVENTURE;
    case 'RELAXED':
      return TravelStyle.CULTURE;
    default:
      return undefined;
  }
}

export function resolveNlDraftPersonalization(
  params: Record<string, any>,
  ctx: {
    profile?: UserTravelProfile | null;
    fitnessModel?: HumanCapabilityModel | null;
  },
): NlDraftPersonalization {
  const hasFitnessAssessment = Boolean(ctx.fitnessModel);
  const fitnessLevel = ctx.fitnessModel?.fitnessLevel;
  const drivingFatiguePreferences = ctx.profile?.drivingFatiguePreferences;

  let preferencePace: NlPreferencePace | undefined;
  let paceSource: NlDraftPersonalization['paceSource'];

  if (hasNlPaceAnswer(params)) {
    const raw = params.pace || params.preferencePace || params.preferences?.pace;
    if (raw === 'relaxed' || raw === '2-3') preferencePace = 'relaxed';
    else if (raw === 'intensive' || raw === '5+' || raw === 'tight') preferencePace = 'intensive';
    else preferencePace = 'moderate';
    paceSource = 'nl';
  } else {
    preferencePace = mapProfilePaceToNl(ctx.profile?.pacePreference);
    if (preferencePace) {
      paceSource = 'profile';
    } else {
      preferencePace = mapFitnessLevelToNlPace(fitnessLevel);
      if (preferencePace) paceSource = 'fitness';
    }
  }

  const draftIntensity = params.preferences?.intensity
    ? (params.preferences.intensity as IntensityLevel)
    : mapFitnessLevelToDraftIntensity(fitnessLevel);

  const draftStyle =
    params.preferences?.style ||
    params.travelStyle ||
    mapProfilePhilosophyToDraftStyle(ctx.profile) ||
    'balanced';

  return {
    preferencePace,
    draftPace: preferencePace ? mapNlPaceToDraftPace(preferencePace) : undefined,
    draftStyle,
    draftIntensity,
    fitnessLevel,
    hasFitnessAssessment,
    paceSource,
    drivingFatiguePreferences,
  };
}

/**
 * 将个性化结果写回 NL params（不覆盖用户已明确给出的节奏/风格）。
 */
export function applyNlPersonalizationToParams(
  params: Record<string, any>,
  ctx: {
    profile?: UserTravelProfile | null;
    fitnessModel?: HumanCapabilityModel | null;
  },
): Record<string, any> {
  const personalization = resolveNlDraftPersonalization(params, ctx);
  const next: Record<string, any> = { ...params, _nlPersonalization: personalization };

  if (!hasNlPaceAnswer(params) && personalization.preferencePace) {
    next.preferencePace = personalization.preferencePace;
    next._nlPaceSource = personalization.paceSource;
  } else if (hasNlPaceAnswer(params)) {
    next._nlPaceSource = 'nl';
  }

  next._fitnessAssessmentMissing = !personalization.hasFitnessAssessment;

  if (!next.preferences || typeof next.preferences !== 'object') {
    next.preferences = {};
  } else {
    next.preferences = { ...next.preferences };
  }

  if (!next.preferences.intensity && personalization.draftIntensity) {
    next.preferences.intensity = personalization.draftIntensity;
  }
  if (!next.preferences.style && personalization.draftStyle) {
    next.preferences.style = personalization.draftStyle;
  }
  if (!next.preferences.pace && personalization.preferencePace) {
    next.preferences.pace = personalization.preferencePace;
  }

  if (personalization.drivingFatiguePreferences) {
    next.drivingFatiguePreferences = personalization.drivingFatiguePreferences;
  }

  return next;
}
