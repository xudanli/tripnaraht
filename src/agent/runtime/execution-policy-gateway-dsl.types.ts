/**
 * Execution Policy Gateway 统一 DSL（Harness Control P2+）。
 * MCP tool · LLM call · external API 共用 mode / reason / source 语义。
 */

import type { ToolGovernanceMode } from './agentic-tool-governance.util';

export type PolicyGatewayChannel = 'mcp_tool' | 'llm_call' | 'external_api';

export type PolicyGatewayRuleSource =
  | 'destructive_baseline'
  | 'hitl_default'
  | 'memory'
  | 'env'
  | 'pattern';

export interface PolicyGatewayRuleV1 {
  id: string;
  channel: PolicyGatewayChannel;
  /** MCP 工具名 · LLM 步骤名 · external host/pattern */
  target: string;
  mode: ToolGovernanceMode;
  reason?: string;
  source: PolicyGatewayRuleSource;
}

export interface ExecutionPolicyGatewayManifestV1 {
  schemaId: 'tripnara.execution_policy_manifest@v1';
  version: 1;
  rule_count: number;
  channels: Record<
    PolicyGatewayChannel,
    {
      rule_count: number;
      enforcement: 'observe' | 'enforce';
    }
  >;
  /** 可观测采样（完整 rules 存 request carrier） */
  sample_rules: PolicyGatewayRuleV1[];
}

export type PolicyGatewayDispatchAction = 'allow' | 'hold';

export interface PolicyGatewayDispatchDecision {
  action: PolicyGatewayDispatchAction;
  channel: PolicyGatewayChannel;
  target: string;
  mode: ToolGovernanceMode;
  matchedRuleId?: string;
  reason?: string;
  governanceAuditId?: string;
  logLine: string;
}
