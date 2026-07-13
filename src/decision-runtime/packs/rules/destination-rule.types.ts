/**
 * RFC-002 Phase 2 — declarative destination pack rules.
 */

import type { DecisionSemanticKey } from '../../gateway/contracts/decision-gateway.types';

export type RuleConditionOperator = 'EQ' | 'NEQ' | 'GTE' | 'LTE' | 'IN';

export interface DestinationRuleCondition {
  field: string;
  operator: RuleConditionOperator;
  value?: string | number | boolean;
  values?: string[];
}

export interface DestinationRuleResult {
  verdict: 'BLOCK' | 'WARNING' | 'PASS' | 'UNKNOWN';
  reasonCode: string;
  overridable: boolean;
  constraintCode?: string;
}

export interface DestinationPackRule {
  ruleId: string;
  /** TEP P0 — stable Self-Drive rule id (e.g. SDR-001) */
  sdrRuleId?: string;
  semanticKey: DecisionSemanticKey;
  appliesWhen?: {
    country?: string;
    activityType?: string;
  };
  conditions: DestinationRuleCondition[];
  result: DestinationRuleResult;
  /** When true, BLOCK/WARNING only applies if candidate still uses affected route */
  whenCandidateUsesRoute?: boolean;
}

export interface DestinationRuleBundle {
  schemaId: string;
  rules: DestinationPackRule[];
}

export interface RuleEvaluationFacts {
  country?: string;
  facts: Record<string, unknown>;
  candidateUsesRoute: boolean;
}

export interface MatchedPackRule {
  rule: DestinationPackRule;
  bundlePath: string;
}
