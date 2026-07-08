/**
 * TravelDecisionContract.automation → AuthorizationPolicyGateway outcomes.
 * Catalog-driven with legacy list fallback.
 */

import type { AutomationLevel, AutomationPolicy } from '../../../trips/trip-constraint-solver/types/travel-decision-contract.types';
import type { AuthorizationOutcome } from '../contracts/authorization-policy.types';
import { resolveEffectiveAutomationTier } from './automation-action.resolver.util';

export interface DecisionAutomationEvaluationInput {
  automation: AutomationPolicy;
  automationPaused?: boolean;
  semanticKey?: string;
  semanticCapability?: string;
  enforcement?: string;
}

export interface DecisionAutomationEvaluation {
  outcome: AuthorizationOutcome;
  reasonCodes: string[];
  autoApplyEligible: boolean;
  /** Catalog action keys matched for this evaluation */
  matchedActionKeys?: string[];
}

function tierToOutcome(tier: 'AUTO' | 'ASK' | 'DENY'): AuthorizationOutcome {
  if (tier === 'AUTO') return 'ALLOW';
  if (tier === 'DENY') return 'DENY';
  return 'ASK';
}

export function evaluateDecisionAutomation(
  input: DecisionAutomationEvaluationInput,
): DecisionAutomationEvaluation {
  if (input.automationPaused) {
    return {
      outcome: 'ASK',
      reasonCodes: ['AUTOMATION_PAUSED'],
      autoApplyEligible: false,
    };
  }

  const level = input.automation.defaultLevel;
  const resolution = resolveEffectiveAutomationTier({
    automation: input.automation,
    semanticKey: input.semanticKey,
    semanticCapability: input.semanticCapability,
    enforcement: input.enforcement,
  });

  const matchedActionKeys = resolution.matchedActions.map((a) => a.key);

  if (resolution.tier === 'DENY') {
    return {
      outcome: 'DENY',
      reasonCodes: resolution.reasonCodes,
      autoApplyEligible: false,
      matchedActionKeys,
    };
  }

  if (resolution.tier === 'ASK') {
    return {
      outcome: 'ASK',
      reasonCodes: resolution.reasonCodes,
      autoApplyEligible: false,
      matchedActionKeys,
    };
  }

  // tier === AUTO — still gated by automation level
  if (level === 'INFORM_ONLY' || level === 'SUGGEST') {
    return {
      outcome: 'ASK',
      reasonCodes: [...resolution.reasonCodes, 'AUTOMATION_LEVEL_REQUIRES_USER'],
      autoApplyEligible: false,
      matchedActionKeys,
    };
  }

  if (level === 'AUTO_REPAIR_LOW_RISK' || level === 'AUTO_EXECUTE_CONDITIONAL') {
    return {
      outcome: 'ALLOW',
      reasonCodes: [...resolution.reasonCodes, 'AUTOMATION_AUTO_ALLOWED'],
      autoApplyEligible: true,
      matchedActionKeys,
    };
  }

  return {
    outcome: 'ASK',
    reasonCodes: [...resolution.reasonCodes, 'AUTOMATION_DEFAULT_ASK'],
    autoApplyEligible: false,
    matchedActionKeys,
  };
}

export function automationLevelAllowsAutoApply(level: AutomationLevel): boolean {
  return level === 'AUTO_REPAIR_LOW_RISK' || level === 'AUTO_EXECUTE_CONDITIONAL';
}
