import type {
  TravelPersona,
  TravelPersonaConstraintSensitivity,
  TravelPersonaEngineWeights,
  TravelPersonaTraits,
  TravelPersonaType,
} from './travel-persona.types';

/** 文档基线：人格 → 引擎权重（总和可为 1） */
export const BASE_ENGINE_WEIGHTS: Record<
  TravelPersonaType,
  TravelPersonaEngineWeights
> = {
  EXPLORER: { llm: 0.7, algo: 0.2, solver: 0.1 },
  RELAXER: { llm: 0.55, algo: 0.35, solver: 0.1 },
  EFFICIENCY_HUNTER: { llm: 0.2, algo: 0.7, solver: 0.1 },
  FOODIE: { llm: 0.8, algo: 0.1, solver: 0.1 },
  CULTURE_DEEP_DIVER: { llm: 0.65, algo: 0.25, solver: 0.1 },
  FREE_SPIRIT: { llm: 0.6, algo: 0.25, solver: 0.15 },
};

export const BASE_TRAITS: Record<TravelPersonaType, TravelPersonaTraits> = {
  EXPLORER: { pace: 0.72, structure: 0.45, spontaneity: 0.55, walkingTolerance: 0.65, experienceBias: 0.75 },
  RELAXER: { pace: 0.35, structure: 0.5, spontaneity: 0.45, walkingTolerance: 0.45, experienceBias: 0.6 },
  EFFICIENCY_HUNTER: { pace: 0.78, structure: 0.85, spontaneity: 0.25, walkingTolerance: 0.7, experienceBias: 0.35 },
  FOODIE: { pace: 0.55, structure: 0.45, spontaneity: 0.5, walkingTolerance: 0.55, experienceBias: 0.85 },
  CULTURE_DEEP_DIVER: { pace: 0.58, structure: 0.65, spontaneity: 0.35, walkingTolerance: 0.55, experienceBias: 0.9 },
  FREE_SPIRIT: { pace: 0.48, structure: 0.35, spontaneity: 0.82, walkingTolerance: 0.5, experienceBias: 0.7 },
};

export const BASE_CONSTRAINT_SENSITIVITY: Record<
  TravelPersonaType,
  TravelPersonaConstraintSensitivity
> = {
  EXPLORER: { distance: 0.45, fatigue: 0.5, cost: 0.45, timing: 0.4 },
  RELAXER: { distance: 0.65, fatigue: 0.85, cost: 0.55, timing: 0.5 },
  EFFICIENCY_HUNTER: { distance: 0.85, fatigue: 0.55, cost: 0.75, timing: 0.9 },
  FOODIE: { distance: 0.4, fatigue: 0.45, cost: 0.7, timing: 0.45 },
  CULTURE_DEEP_DIVER: { distance: 0.5, fatigue: 0.65, cost: 0.45, timing: 0.55 },
  FREE_SPIRIT: { distance: 0.35, fatigue: 0.4, cost: 0.4, timing: 0.35 },
};

export function buildTravelPersona(personaId: string, type: TravelPersonaType): TravelPersona {
  return {
    personaId,
    type,
    traits: { ...BASE_TRAITS[type] },
    engineWeights: { ...BASE_ENGINE_WEIGHTS[type] },
    constraintSensitivity: { ...BASE_CONSTRAINT_SENSITIVITY[type] },
  };
}
