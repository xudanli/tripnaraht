/**
 * Persona → 约束规划权重映射（Stage 1 子模块）
 */

import type {
  OdysseyPersonaSnapshot,
  OdysseyTravelStyle,
  PersonaConstraintWeights,
  SocialBoundary,
} from './adaptive-replan.types';

const TRAVEL_STYLE_DEFAULTS: Record<
  OdysseyTravelStyle,
  Omit<PersonaConstraintWeights, 'structuralThinning' | 'trafficFactorMultiplier'>
> = {
  deep_privacy: {
    bufferRatio: 1.4,
    maxDailyPoiCount: 3,
    earliestStartLocal: '09:00',
    insertRestBlock: true,
    restBlockWindow: { start: '15:00', end: '16:00' },
    preferLowCrowd: true,
    weatherTolerance: 'low',
  },
  efficiency_first: {
    bufferRatio: 1.1,
    maxDailyPoiCount: 4,
    earliestStartLocal: '08:00',
    insertRestBlock: false,
    preferLowCrowd: false,
    weatherTolerance: 'medium',
  },
  leisure_chill: {
    bufferRatio: 1.35,
    maxDailyPoiCount: 3,
    earliestStartLocal: '09:30',
    insertRestBlock: true,
    restBlockWindow: { start: '15:00', end: '16:00' },
    preferLowCrowd: true,
    weatherTolerance: 'low',
  },
  adventure: {
    bufferRatio: 1.05,
    maxDailyPoiCount: 5,
    earliestStartLocal: '07:30',
    insertRestBlock: false,
    preferLowCrowd: false,
    weatherTolerance: 'high',
  },
};

function socialBoundaryCrowdPreference(boundary: SocialBoundary): boolean {
  return boundary === 'absolute_privacy' || boundary === 'standard';
}

export function buildPersonaConstraintWeights(
  persona: OdysseyPersonaSnapshot,
): PersonaConstraintWeights {
  const base = { ...TRAVEL_STYLE_DEFAULTS[persona.travelStyle] };
  const fatigue = persona.energyModel.currentFatigueLevel;

  const bufferRatio = Math.max(
    base.bufferRatio,
    persona.energyModel.bufferRatio,
    fatigue > 70 ? 1.5 : fatigue > 50 ? 1.25 : base.bufferRatio,
  );

  const maxDailyPoiCount = Math.min(
    base.maxDailyPoiCount,
    persona.energyModel.maxDailyPoiCount,
    fatigue > 80 ? 2 : fatigue > 70 ? 3 : base.maxDailyPoiCount,
  );

  const structuralThinning = fatigue > 70;
  const trafficFactorMultiplier = fatigue > 80 ? 1.15 : 1.0;

  return {
    ...base,
    bufferRatio,
    maxDailyPoiCount,
    preferLowCrowd: base.preferLowCrowd || socialBoundaryCrowdPreference(persona.socialBoundary),
    structuralThinning,
    trafficFactorMultiplier,
    earliestStartLocal:
      fatigue > 80 ? '10:00' : fatigue > 70 ? '09:30' : base.earliestStartLocal,
    insertRestBlock: base.insertRestBlock || fatigue > 60,
  };
}

export type OdysseyPersonaSnapshotOverrides = Partial<
  Omit<OdysseyPersonaSnapshot, 'energyModel'>
> & {
  energyModel?: Partial<OdysseyPersonaSnapshot['energyModel']>;
};

/** 从用户意图与可选覆盖推导默认 personaSnapshot */
export function resolvePersonaSnapshotFromOdysseyBranch(
  _branch: undefined,
  overrides?: OdysseyPersonaSnapshotOverrides,
): OdysseyPersonaSnapshot {
  const travelStyle = overrides?.travelStyle ?? 'leisure_chill';
  const styleDefaults = TRAVEL_STYLE_DEFAULTS[travelStyle];

  const defaultEnergy = {
    currentFatigueLevel: 40,
    maxDailyPoiCount: styleDefaults.maxDailyPoiCount,
    bufferRatio: styleDefaults.bufferRatio,
  };

  return {
    travelStyle,
    energyModel: { ...defaultEnergy, ...overrides?.energyModel },
    socialBoundary:
      overrides?.socialBoundary ??
      (travelStyle === 'deep_privacy' ? 'absolute_privacy' : 'standard'),
  };
}
