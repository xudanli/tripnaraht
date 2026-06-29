/**
 * Harness Control P3：Subagent 权限沙箱 — tool 能力不可经 message / 旁路字段传递。
 * 静态 SubAgent → MCP cap 矩阵 + 消息内嵌 escalation 剥离。
 */

import type { SubAgentType } from '../interfaces/trip-plan.interface';
import { AGENTIC_MCP_LLM_EXPOSE_WHITELIST } from '../assistants/planning-assistant/services/mcp-openai-tools.adapter';
import { PHASE_AGENTIC_MCP_CAP } from './agentic-mcp-runtime-cap.util';

/** 不可经 agent 间 message / 旁路 JSON 传递的能力 escalation 键 */
export const TOOL_CAPABILITY_ESCALATION_KEYS = new Set([
  'tool_policies',
  'approved_tool_invocations',
  'agentic_approved_tool_invocations',
  'agentic_runtime_tool_allowlist',
  'toolAllowlist',
  'runtimeMcpToolAllowlist',
  'governanceApprovedToolInvocations',
  '__executionPolicyGatewayPolicies',
  '__executionPolicyGatewayApproved',
]);

const READONLY_ASSESS_TOOLS = [
  'weather.getCurrentWeather',
  'weather.getWeatherByDatetimeRange',
  'exa.webSearch',
  'exa.webSearchAdvanced',
] as const;

/** SubAgent 静态 MCP 能力上限（须在审计白名单内；Orchestrator 不额外收窄） */
export const SUBAGENT_MCP_TOOL_CAP: Record<SubAgentType, readonly string[] | 'all'> = {
  Orchestrator: 'all',
  Planner: PHASE_AGENTIC_MCP_CAP.planning,
  Gatekeeper: READONLY_ASSESS_TOOLS,
  Compliance: READONLY_ASSESS_TOOLS,
  LocalInsight: PHASE_AGENTIC_MCP_CAP.repair,
  CoreDecision: ['weather.getCurrentWeather', 'weather.getWeatherByDatetimeRange'],
  Narrator: [],
  HallucinationDetection: [],
  'DecisionOS.IntentCompiler': [],
};

export interface SubagentPermissionSandboxObservabilityV1 {
  schemaId: 'tripnara.subagent_permission_sandbox@v1';
  version: 1;
  enabled: boolean;
  active_sub_agent: SubAgentType;
  message_escalation_strips: number;
  option_escalation_strips: number;
  chain_messages_scanned: number;
  chain_message_strips: number;
  orchestration_handoff_strips: number;
  mcp_cap_applied: boolean;
  mcp_tools_before_cap: number | null;
  mcp_tools_after_cap: number | null;
}

export function parseSubagentPermissionSandboxEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.HARNESS_SUBAGENT_SANDBOX ?? env.SUBAGENT_PERMISSION_SANDBOX;
  const v = String(raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function resolveSubagentMcpCapSet(subAgent: SubAgentType): Set<string> {
  const cap = SUBAGENT_MCP_TOOL_CAP[subAgent] ?? [];
  if (cap === 'all') {
    return new Set(AGENTIC_MCP_LLM_EXPOSE_WHITELIST);
  }
  const out = new Set<string>();
  for (const name of cap) {
    if (AGENTIC_MCP_LLM_EXPOSE_WHITELIST.has(name)) out.add(name);
  }
  return out;
}

export function constrainMcpAllowlistForSubAgent(
  subAgent: SubAgentType,
  allowlist: Iterable<string> | undefined | null,
): string[] {
  const cap = resolveSubagentMcpCapSet(subAgent);
  if (!allowlist) return [...cap];
  const narrowed: string[] = [];
  for (const name of allowlist) {
    const n = String(name ?? '').trim();
    if (n && cap.has(n)) narrowed.push(n);
  }
  return narrowed.sort();
}

function containsEscalationKey(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).some((k) => TOOL_CAPABILITY_ESCALATION_KEYS.has(k));
}

