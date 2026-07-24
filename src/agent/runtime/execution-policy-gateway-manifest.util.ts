/**
 * Execution Policy Gateway DSL：从 env + memory 编译统一 manifest，并提供三通道 dispatch。
 */

import { randomUUID } from 'crypto';
import {
  DEFAULT_DESTRUCTIVE_TOOL_POLICIES,
  DEFAULT_HITL_TOOL_POLICIES,
  DESTRUCTIVE_MCP_TOOL_NAME_PATTERNS,
  type ToolGovernancePolicyEntry,
} from './agentic-tool-governance.util';
import type { AgenticTokenQuotaConfig } from './agentic-token-quota.util';
import type {
  ExecutionPolicyGatewayManifestV1,
  PolicyGatewayChannel,
  PolicyGatewayDispatchDecision,
  PolicyGatewayRuleSource,
  PolicyGatewayRuleV1,
} from './execution-policy-gateway-dsl.types';

const MANIFEST_SAMPLE_LIMIT = 24;

/** 默认 external API 侧效应模式（host/path 正则）；可被 memory `external_api_policies` 覆盖。 */
export const DEFAULT_EXTERNAL_API_POLICY_PATTERNS: ReadonlyArray<{
  id: string;
  re: RegExp;
  mode: ToolGovernancePolicyEntry['mode'];
  reason: string;
}> = [
  {
    id: 'ext:outbound_message',
    re: /(?:^|[./-])(?:send|forward|reply|mail|email|message)(?:[./-]|$)/i,
    mode: 'ask',
    reason: 'Outbound message API requires approval',
  },
  {
    id: 'ext:destructive_write',
    re: /(?:^|[./-])(?:delete|remove|purge|wipe|truncate)(?:[./-]|$)/i,
    mode: 'ask',
    reason: 'Destructive external write requires approval',
  },
];

export function parseExternalApiPolicyEnforcementFlag(
  raw?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = String(raw ?? env.HARNESS_EXECUTION_POLICY_EXTERNAL_API ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function inferMcpRuleSource(toolName: string, hitlEnabled: boolean): PolicyGatewayRuleSource {
  if (toolName in DEFAULT_DESTRUCTIVE_TOOL_POLICIES) return 'destructive_baseline';
  if (hitlEnabled && toolName in DEFAULT_HITL_TOOL_POLICIES) return 'hitl_default';
  return 'memory';
}

function compileMcpToolRules(
  policies: Record<string, ToolGovernancePolicyEntry>,
  hitlEnabled: boolean,
): PolicyGatewayRuleV1[] {
  const rules: PolicyGatewayRuleV1[] = Object.entries(policies).map(([target, entry]) => ({
    id: `mcp:${target}`,
    channel: 'mcp_tool',
    target,
    mode: entry.mode,
    reason: entry.reason,
    source: inferMcpRuleSource(target, hitlEnabled),
  }));

  for (const { re, mode, reason } of DESTRUCTIVE_MCP_TOOL_NAME_PATTERNS) {
    rules.push({
      id: `mcp:pattern:${re.source}`,
      channel: 'mcp_tool',
      target: `pattern:${re.source}`,
      mode,
      reason,
      source: 'pattern',
    });
  }
  return rules;
}

function compileLlmCallRules(
  tokenQuota: AgenticTokenQuotaConfig,
  env: NodeJS.ProcessEnv,
): PolicyGatewayRuleV1[] {
  const rules: PolicyGatewayRuleV1[] = [];
  if (tokenQuota.enabled) {
    rules.push({
      id: 'llm:daily_token_quota',
      channel: 'llm_call',
      target: 'agentic_admission',
      mode: 'deny',
      reason: 'Daily token quota exceeded',
      source: 'env',
    });
  }
  if (tokenQuota.perSessionCap > 0) {
    rules.push({
      id: 'llm:session_token_cap',
      channel: 'llm_call',
      target: 'agentic_session',
      mode: 'deny',
      reason: 'Session token cap exceeded',
      source: 'env',
    });
  }
  if (tokenQuota.perOrgDaily > 0) {
    rules.push({
      id: 'llm:org_daily_token_quota',
      channel: 'llm_call',
      target: 'agentic_org',
      mode: 'deny',
      reason: 'Org daily token quota exceeded',
      source: 'env',
    });
  }
  const loopCap = parseInt(String(env.AGENTIC_LOOP_MAX_TOTAL_TOKENS ?? '4000'), 10) || 4000;
  if (loopCap > 0) {
    rules.push({
      id: 'llm:agentic_loop_cap',
      channel: 'llm_call',
      target: 'agentic_loop',
      mode: 'deny',
      reason: `Agentic loop max ${loopCap} tokens`,
      source: 'env',
    });
  }
  rules.push({
    id: 'llm:default',
    channel: 'llm_call',
    target: '*',
    mode: 'auto',
    source: 'env',
  });
  return rules;
}

function normalizeExternalApiPoliciesFromMemory(raw: unknown): Record<string, ToolGovernancePolicyEntry> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, ToolGovernancePolicyEntry> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const target = String(k).trim();
    if (!target || !v || typeof v !== 'object' || Array.isArray(v)) continue;
    const modeRaw = String((v as { mode?: unknown }).mode ?? '').trim().toLowerCase();
    if (modeRaw !== 'auto' && modeRaw !== 'ask' && modeRaw !== 'deny') continue;
    out[target] = {
      mode: modeRaw,
      reason:
        typeof (v as { reason?: unknown }).reason === 'string'
          ? String((v as { reason: string }).reason)
          : undefined,
    };
  }
  return out;
}

