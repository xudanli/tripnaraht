import type { WishCategory } from '../../wishlist/types/trip-wish.types';
import type {
  ConstraintAssertion,
  ConstraintDomain,
  DecisionAuthority,
  DecisionProblemStatus,
  DecisionProblemType,
} from '../../decision-semantics/types/decision-semantics.types';
import {
  DECISION_NODE_TO_DOMAIN,
  type DecisionNode,
} from '../types/preference-round.types';
import {
  detectDecisionNodesFromText,
  pickPrimaryDecisionNode,
} from './decision-node-detection.util';

export interface DecisionProblemNegotiationContext {
  problemId: string;
  tripId: string;
  title: string;
  description: string;
  type: DecisionProblemType;
  status: DecisionProblemStatus;
  authority?: DecisionAuthority;
  assertions?: ConstraintAssertion[];
  focusConflictId?: string;
}

const CLOSED_STATUSES = new Set<DecisionProblemStatus>(['RESOLVED', 'DISMISSED']);

const CONSTRAINT_DOMAIN_TO_WISH: Partial<Record<ConstraintDomain, WishCategory>> = {
  TEAM_FIT: 'activities',
  ROUTE: 'destination_route',
  BUDGET: 'shopping',
  ACCESS: 'activities',
  TIME: 'activities',
  BOOKING: 'activities',
  ENERGY: 'activities',
  WEATHER: 'activities',
  SAFETY: 'activities',
  LEGAL: 'activities',
};

const TRANSPORT_HINT =
  /交通|车程|驾驶|自驾|transport|driving|load|负荷|main_transport/i;
const DINING_HINT = /餐饮|用餐|dining|餐厅|午饭|晚饭/i;
const ACCOMMODATION_HINT = /住宿|酒店|民宿|lodging|hotel|accommodation/i;

export function isDecisionProblemNegotiationOpen(
  status: DecisionProblemStatus,
): boolean {
  return !CLOSED_STATUSES.has(status);
}

/** Whether structured Round Robin is meaningful for this problem (vs trip-owner only). */
export function isDecisionProblemNegotiationEligible(
  ctx: DecisionProblemNegotiationContext,
): boolean {
  if (!isDecisionProblemNegotiationOpen(ctx.status)) {
    return false;
  }

  if (ctx.type === 'PREFERENCE_CONFLICT') {
    return true;
  }

  if (ctx.authority?.executionMode === 'MULTI_PARTY_APPROVAL') {
    return true;
  }

  if (
    ctx.authority?.requiredApprover === 'AFFECTED_MEMBERS' ||
    ctx.authority?.requiredApprover === 'ALL_MEMBERS'
  ) {
    return true;
  }

  const primaryDomain = pickPrimaryAssertionDomain(ctx.assertions);
  if (primaryDomain === 'TEAM_FIT') {
    return true;
  }

  return false;
}

export function resolveNegotiationDecisionNode(
  ctx: DecisionProblemNegotiationContext,
): DecisionNode {
  const text = `${ctx.title} ${ctx.description}`.trim();
  const detected = detectDecisionNodesFromText(text);
  const fromText = pickPrimaryDecisionNode(detected);
  if (fromText) {
    return fromText;
  }

  const domain = pickPrimaryAssertionDomain(ctx.assertions);
  switch (domain) {
    case 'ROUTE':
      return 'destination';
    case 'BUDGET':
      return 'budget';
    case 'TEAM_FIT':
    case 'ACCESS':
    case 'TIME':
    case 'BOOKING':
    case 'ENERGY':
      return 'activity';
    default:
      return 'activity';
  }
}

export function resolveNegotiationWishDomain(
  ctx: DecisionProblemNegotiationContext,
): WishCategory {
  const text = `${ctx.title} ${ctx.description} ${ctx.focusConflictId ?? ''}`.trim();

  if (TRANSPORT_HINT.test(text)) {
    return 'main_transport';
  }
  if (DINING_HINT.test(text)) {
    return 'dining';
  }
  if (ACCOMMODATION_HINT.test(text)) {
    return 'accommodation';
  }

  const assertionDomain = pickPrimaryAssertionDomain(ctx.assertions);
  if (assertionDomain && CONSTRAINT_DOMAIN_TO_WISH[assertionDomain]) {
    return CONSTRAINT_DOMAIN_TO_WISH[assertionDomain]!;
  }

  const decisionNode = resolveNegotiationDecisionNode(ctx);
  return DECISION_NODE_TO_DOMAIN[decisionNode];
}

function pickPrimaryAssertionDomain(
  assertions?: ConstraintAssertion[],
): ConstraintDomain | undefined {
  if (!assertions?.length) {
    return undefined;
  }
  const primary =
    assertions.find((a) => a.nature !== 'INFORMATION_GAP') ?? assertions[0];
  return primary?.domain;
}
