/**
 * Subagent 权限沙箱请求级上下文（Harness Control P3 主链 SSOT）。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { SubAgentType } from '../interfaces/trip-plan.interface';
import {
  buildSubagentPermissionSandboxObservability,
  constrainMcpAllowlistForSubAgent,
  parseSubagentPermissionSandboxEnabled,
  sanitizeMessageForSubagentSandbox,
  type SubagentPermissionSandboxObservabilityV1,
} from './subagent-permission-sandbox.util';
import {
  resolveOrchestrationSubAgentFromRequest,
  sanitizeOrchestrationHandoffValue,
  sanitizeSubagentMessageChain,
} from './subagent-message-chain-sandbox.util';

export type RouteAndRunSubagentSandboxCarrier = RouteAndRunRequestDto & {
  __subagentPermissionSandboxV1?: SubagentPermissionSandboxObservabilityV1;
  /** hydrate 后用于 Agentic / MCP 的 sanitized message */
  __subagentSandboxSanitizedMessage?: string;
  __subagentSandboxOrchestrationHandoffStrips?: number;
};

export function readSubagentPermissionSandboxObservability(
  request: RouteAndRunSubagentSandboxCarrier,
): SubagentPermissionSandboxObservabilityV1 | undefined {
  return request.__subagentPermissionSandboxV1;
}

export function readSubagentSandboxSanitizedMessage(
  request: RouteAndRunSubagentSandboxCarrier,
): string | undefined {
  return request.__subagentSandboxSanitizedMessage;
}

/** Agentic fast path 默认 actor；编排主链可覆写 subAgent */
export function resolveDefaultAgenticSubAgent(): SubAgentType {
  return 'Planner';
}

/**
 * tick 入口：剥离 message / options 内 tool 能力 escalation，挂载 observability。
 * 不修改 memory SSOT；仅收窄本请求旁路字段。
 */
export function readSubagentSandboxOrchestrationHandoffStrips(
  request: RouteAndRunSubagentSandboxCarrier,
): number {
  return request.__subagentSandboxOrchestrationHandoffStrips ?? 0;
}

export function recordSubagentSandboxOrchestrationHandoffStrips(
  request: RouteAndRunSubagentSandboxCarrier,
  stripCount: number,
): void {
  if (!stripCount) return;
  request.__subagentSandboxOrchestrationHandoffStrips =
    (request.__subagentSandboxOrchestrationHandoffStrips ?? 0) + stripCount;
  const obs = request.__subagentPermissionSandboxV1;
  if (obs) {
    obs.orchestration_handoff_strips = request.__subagentSandboxOrchestrationHandoffStrips;
  }
}

export function sanitizeOrchestrationHandoffForRequest(
  request: RouteAndRunSubagentSandboxCarrier,
  value: unknown,
  env: Record<string, string | undefined> = process.env,
): unknown {
  if (!parseSubagentPermissionSandboxEnabled(env)) return value;
  const { value: cleaned, stripCount } = sanitizeOrchestrationHandoffValue(value);
  recordSubagentSandboxOrchestrationHandoffStrips(request, stripCount);
  return cleaned;
}

export function hydrateSubagentPermissionSandboxInPlace(
  request: RouteAndRunSubagentSandboxCarrier,
  subAgent: SubAgentType = resolveOrchestrationSubAgentFromRequest(request.options),
  env: Record<string, string | undefined> = process.env,
): SubagentPermissionSandboxObservabilityV1 {
  const enabled = parseSubagentPermissionSandboxEnabled(env);
  let messageEscalationStrips = 0;
  let optionEscalationStrips = 0;
  let chainMessagesScanned = 0;
  let chainMessageStrips = 0;

  if (enabled) {
    const msg = sanitizeMessageForSubagentSandbox(request.message ?? '');
    if (msg.stripCount > 0) {
      messageEscalationStrips = msg.stripCount;
      request.__subagentSandboxSanitizedMessage = msg.sanitizedMessage;
    }

    const chain = sanitizeSubagentMessageChain(request.conversation_context?.recent_messages);
    chainMessagesScanned = chain.messagesScanned;
    chainMessageStrips = chain.stripCount;
    if (chain.stripCount > 0 && request.conversation_context) {
      request.conversation_context.recent_messages = chain.messages;
    }

    if (request.options?.agentic_runtime_tool_allowlist?.length) {
      optionEscalationStrips += 1;
      delete request.options.agentic_runtime_tool_allowlist;
    }
  }

  const obs = buildSubagentPermissionSandboxObservability({
    enabled,
    subAgent,
    messageEscalationStrips,
    optionEscalationStrips,
    chainMessagesScanned,
    chainMessageStrips,
    orchestrationHandoffStrips: request.__subagentSandboxOrchestrationHandoffStrips ?? 0,
    mcpCapApplied: false,
  });
  request.__subagentPermissionSandboxV1 = obs;
  return obs;
}

/** Agentic MCP cap 第二道闸：按 SubAgent 静态矩阵收窄 allowlist */
export function applySubagentSandboxToMcpAllowlist(
  request: RouteAndRunSubagentSandboxCarrier,
  allowlist: string[] | undefined,
  subAgent: SubAgentType = resolveDefaultAgenticSubAgent(),
): string[] | undefined {
  const obs = request.__subagentPermissionSandboxV1;
  if (!obs?.enabled) return allowlist;

  const before = allowlist?.length ?? null;
  const narrowed = constrainMcpAllowlistForSubAgent(subAgent, allowlist);
  obs.active_sub_agent = subAgent;
  obs.mcp_cap_applied = true;
  obs.mcp_tools_before_cap = before;
  obs.mcp_tools_after_cap = narrowed.length;
  return narrowed.length ? narrowed : undefined;
}