function compileExternalApiRules(
  fromMemory: Record<string, ToolGovernancePolicyEntry>,
): PolicyGatewayRuleV1[] {
  const rules: PolicyGatewayRuleV1[] = Object.entries(fromMemory).map(([target, entry]) => ({
    id: `ext:${target}`,
    channel: 'external_api',
    target,
    mode: entry.mode,
    reason: entry.reason,
    source: 'memory',
  }));
  for (const { id, re, mode, reason } of DEFAULT_EXTERNAL_API_POLICY_PATTERNS) {
    rules.push({
      id,
      channel: 'external_api',
      target: `pattern:${re.source}`,
      mode,
      reason,
      source: 'pattern',
    });
  }
  rules.push({
    id: 'ext:default',
    channel: 'external_api',
    target: '*',
    mode: 'auto',
    source: 'env',
  });
  return rules;
}

export function compileExecutionPolicyGatewayRules(params: {
  hitlGovernanceEnabled: boolean;
  toolPolicies: Record<string, ToolGovernancePolicyEntry>;
  tokenQuota: AgenticTokenQuotaConfig;
  externalApiPoliciesFromMemory?: unknown;
  env?: NodeJS.ProcessEnv;
}): PolicyGatewayRuleV1[] {
  const env = params.env ?? process.env;
  const extMem = normalizeExternalApiPoliciesFromMemory(params.externalApiPoliciesFromMemory);
  return [
    ...compileMcpToolRules(params.toolPolicies, params.hitlGovernanceEnabled),
    ...compileLlmCallRules(params.tokenQuota, env),
    ...compileExternalApiRules(extMem),
  ];
}

export function buildExecutionPolicyGatewayManifest(params: {
  rules: PolicyGatewayRuleV1[];
  externalApiEnforcementEnabled: boolean;
}): ExecutionPolicyGatewayManifestV1 {
  const channelCounts: Record<PolicyGatewayChannel, number> = {
    mcp_tool: 0,
    llm_call: 0,
    external_api: 0,
  };
  for (const r of params.rules) channelCounts[r.channel] += 1;

  return {
    schemaId: 'tripnara.execution_policy_manifest@v1',
    version: 1,
    rule_count: params.rules.length,
    channels: {
      mcp_tool: { rule_count: channelCounts.mcp_tool, enforcement: 'enforce' },
      llm_call: { rule_count: channelCounts.llm_call, enforcement: 'enforce' },
      external_api: {
        rule_count: channelCounts.external_api,
        enforcement: params.externalApiEnforcementEnabled ? 'enforce' : 'observe',
      },
    },
    sample_rules: params.rules.slice(0, MANIFEST_SAMPLE_LIMIT),
  };
}

