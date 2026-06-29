/**
 * Execution Policy Gateway 请求级上下文（Harness Control P2+ 主链 SSOT）。
 * 在 DecisionRuntimeKernel tick 入口 hydrate 一次；Agentic / MCP 消费同一 policies。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';
import {
  mergeApprovedToolInvocations,
  type GovernanceApprovedToolInvocation,
  type ToolGovernancePolicyEntry,
} from './agentic-tool-governance.util';
import {
  mergeExecutionToolPolicies,
  resolveAgenticTokenQuotaConfigFromEnv,
} from './agent-execution-policy-gateway.util';
import type { ExecutionPolicyGatewayManifestV1, PolicyGatewayRuleV1 } from './execution-policy-gateway-dsl.types';
import {
  buildExecutionPolicyGatewayManifest,
  compileExecutionPolicyGatewayRules,
  parseExternalApiPolicyEnforcementFlag,
} from './execution-policy-gateway-manifest.util';

export interface ExecutionPolicyGatewayObservabilityV1 {
  schemaId: 'tripnara.execution_policy_gateway@v1';
  version: 1;
  hitl_governance_enabled: boolean;
  tool_policy_count: number;
  restrictive_tool_names: string[];
  token_quota: {
    enabled: boolean;
    user_daily_limit: number;
    org_daily_limit: number;
    global_daily_limit: number;
    session_token_cap: number;
  };
  approved_invocation_count: number;
  policy_manifest_v1?: ExecutionPolicyGatewayManifestV1;
}

export type RouteAndRunExecutionPolicyCarrier = RouteAndRunRequestDto & {
  __executionPolicyGatewayV1?: ExecutionPolicyGatewayObservabilityV1;
  __executionPolicyGatewayPolicies?: Record<string, ToolGovernancePolicyEntry>;
  __executionPolicyGatewayApproved?: GovernanceApprovedToolInvocation[];
  __executionPolicyGatewayRules?: PolicyGatewayRuleV1[];
  __executionPolicyGatewayManifest?: ExecutionPolicyGatewayManifestV1;
  __executionPolicyGatewayExternalApiEnforcement?: boolean;
};

export function readExecutionPolicyGatewayPolicies(
  request: RouteAndRunExecutionPolicyCarrier,
): Record<string, ToolGovernancePolicyEntry> | undefined {
  return request.__executionPolicyGatewayPolicies;
}

export function readExecutionPolicyGatewayApproved(
  request: RouteAndRunExecutionPolicyCarrier,
): GovernanceApprovedToolInvocation[] | undefined {
  return request.__executionPolicyGatewayApproved;
}

export function readExecutionPolicyGatewayRules(
  request: RouteAndRunExecutionPolicyCarrier,
): PolicyGatewayRuleV1[] | undefined {
  return request.__executionPolicyGatewayRules;
}

export function readExecutionPolicyGatewayManifest(
  request: RouteAndRunExecutionPolicyCarrier,
): ExecutionPolicyGatewayManifestV1 | undefined {
  return request.__executionPolicyGatewayManifest;
}

export function readExternalApiPolicyEnforcement(
  request: RouteAndRunExecutionPolicyCarrier,
): boolean {
  return request.__executionPolicyGatewayExternalApiEnforcement === true;
}

export function readExecutionPolicyGatewayObservability(
  request: RouteAndRunExecutionPolicyCarrier,
): ExecutionPolicyGatewayObservabilityV1 | undefined {
  return request.__executionPolicyGatewayV1;
}

function listRestrictiveToolNames(
  policies: Record<string, ToolGovernancePolicyEntry>,
): string[] {
  return Object.entries(policies)
    .filter(([, p]) => p.mode === 'ask' || p.mode === 'deny')
    .map(([name]) => name)
    .sort();
}

export function buildExecutionPolicyGatewayObservability(params: {
  hitlGovernanceEnabled: boolean;
  policies: Record<string, ToolGovernancePolicyEntry>;
  approvedInvocations: GovernanceApprovedToolInvocation[];
  manifest?: ExecutionPolicyGatewayManifestV1;
}): ExecutionPolicyGatewayObservabilityV1 {
  const quotaCfg = resolveAgenticTokenQuotaConfigFromEnv();
  return {
    schemaId: 'tripnara.execution_policy_gateway@v1',
    version: 1,
    hitl_governance_enabled: params.hitlGovernanceEnabled,
    tool_policy_count: Object.keys(params.policies).length,
    restrictive_tool_names: listRestrictiveToolNames(params.policies),
      token_quota: {
        enabled: quotaCfg.enabled,
        user_daily_limit: quotaCfg.perUserDaily,
        org_daily_limit: quotaCfg.perOrgDaily,
        global_daily_limit: quotaCfg.globalDaily,
        session_token_cap: quotaCfg.perSessionCap,
      },
    approved_invocation_count: params.approvedInvocations.length,
    ...(params.manifest ? { policy_manifest_v1: params.manifest } : {}),
  };
}

/** 主链 tick 入口：合并 tool policies + approved invocations，挂载到 request。 */
export function hydrateRouteAndRunExecutionPolicyInPlace(
  request: RouteAndRunExecutionPolicyCarrier,
  memory: AgentMemoryContext | undefined,
  hitlGovernanceEnabled: boolean,
  env: NodeJS.ProcessEnv = process.env,
): ExecutionPolicyGatewayObservabilityV1 {
  const policies = mergeExecutionToolPolicies(
    hitlGovernanceEnabled,
    memory?.activeTripState?.constraints?.tool_policies,
  );
  const approvedInvocations = mergeApprovedToolInvocations(
    memory?.activeTripState?.constraints?.approved_tool_invocations,
    request.options?.agentic_approved_tool_invocations,
  );
  const tokenQuota = resolveAgenticTokenQuotaConfigFromEnv(env);
  const externalApiEnforcement = parseExternalApiPolicyEnforcementFlag(undefined, env);
  const rules = compileExecutionPolicyGatewayRules({
    hitlGovernanceEnabled,
    toolPolicies: policies,
    tokenQuota,
    externalApiPoliciesFromMemory: (memory?.activeTripState?.constraints as { external_api_policies?: unknown })
      ?.external_api_policies,
    env,
  });
  const manifest = buildExecutionPolicyGatewayManifest({ rules, externalApiEnforcementEnabled: externalApiEnforcement });
  const observability = buildExecutionPolicyGatewayObservability({
    hitlGovernanceEnabled,
    policies,
    approvedInvocations,
    manifest,
  });
  request.__executionPolicyGatewayPolicies = policies;
  request.__executionPolicyGatewayApproved = approvedInvocations;
  request.__executionPolicyGatewayRules = rules;
  request.__executionPolicyGatewayManifest = manifest;
  request.__executionPolicyGatewayExternalApiEnforcement = externalApiEnforcement;
  request.__executionPolicyGatewayV1 = observability;
  return observability;
}
