/**
 * Consolidated runtime mode resolution for ops / staging matrices.
 */

import {
  isCanonicalExecutionEnabled,
  isCanonicalFullPlanSelectionEnabled,
  isConstraintEvaluationGatewayEnabled,
  isConstraintGatewayOnForSelectedMode,
  isConstraintGatewayShadowCompareMode,
  isDecisionLabEnabled,
  isGuideCanonicalAcceptExecuteEnabled,
  isGuideCanonicalPlanSelectionEnabled,
  resolveConstraintGatewayMode,
  resolveDecisionRuntimeMode,
  resolveOptimizationStrategyMode,
  type ConstraintGatewayMode,
  type DecisionRuntimeMode,
  type OptimizationStrategyMode,
} from '../constraints/constraint-evaluation.config';
import { parseConstraintGatewayOnScenarios } from '../constraints/constraint-on-selected.util';
import { isEffectivePlanWriteGuardEnabled } from './effective-plan-write-guard.config';
import { isEffectivePlanWriteChainEnabled } from './effective-plan-write-chain.config';
import { isPhase6LegacyDeprecationEnabled } from '../phase6-legacy-deprecation.config';
import {
  isConstraintGatewayPlanVerifyProjectionEnabled,
  isPhase6GatewayDomainRulesExclusive,
} from '../constraints/constraint-plan-verify.config';
import { isDecisionTriggerGatewayEnabled } from '../trigger/decision-trigger.config';
import { isAuthorizationPolicyGatewayEnabled } from '../authorization/authorization-policy.config';
import { isReplanningTriggerPolicyEnabled } from '../trigger/replanning-trigger.config';
import {
  evaluateLegacyConvergence,
  type LegacyConvergenceEvaluation,
} from '../p4-phase/legacy-convergence.evaluator';

export interface DecisionRuntimeCapabilities {
  mode: DecisionRuntimeMode;
  constraintGateway: boolean;
  constraintGatewayMode: ConstraintGatewayMode;
  constraintGatewayShadowCompare: boolean;
  constraintGatewayOnForSelected: boolean;
  constraintGatewayOnScenarios: string[];
  fullPlanSelection: boolean;
  guideCanonicalSelection: boolean;
  guideCanonicalAcceptExecute: boolean;
  canonicalExecute: boolean;
  effectivePlanWriteGuard: boolean;
  effectivePlanWriteChain: boolean;
  phase6LegacyDeprecation: boolean;
  constraintPlanVerifyProjection: boolean;
  gatewayDomainRulesExclusive: boolean;
  optimizationStrategyMode: OptimizationStrategyMode;
  decisionLab: boolean;
  decisionTriggerGateway: boolean;
  authorizationPolicyGateway: boolean;
  replanningTriggerPolicy: boolean;
  legacyConvergence: LegacyConvergenceEvaluation;
}

export type DecisionRuntimeCapabilitiesInput = Omit<
  DecisionRuntimeCapabilities,
  'legacyConvergence'
>;

export function resolveDecisionRuntimeCapabilities(): DecisionRuntimeCapabilities {
  const base: DecisionRuntimeCapabilitiesInput = {
    mode: resolveDecisionRuntimeMode(),
    constraintGateway: isConstraintEvaluationGatewayEnabled(),
    constraintGatewayMode: resolveConstraintGatewayMode(),
    constraintGatewayShadowCompare: isConstraintGatewayShadowCompareMode(),
    constraintGatewayOnForSelected: isConstraintGatewayOnForSelectedMode(),
    constraintGatewayOnScenarios: parseConstraintGatewayOnScenarios(),
    fullPlanSelection: isCanonicalFullPlanSelectionEnabled(),
    guideCanonicalSelection: isGuideCanonicalPlanSelectionEnabled(),
    guideCanonicalAcceptExecute: isGuideCanonicalAcceptExecuteEnabled(),
    canonicalExecute: isCanonicalExecutionEnabled(),
    effectivePlanWriteGuard: isEffectivePlanWriteGuardEnabled(),
    effectivePlanWriteChain: isEffectivePlanWriteChainEnabled(),
    phase6LegacyDeprecation: isPhase6LegacyDeprecationEnabled(),
    constraintPlanVerifyProjection: isConstraintGatewayPlanVerifyProjectionEnabled(),
    gatewayDomainRulesExclusive: isPhase6GatewayDomainRulesExclusive(),
    optimizationStrategyMode: resolveOptimizationStrategyMode(),
    decisionLab: isDecisionLabEnabled(),
    decisionTriggerGateway: isDecisionTriggerGatewayEnabled(),
    authorizationPolicyGateway: isAuthorizationPolicyGatewayEnabled(),
    replanningTriggerPolicy: isReplanningTriggerPolicyEnabled(),
  };
  return {
    ...base,
    legacyConvergence: evaluateLegacyConvergence(base),
  };
}
