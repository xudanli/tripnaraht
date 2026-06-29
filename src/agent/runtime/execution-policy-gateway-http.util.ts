/**
 * External API 出站调用 — Execution Policy Gateway DSL 可选 enforcement。
 */

import type { PolicyGatewayDispatchDecision, PolicyGatewayRuleV1 } from './execution-policy-gateway-dsl.types';
import { evaluatePolicyGatewayDispatch } from './execution-policy-gateway-manifest.util';

export class ExecutionPolicyGatewayHttpBlockedError extends Error {
  constructor(
    message: string,
    readonly decision: PolicyGatewayDispatchDecision,
  ) {
    super(message);
    this.name = 'ExecutionPolicyGatewayHttpBlockedError';
  }
}

export function guardExternalApiPolicyDispatch(params: {
  url: string;
  rules?: PolicyGatewayRuleV1[];
  enforcementEnabled?: boolean;
}): PolicyGatewayDispatchDecision {
  return evaluatePolicyGatewayDispatch({
    channel: 'external_api',
    target: params.url,
    rules: params.rules ?? [],
    externalApiEnforcementEnabled: params.enforcementEnabled,
  });
}

/** enforcement 开启且 policy hold 时抛错；默认 observe 仅记录 logLine。 */
export function assertExternalApiPolicyAllowed(params: {
  url: string;
  rules?: PolicyGatewayRuleV1[];
  enforcementEnabled?: boolean;
  onObserve?: (decision: PolicyGatewayDispatchDecision) => void;
}): void {
  const decision = guardExternalApiPolicyDispatch(params);
  if (decision.action === 'hold') {
    if (params.enforcementEnabled) {
      throw new ExecutionPolicyGatewayHttpBlockedError(
        decision.reason ?? 'External API blocked by execution policy',
        decision,
      );
    }
    params.onObserve?.(decision);
  }
}
