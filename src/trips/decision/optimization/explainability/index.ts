/**
 * 决策可解释性模块导出
 *
 * P3.1 优化：人类可读的决策解释
 */

export { DecisionExplainerService } from './decision-explainer.service';
export type {
  DecisionExplanation,
  KeyFactor,
  Tradeoff,
  ConstraintExplanation,
  AlternativeExplanation,
  RiskExplanation,
  RecommendationExplanation,
  ExplanationMetadata,
  ExplainerConfig,
} from './decision-explainer.service';
