/**
 * 从奥德赛人格 / 用户意图解构 ExperiencePreferences
 */

import type { OdysseyPersonaSnapshot } from './adaptive-replan.types';
import type { ExperiencePreferences, PacingStrategy } from './experience-curator.types';
export function resolvePacingStrategy(
  travelStyle?: OdysseyPersonaSnapshot['travelStyle'],
  userIntent?: string,
): PacingStrategy {
  const t = String(userIntent ?? '');
  if (/电影|高潮|震撼|climax/i.test(t)) return 'cinematic_climax';
  if (/太累|好累|疲惫|轻松|别早起|不要太赶|慢节奏|放缓|休息|relax|tired|exhausted/i.test(t)) {
    return 'slow_burn';
  }
  if (/慢燃|慢慢|slow/i.test(t)) return 'slow_burn';
  if (travelStyle === 'adventure') return 'cinematic_climax';
  if (travelStyle === 'deep_privacy' || travelStyle === 'leisure_chill') return 'slow_burn';
  return 'harmonic_flow';
}

export function buildExperiencePreferences(params: {
  personaSnapshot?: OdysseyPersonaSnapshot;
  userIntent?: string;
  overrides?: Partial<ExperiencePreferences>;
}): ExperiencePreferences {
  const travelStyle = params.personaSnapshot?.travelStyle ?? 'leisure_chill';

  const intent = String(params.userIntent ?? '');
  const privacyHeavy =
    travelStyle === 'deep_privacy' ||
    params.personaSnapshot?.socialBoundary === 'absolute_privacy' ||
    /安静|隐私|边界|私密|老人/i.test(intent);

  const defaults: ExperiencePreferences = {
    scenicDriveWeight: travelStyle === 'adventure' ? 0.85 : privacyHeavy ? 0.75 : 0.55,
    sensoryAlternation: true,
    goldenHourAlignment: {
      sunset: !/下雨|暴雨|室内为主/i.test(intent),
      sunrise: travelStyle === 'adventure',
      auroraOrMilkyWay: /冰岛|iceland|极光|aurora|6月|六月/i.test(intent),
    },
    pacingStrategy: resolvePacingStrategy(travelStyle, intent),
  };

  return {
    ...defaults,
    ...params.overrides,
    goldenHourAlignment: {
      ...defaults.goldenHourAlignment,
      ...params.overrides?.goldenHourAlignment,
    },
  };
}
