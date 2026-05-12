/**
 * 旅行人格：由显式 NL + 行为记忆 + 长期画像推断，驱动 Policy Engine。
 */

export type TravelPersonaType =
  | 'EXPLORER'
  | 'RELAXER'
  | 'EFFICIENCY_HUNTER'
  | 'FOODIE'
  | 'CULTURE_DEEP_DIVER'
  | 'FREE_SPIRIT';

export interface TravelPersonaTraits {
  /** 行程密度 */
  pace: number;
  /** 计划严谨度 */
  structure: number;
  /** 随机性 / 留白 */
  spontaneity: number;
  /** 步行承受 */
  walkingTolerance: number;
  /** 体验叙事 vs 路径效率 */
  experienceBias: number;
}

export interface TravelPersonaEngineWeights {
  llm: number;
  algo: number;
  solver: number;
}

export interface TravelPersonaConstraintSensitivity {
  distance: number;
  fatigue: number;
  cost: number;
  timing: number;
}

export interface TravelPersona {
  personaId: string;
  type: TravelPersonaType;
  traits: TravelPersonaTraits;
  engineWeights: TravelPersonaEngineWeights;
  constraintSensitivity: TravelPersonaConstraintSensitivity;
}
