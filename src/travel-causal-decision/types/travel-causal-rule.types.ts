/**
 * Loop 3 — Causal rule lifecycle (registered, versioned, reviewable).
 *
 * Rules must not live only in prompts / ad-hoc TS / docs / tribal knowledge.
 */

export const TRAVEL_CAUSAL_RULE_SCHEMA = 'tripnara.travel_causal_rule@v1' as const;

export type CausalRuleBasis =
  | 'PHYSICAL'
  | 'REGULATION'
  | 'OPERATOR_POLICY'
  | 'DOMAIN_EXPERT'
  | 'STATISTICAL'
  | 'USER_SPECIFIC';

export type CausalRuleReviewStatus =
  | 'DRAFT'
  | 'EXPERT_REVIEWED'
  | 'APPROVED'
  | 'DEPRECATED';

export interface CausalCondition {
  /** Stable predicate id, e.g. weather.gust_mps_gte */
  predicateId: string;
  /** Optional operator / threshold payload. */
  params?: Record<string, unknown>;
  /** Human-readable for audit surfaces. */
  label?: string;
}

export interface CausalRuleEffect {
  effectType: string;
  /** Target entity class (SEGMENT, ACTIVITY, DAY, TRAVELER, …). */
  affectedEntityType: string;
  /** Qualitative or structured predicted change. */
  predictedChange: Record<string, unknown>;
  explanationKey?: string;
}

export interface TravelCausalRule {
  schema: typeof TRAVEL_CAUSAL_RULE_SCHEMA;
  ruleId: string;
  version: string;

  cause: CausalCondition[];
  effects: CausalRuleEffect[];

  basis: CausalRuleBasis;
  evidenceRefs: string[];

  validFrom: string;
  validUntil?: string;

  reviewStatus: CausalRuleReviewStatus;
  confidence?: number;

  /** Optional destination pack scope (e.g. IS). */
  destinationPack?: string;
  /** Stable case tags for harness (strong-wind, road-closure, fatigue). */
  caseTags?: string[];
}