function matchMcpToolRule(
  mcpToolName: string,
  rules: PolicyGatewayRuleV1[],
): PolicyGatewayRuleV1 | undefined {
  const exact = rules.find((r) => r.channel === 'mcp_tool' && r.target === mcpToolName);
  if (exact) return exact;
  for (const r of rules) {
    if (r.channel !== 'mcp_tool' || !r.target.startsWith('pattern:')) continue;
    const src = r.target.slice('pattern:'.length);
    try {
      if (new RegExp(src).test(mcpToolName)) return r;
    } catch {
      /* ignore bad pattern */
    }
  }
  return undefined;
}

function matchExternalApiRule(url: string, rules: PolicyGatewayRuleV1[]): PolicyGatewayRuleV1 | undefined {
  let host = '';
  let path = url;
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    path = `${u.pathname}${u.search}`.toLowerCase();
  } catch {
    host = url.toLowerCase();
  }
  const hostKey = rules.find((r) => r.channel === 'external_api' && r.target === host);
  if (hostKey) return hostKey;
  const haystack = `${host}${path}`;
  for (const r of rules) {
    if (r.channel !== 'external_api' || !r.target.startsWith('pattern:')) continue;
    const src = r.target.slice('pattern:'.length);
    try {
      if (new RegExp(src).test(haystack)) return r;
    } catch {
      /* ignore */
    }
  }
  return rules.find((r) => r.channel === 'external_api' && r.target === '*');
}

export function evaluatePolicyGatewayDispatch(params: {
  channel: PolicyGatewayChannel;
  target: string;
  rules: PolicyGatewayRuleV1[];
  externalApiEnforcementEnabled?: boolean;
}): PolicyGatewayDispatchDecision {
  const auditPrefix = 'gov';
  const makeHold = (
    rule: PolicyGatewayRuleV1 | undefined,
    mode: ToolGovernancePolicyEntry['mode'],
    reason: string,
  ): PolicyGatewayDispatchDecision => {
    const auditId = `${auditPrefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    return {
      action: 'hold',
      channel: params.channel,
      target: params.target,
      mode,
      matchedRuleId: rule?.id,
      reason,
      governanceAuditId: auditId,
      logLine: `[PolicyGateway] hold channel=${params.channel} target=${params.target} mode=${mode} audit=${auditId} reason=${reason}`,
    };
  };

  if (params.channel === 'mcp_tool') {
    const rule = matchMcpToolRule(params.target, params.rules);
    const mode = rule?.mode ?? 'auto';
    if (mode === 'deny') {
      return makeHold(rule, 'deny', rule?.reason ?? 'policy deny');
    }
    if (mode === 'ask') {
      return makeHold(rule, 'ask', rule?.reason ?? 'hitl');
    }
    return {
      action: 'allow',
      channel: 'mcp_tool',
      target: params.target,
      mode: 'auto',
      matchedRuleId: rule?.id,
      logLine: `[PolicyGateway] allow mcp=${params.target}`,
    };
  }

  if (params.channel === 'external_api') {
    if (!params.externalApiEnforcementEnabled) {
      return {
        action: 'allow',
        channel: 'external_api',
        target: params.target,
        mode: 'auto',
        logLine: `[PolicyGateway] observe external_api=${params.target}`,
      };
    }
    const rule = matchExternalApiRule(params.target, params.rules);
    const mode = rule?.mode ?? 'auto';
    if (mode === 'deny') return makeHold(rule, 'deny', rule?.reason ?? 'external api deny');
    if (mode === 'ask') return makeHold(rule, 'ask', rule?.reason ?? 'external api ask');
    return {
      action: 'allow',
      channel: 'external_api',
      target: params.target,
      mode: 'auto',
      matchedRuleId: rule?.id,
      logLine: `[PolicyGateway] allow external_api=${params.target}`,
    };
  }

  return {
    action: 'allow',
    channel: 'llm_call',
    target: params.target,
    mode: 'auto',
    logLine: `[PolicyGateway] allow llm=${params.target}`,
  };
}
