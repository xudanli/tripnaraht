/**
 * 统一 Decision State Shadow 入口：
 * Activity → Lodging → Transport/Route → Dining/Risk → Plan
 */

import {
  buildActivityDecisionShadow,
  type BuildActivityDecisionShadowInput,
} from './activity-decision-shadow.util';
import { buildLodgingDecisionShadow } from './lodging-decision-shadow.util';
import { buildTransportRouteDecisionShadow } from './transport-route-decision-shadow.util';
import { buildDiningRiskDecisionShadow } from './dining-risk-decision-shadow.util';
import { buildPlanDecisionShadow } from './plan-decision-shadow.util';
import { isActivityDecisionFamily } from './classify-activity-decision.util';
import { isLodgingDecisionFamily } from './classify-lodging-decision.util';
import { isTransportRouteDecisionFamily } from './classify-transport-route-decision.util';
import { isDiningRiskDecisionFamily } from './classify-dining-risk-decision.util';
import { isPlanDecisionFamily } from './classify-plan-decision.util';
import type { DecisionStateShadowV1 } from './decision-state.types';
import type { LodgingDecisionProjectionHints } from './project-lodging-decision-state.util';
import type { ActivityDecisionProjectionHints } from './project-activity-decision-state.util';
import type { TransportRouteProjectionHints } from './project-transport-route-decision-state.util';
import type { DiningRiskProjectionHints } from './project-dining-risk-decision-state.util';

export type BuildDecisionStateShadowInput = {
  message: string;
  activityHints?: ActivityDecisionProjectionHints;
  lodgingHints?: LodgingDecisionProjectionHints;
  transportHints?: TransportRouteProjectionHints;
  diningRiskHints?: DiningRiskProjectionHints;
  legacy?: BuildActivityDecisionShadowInput['legacy'];
};

export function buildDecisionStateShadow(
  input: BuildDecisionStateShadowInput,
): DecisionStateShadowV1 {
  const message = input.message;
  const tripId =
    input.transportHints?.tripId ??
    input.lodgingHints?.tripId ??
    input.diningRiskHints?.tripId ??
    null;

  if (isActivityDecisionFamily(message)) {
    const shadow = buildActivityDecisionShadow({
      message,
      hints: input.activityHints,
      legacy: input.legacy,
    });
    if (shadow.classified.decisionClass) {
      return { ...shadow, mode: 'TAKEOVER_ELIGIBLE' };
    }
  }
  if (isLodgingDecisionFamily(message)) {
    return buildLodgingDecisionShadow({
      message,
      hints: input.lodgingHints,
      legacy: input.legacy,
    });
  }
  if (isTransportRouteDecisionFamily(message, tripId)) {
    return buildTransportRouteDecisionShadow({
      message,
      hints: {
        message,
        tripId,
        ...(input.transportHints ?? {}),
      },
      legacy: input.legacy,
    });
  }
  if (isDiningRiskDecisionFamily(message)) {
    return buildDiningRiskDecisionShadow({
      message,
      hints: {
        message,
        tripId,
        ...(input.diningRiskHints ?? {}),
      },
      legacy: input.legacy,
    });
  }
  if (isPlanDecisionFamily(message, tripId)) {
    return buildPlanDecisionShadow({
      message,
      hints: {
        message,
        tripId,
        focusDayIndex: input.transportHints?.focusDayIndex ?? null,
        ...(input.transportHints ?? {}),
      },
      legacy: input.legacy,
    });
  }

  return {
    schema: 'tripnara.decision_state_contract_shadow@v1',
    mode: 'SHADOW_OBSERVE_ONLY',
    classified: {
      decisionClass: null,
      confidence: 0,
      reason: 'no_decision_family',
    },
    contract: null,
    projection: null,
    readiness: null,
    legacyCompare: {
      creOperation: input.legacy?.creOperation,
      creNextAction: input.legacy?.creNextAction,
      legacyWouldAskUser: input.legacy?.wouldAskUser === true,
      shadowNextAction: null,
      divergenceCodes: [],
    },
    invariants: [],
  };
}