/** 递归剥离 escalation 键；返回是否发生过剥离 */
export function stripToolCapabilityEscalationDeep(
  value: unknown,
  violations: string[],
  path = '',
): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item, i) =>
      stripToolCapabilityEscalationDeep(item, violations, `${path}[${i}]`),
    );
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (TOOL_CAPABILITY_ESCALATION_KEYS.has(k)) {
      violations.push(path ? `${path}.${k}` : k);
      continue;
    }
    out[k] = stripToolCapabilityEscalationDeep(v, violations, path ? `${path}.${k}` : k);
  }
  return out;
}

function extractBalancedJsonBlocks(text: string): Array<{ start: number; end: number; raw: string }> {
  const blocks: Array<{ start: number; end: number; raw: string }> = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      if (text[j] === '{') depth += 1;
      else if (text[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          const raw = text.slice(i, j + 1);
          try {
            JSON.parse(raw);
            blocks.push({ start: i, end: j + 1, raw });
          } catch {
            /* skip invalid JSON */
          }
          break;
        }
      }
    }
  }
  return blocks;
}

/** 扫描用户 message 内嵌 JSON / code block，剥离 escalation 字段 */
export function sanitizeMessageForSubagentSandbox(message: string): {
  sanitizedMessage: string;
  stripCount: number;
  violations: string[];
} {
  const violations: string[] = [];
  let sanitized = String(message ?? '');
  let stripCount = 0;

  const trySanitizeJsonBlock = (block: string): string | null => {
    try {
      const parsed = JSON.parse(block) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      if (!containsEscalationKey(parsed as Record<string, unknown>)) return null;
      const nextViolations: string[] = [];
      stripToolCapabilityEscalationDeep(parsed, nextViolations);
      if (nextViolations.length === 0) return null;
      violations.push(...nextViolations);
      stripCount += nextViolations.length;
      const cleaned = stripToolCapabilityEscalationDeep(parsed, []);
      return JSON.stringify(cleaned);
    } catch {
      return null;
    }
  };

  sanitized = sanitized.replace(/```(?:json)?\s*([\s\S]*?)```/gi, (full, inner: string) => {
    const next = trySanitizeJsonBlock(String(inner).trim());
    return next ? '```json\n' + next + '\n```' : full;
  });

  const blocks = extractBalancedJsonBlocks(sanitized);
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    const next = trySanitizeJsonBlock(block.raw);
    if (next) {
      sanitized = sanitized.slice(0, block.start) + next + sanitized.slice(block.end);
    }
  }

  return { sanitizedMessage: sanitized, stripCount, violations };
}

export function buildSubagentPermissionSandboxObservability(params: {
  enabled: boolean;
  subAgent: SubAgentType;
  messageEscalationStrips: number;
  optionEscalationStrips: number;
  chainMessagesScanned?: number;
  chainMessageStrips?: number;
  orchestrationHandoffStrips?: number;
  mcpCapApplied: boolean;
  mcpToolsBeforeCap?: number | null;
  mcpToolsAfterCap?: number | null;
}): SubagentPermissionSandboxObservabilityV1 {
  return {
    schemaId: 'tripnara.subagent_permission_sandbox@v1',
    version: 1,
    enabled: params.enabled,
    active_sub_agent: params.subAgent,
    message_escalation_strips: params.messageEscalationStrips,
    option_escalation_strips: params.optionEscalationStrips,
    chain_messages_scanned: params.chainMessagesScanned ?? 0,
    chain_message_strips: params.chainMessageStrips ?? 0,
    orchestration_handoff_strips: params.orchestrationHandoffStrips ?? 0,
    mcp_cap_applied: params.mcpCapApplied,
    mcp_tools_before_cap: params.mcpToolsBeforeCap ?? null,
    mcp_tools_after_cap: params.mcpToolsAfterCap ?? null,
  };
}
