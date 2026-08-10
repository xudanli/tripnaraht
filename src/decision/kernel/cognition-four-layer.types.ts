/**
 * 对外四层认知投影（验收清单形状）。
 * 由 DecisionCognitionSlice 投影，不替代内核契约。
 */

export const COGNITION_FOUR_LAYER_SCHEMA = 'tripnara/cognition_four_layer@v1' as const;

/** 约束分层：不能走 / 必须确认 / 建议替换 / 优化 / 观察 */
export type ConstraintLayer =
  | 'BLOCK'
  | 'MUST_CONFIRM'
  | 'SUGGEST_REPLACE'
  | 'OPTIMIZE'
  | 'WATCH';

export type CognitionFourLayerReality = {
  knownFacts: string[];
  missingContext: string[];
  conflicts: string[];
  freshness: string[];
  currentState: string;
};

export type CognitionFourLayerRelationships = {
  causalLinks: string[];
  dependencyLinks: string[];
  affectedEntities: string[];
  propagation: string[];
};

export type CognitionFourLayerFocus = {
  primaryProblem: string;
  priority: string;
  decisionRequired: boolean;
  reason: string;
  actionDeadline: string | null;
  constraintLayer: ConstraintLayer | '';
};

export type CognitionFourLayerSimulation = {
  scenarios: string[];
  recommendedScenario: string;
  tradeoffs: string[];
  residualRisks: string[];
  requiresConfirmation: boolean;
};

export type CognitionFourLayerView = {
  schema: typeof COGNITION_FOUR_LAYER_SCHEMA;
  reality: CognitionFourLayerReality;
  relationships: CognitionFourLayerRelationships;
  focus: CognitionFourLayerFocus;
  simulation: CognitionFourLayerSimulation;
};
