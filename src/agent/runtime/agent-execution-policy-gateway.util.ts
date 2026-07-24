/**
 * Agent Execution Policy Gateway（Harness Control P2 基础）。
 * 统一 MCP tool dispatch 与 Agentic 准入策略的 SSOT（纯函数层）。
 */

import {
  buildToolGovernanceHoldEnvelope,
  isGovernanceAskPreApproved,
  mergeAgenticToolPolicies,
  resolveToolGovernancePolicy,
  type GovernanceApprovedToolInvocation,
  type ToolGovernancePolicyEntry,
} from './agentic-tool-governance.util';
import {
  evaluateAgenticTokenQuota,
  parseAgenticTokenQuotaConfig,
  type AgenticTokenQuotaCheckResult,
  type AgenticTokenQuotaConfig,
} from './agentic-token-quota.util';

export type McpToolDispatchAction = 'execute' | 'hold';

export interface McpToolDispatchDecision {
  action: McpToolDispatchAction;
  mode?: 'ask' | 'deny';
  holdEnvelope?: ReturnType<typeof buildToolGovernanceHoldEnvelope>;
  governanceAuditId?: string;
  policy: ToolGovernancePolicyEntry;
  logLine: string;
}

export interface AgenticAdmissionDecision {
  allowed: boolean;
  quota: AgenticTokenQuotaCheckResult;
}

export function mergeExecutionToolPolicies(
  hitlFeatureEnabled: boolean,
  toolPoliciesFromMemory?: unknown,
): Record<string, ToolGovernancePolicyEntry> {
  return mergeAgenticToolPolicies(hitlFeatureEnabled, toolPoliciesFromMemory);
}

export function evaluateMcpToolDispatch(params: {
  mcpToolName: string;
  policies: Record<string, ToolGovernancePolicyEntry> | undefined;
  toolCallId?: string;
  approvedInvocations?: GovernanceApprovedToolInvocation[];
}): McpToolDispatchDecision {
  const policy = resolveToolGovernancePolicy(params.mcpToolName, params.policies);

  if (policy.mode === 'deny') {
    const hold = buildToolGovernanceHoldEnvelope(
      params.mcpToolName,
      'deny',
      policy.reason,
      params.toolCallId,
    );
    const auditId = String((hold.data as { governance_audit_id?: string }).governance_audit_id ?? '');
    return {
      action: 'hold',
      mode: 'deny',
      holdEnvelope: hold,
      governanceAuditId: auditId,
      policy,
      logLine: `[AgentExecutionPolicy] deny mcp=${params.mcpToolName} audit=${auditId} reason=${policy.reason ?? 'policy'} tool_call_id=${params.toolCallId ?? ''}`,
    };
  }

  if (policy.mode === 'ask') {
    if (
      isGovernanceAskPreApproved(
        params.approvedInvocations,
        params.toolCallId,
        params.mcpToolName,
      )
    ) {
      return {
        action: 'execute',
        policy,
        logLine: `[AgentExecutionPolicy] ask bypass (pre-approved) mcp=${params.mcpToolName} tool_call_id=${params.toolCallId ?? ''}`,
      };
    }
    const hold = buildToolGovernanceHoldEnvelope(
      params.mcpToolName,
      'ask',
      policy.reason,
      params.toolCallId,
    );
    const auditId = String((hold.data as { governance_audit_id?: string }).governance_audit_id ?? '');
    return {
      action: 'hold',
      mode: 'ask',
      holdEnvelope: hold,
      governanceAuditId: auditId,
      policy,
      logLine: `[AgentExecutionPolicy] ask hold mcp=${params.mcpToolName} audit=${auditId} reason=${policy.reason ?? 'hitl'} tool_call_id=${params.toolCallId ?? ''}`,
    };
  }

  return {
    action: 'execute',
    policy,
    logLine: `[AgentExecutionPolicy] auto mcp=${params.mcpToolName}`,
  };
}

export function evaluateAgenticAdmission(params: {
  config: AgenticTokenQuotaConfig;
  userUsed: number;
  orgUsed?: number;
  globalUsed: number;
  estimatedTokens: number;
  userId?: string | null;
  orgId?: string | null;
}): AgenticAdmissionDecision {
  const quota = evaluateAgenticTokenQuota({
    config: params.config,
    userUsed: params.userUsed,
    orgUsed: params.orgUsed ?? 0,
    globalUsed: params.globalUsed,
    estimatedTokens: params.estimatedTokens,
    hasUserId: !!params.userId?.trim(),
    orgId: params.orgId,
  });
  return { allowed: quota.allowed, quota };
}

export function resolveAgenticTokenQuotaConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AgenticTokenQuotaConfig {
  return parseAgenticTokenQuotaConfig(env);
}
