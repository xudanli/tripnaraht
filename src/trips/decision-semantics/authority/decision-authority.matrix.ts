/**
 * Decision authority matrix — V1.5 P0.
 * Policy-driven; personas (Abu/Dr.Dre/Neptune) present conclusions, not veto rights.
 */

import type {
  ConstraintAssertion,
  ConstraintEnforcement,
  DecisionAuthority,
  DecisionAuthorityDomain,
  DecisionProblemType,
} from '../types/decision-semantics.types';

export interface AuthorityLookupInput {
  problemType: DecisionProblemType;
  primaryDomain: DecisionAuthorityDomain;
  enforcement: ConstraintEnforcement;
  overridable: boolean;
  issueKind?: string;
}

const SAFETY_HARD: DecisionAuthority = {
  decisionDomain: 'SAFETY',
  proposer: 'SYSTEM',
  requiredApprover: 'SYSTEM',
  vetoActors: ['OFFICIAL_RULE'],
  executionMode: 'EXPLICIT_CONFIRMATION',
  overridable: false,
  overrideRequirements: {
    reasonRequired: true,
    acknowledgementRequired: true,
    liabilityNoticeRequired: true,
  },
};

const ROUTE_ADJUST: DecisionAuthority = {
  decisionDomain: 'ROUTE',
  proposer: 'SYSTEM',
  requiredApprover: 'TRIP_OWNER',
  vetoActors: ['OFFICIAL_RULE'],
  executionMode: 'EXPLICIT_CONFIRMATION',
  overridable: false,
};

const SCHEDULE_SOFT: DecisionAuthority = {
  decisionDomain: 'SCHEDULE',
  proposer: 'SYSTEM',
  requiredApprover: 'TRIP_OWNER',
  executionMode: 'EXPLICIT_CONFIRMATION',
  overridable: true,
  overrideRequirements: {
    reasonRequired: true,
    acknowledgementRequired: false,
    liabilityNoticeRequired: false,
  },
};

const TEAM_PREFERENCE: DecisionAuthority = {
  decisionDomain: 'TEAM_PREFERENCE',
  proposer: 'SYSTEM',
  requiredApprover: 'AFFECTED_MEMBERS',
  vetoActors: ['AFFECTED_MEMBER'],
  executionMode: 'MULTI_PARTY_APPROVAL',
  overridable: true,
  overrideRequirements: {
    reasonRequired: false,
    acknowledgementRequired: true,
    liabilityNoticeRequired: false,
  },
};

const BUDGET_CHANGE: DecisionAuthority = {
  decisionDomain: 'BUDGET',
  proposer: 'SYSTEM',
  requiredApprover: 'TRIP_OWNER',
  executionMode: 'EXPLICIT_CONFIRMATION',
  overridable: true,
  overrideRequirements: {
    reasonRequired: true,
    acknowledgementRequired: false,
    liabilityNoticeRequired: false,
  },
};

const AUTO_MICRO: DecisionAuthority = {
  decisionDomain: 'SCHEDULE',
  proposer: 'SYSTEM',
  requiredApprover: 'SYSTEM',
  executionMode: 'AUTO_WITH_NOTIFICATION',
  overridable: true,
};

/** Resolve authority for a problem from assertion + problem type. */
export function resolveDecisionAuthority(input: AuthorityLookupInput): DecisionAuthority {
  if (input.enforcement === 'BLOCK' && !input.overridable) {
    return { ...SAFETY_HARD, decisionDomain: input.primaryDomain };
  }

  if (input.problemType === 'PREFERENCE_CONFLICT' || input.issueKind?.includes('team_fit')) {
    return TEAM_PREFERENCE;
  }

  if (input.primaryDomain === 'BUDGET' || input.issueKind?.includes('budget')) {
    return BUDGET_CHANGE;
  }

  if (input.enforcement === 'REQUIRE_ADJUSTMENT') {
    return { ...ROUTE_ADJUST, decisionDomain: input.primaryDomain };
  }

  if (input.enforcement === 'WARN' || input.enforcement === 'INFORM') {
    return { ...AUTO_MICRO, decisionDomain: input.primaryDomain };
  }

  if (input.problemType === 'DATA_UNCERTAINTY') {
    return {
      decisionDomain: input.primaryDomain,
      proposer: 'SYSTEM',
      requiredApprover: 'TRIP_OWNER',
      executionMode: 'EXPLICIT_CONFIRMATION',
      overridable: true,
    };
  }

  return { ...SCHEDULE_SOFT, decisionDomain: input.primaryDomain };
}

export function domainFromAssertion(assertion: ConstraintAssertion): DecisionAuthorityDomain {
  const map: Record<string, DecisionAuthorityDomain> = {
    SAFETY: 'SAFETY',
    TIME: 'SCHEDULE',
    ROUTE: 'ROUTE',
    BUDGET: 'BUDGET',
    ACCESS: 'ACTIVITY',
    TEAM_FIT: 'TEAM_PREFERENCE',
    ENERGY: 'SCHEDULE',
    BOOKING: 'BOOKING',
    LEGAL: 'SAFETY',
    WEATHER: 'SAFETY',
  };
  return map[assertion.domain] ?? 'SCHEDULE';
}
