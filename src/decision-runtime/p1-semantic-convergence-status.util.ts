/**
 * P1 — Aggregated semantic convergence status for ops / harness.
 */

import {
  isBudgetLegacyDualWriteEnabled,
  isLegacyDecisionEngineDeprecatedForNewWork,
  isP1SemanticConvergenceEnabled,
  p1PrefersCanonicalDecisionRuntime,
  p1PrefersConstraintGatewayOn,
  p1RequiresGuideCanonicalAccept,
} from './p1-semantic-convergence.config';
import {
  isConstraintGatewayDualRunEligible,
  resolveConstraintGatewayMode,
  resolveEffectiveRuntimeMode,
} from './constraints/constraint-evaluation.config';
import { isGuideCanonicalAcceptExecuteEnabled } from './constraints/constraint-evaluation.config';
import { DECISION_INBOX_PROJECTIONS } from './decision-inbox-semantics';
import { PLAN_VERSION_SEMANTICS } from './plan-version-semantics';

export interface P1SemanticConvergenceStatus {
  schemaId: 'tripnara.p1_semantic_convergence@v1';
  enabled: boolean;
  constraintGateway: {
    mode: string;
    prefersOn: boolean;
    dualRunEligible: boolean;
    dualRunDiscouraged: boolean;
  };
  decisionRuntime: {
    mode: string;
    prefersCanonical: boolean;
    legacyDeprecatedForNewWork: boolean;
  };
  guideAccept: {
    requiresCanonical: boolean;
    canonicalAcceptExecuteEnabled: boolean;
  };
  budget: {
    legacyDualWriteEnabled: boolean;
  };
  decisionInbox: {
    ssot: string;
    projections: typeof DECISION_INBOX_PROJECTIONS;
  };
  planVersionSemantics: typeof PLAN_VERSION_SEMANTICS;
}

export function resolveP1SemanticConvergenceStatus(): P1SemanticConvergenceStatus {
  const enabled = isP1SemanticConvergenceEnabled();
  return {
    schemaId: 'tripnara.p1_semantic_convergence@v1',
    enabled,
    constraintGateway: {
      mode: resolveConstraintGatewayMode(),
      prefersOn: p1PrefersConstraintGatewayOn(),
      dualRunEligible: isConstraintGatewayDualRunEligible(),
      dualRunDiscouraged: enabled && isConstraintGatewayDualRunEligible(),
    },
    decisionRuntime: {
      mode: resolveEffectiveRuntimeMode(),
      prefersCanonical: p1PrefersCanonicalDecisionRuntime(),
      legacyDeprecatedForNewWork: isLegacyDecisionEngineDeprecatedForNewWork(),
    },
    guideAccept: {
      requiresCanonical: p1RequiresGuideCanonicalAccept(),
      canonicalAcceptExecuteEnabled: isGuideCanonicalAcceptExecuteEnabled(),
    },
    budget: {
      legacyDualWriteEnabled: isBudgetLegacyDualWriteEnabled(),
    },
    decisionInbox: {
      ssot: 'UnifiedDecisionProblemReadModelService',
      projections: DECISION_INBOX_PROJECTIONS,
    },
    planVersionSemantics: PLAN_VERSION_SEMANTICS,
  };
}
