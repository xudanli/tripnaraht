/**
 * Decision Center queue admission — only true decision problems enter the main queue.
 */

import type {
  ConstraintEnforcement,
  DecisionProblemStatus,
} from '../../../trips/decision-semantics/types/decision-semantics.types';

export interface DecisionQueueAdmissionInput {
  enforcement: ConstraintEnforcement;
  workflowStatus: DecisionProblemStatus | 'DECIDED';
  semanticKey?: string;
  title?: string;
  summary?: string;
  hasExecutableOptions?: boolean;
  requiresDecision?: boolean;
  requiresAdjustment?: boolean;
  requiresConfirmation?: boolean;
  blocksPlan?: boolean;
}

const TERMINAL_STATUSES = new Set<string>(['RESOLVED', 'DISMISSED']);

/** Readiness / safety notices that are not actionable decisions. */
export function isInformOnlyContent(input: Pick<DecisionQueueAdmissionInput, 'semanticKey' | 'title' | 'summary'>): boolean {
  const blob = `${input.semanticKey ?? ''} ${input.title ?? ''} ${input.summary ?? ''}`.toLowerCase();
  if (/紧急电话|emergency[_\s-]?phone|safety\.emergency|fact\.\w+\.safety\.emergency/.test(blob)) {
    return true;
  }
  if (input.semanticKey?.startsWith('READINESS_SAFETY_')) return true;
  return false;
}

export function inferEnforcementForQueue(
  enforcement: ConstraintEnforcement,
  input: Pick<DecisionQueueAdmissionInput, 'semanticKey' | 'title' | 'summary'>,
): ConstraintEnforcement {
  if (isInformOnlyContent(input)) return 'INFORM';
  return enforcement;
}

export function qualifiesForDecisionQueue(input: DecisionQueueAdmissionInput): boolean {
  if (TERMINAL_STATUSES.has(input.workflowStatus)) return false;

  const enforcement = inferEnforcementForQueue(input.enforcement, input);

  if (enforcement === 'INFORM') return false;

  if (
    input.requiresDecision === true ||
    input.requiresAdjustment === true ||
    input.requiresConfirmation === true ||
    input.blocksPlan === true
  ) {
    return true;
  }

  switch (enforcement) {
    case 'BLOCK':
    case 'REQUIRE_ADJUSTMENT':
    case 'REQUIRE_CONFIRMATION':
      return true;
    case 'WARN':
      return input.hasExecutableOptions === true;
    default:
      return false;
  }
}

export function qualifiesForPlanningConflicts(input: {
  phase: 'PLANNING' | 'EXECUTION' | 'LIVE';
  workflowStatus: DecisionProblemStatus | 'DECIDED';
  affectsPlan: boolean;
  enforcement: ConstraintEnforcement;
  semanticKey?: string;
  title?: string;
  summary?: string;
}): boolean {
  if (input.phase !== 'PLANNING') return false;
  if (TERMINAL_STATUSES.has(input.workflowStatus)) return false;
  if (!input.affectsPlan) return false;

  const enforcement = inferEnforcementForQueue(input.enforcement, input);
  return (
    enforcement === 'BLOCK' ||
    enforcement === 'REQUIRE_ADJUSTMENT' ||
    enforcement === 'REQUIRE_CONFIRMATION' ||
    enforcement === 'WARN'
  );
}

export const ENFORCEMENT_ALLOWED_ACTIONS: Record<
  ConstraintEnforcement,
  import('../../../trips/decision-semantics/types/decision-semantics.types').DecisionOptionType[]
> = {
  BLOCK: ['REPAIR', 'ALTERNATIVE', 'PLAN_B', 'CANCEL'],
  REQUIRE_ADJUSTMENT: ['REPAIR', 'ALTERNATIVE', 'PLAN_B', 'DEFER'],
  REQUIRE_CONFIRMATION: ['ACCEPT_RISK', 'REPAIR', 'ALTERNATIVE'],
  WARN: ['ACCEPT_RISK', 'DEFER', 'REPAIR'],
  INFORM: [],
};
