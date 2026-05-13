/**
 * Agentic MCP 工具治理（HITL / 执行闸）— 与 TripTaskMemory.constraints.tool_policies 对齐。
 * 不写入账本；仅影响 McpAgentExecutorService 是否真正调用 dispatcher。
 */

export type ToolGovernanceMode = 'auto' | 'ask' | 'deny';

export interface ToolGovernancePolicyEntry {
  mode: ToolGovernanceMode;
  reason?: string;
}

/** FEATURE_AGENTIC_GOVERNANCE_HITL 开启时并入的默认策略（可被内存覆盖）。 */
export const DEFAULT_HITL_TOOL_POLICIES: Record<string, ToolGovernancePolicyEntry> = {
  'exa.deepSearch': { mode: 'ask', reason: 'High token consumption / deep retrieval' },
};

export function parseAgenticGovernanceHitlFlag(raw?: string | null): boolean {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function isPolicyEntry(x: unknown): x is ToolGovernancePolicyEntry {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const m = String((x as { mode?: unknown }).mode ?? '').trim().toLowerCase();
  return m === 'auto' || m === 'ask' || m === 'deny';
}

/**
 * 将 TripTask.constraints.tool_policies（弱类型）规范化为条目；非法项丢弃。
 */
export function normalizeToolPoliciesFromConstraints(
  raw: unknown,
): Record<string, ToolGovernancePolicyEntry> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, ToolGovernancePolicyEntry> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const name = String(k).trim();
    if (!name) continue;
    if (!isPolicyEntry(v)) continue;
    const mode = String((v as ToolGovernancePolicyEntry).mode).trim().toLowerCase() as ToolGovernanceMode;
    out[name] = {
      mode,
      reason: typeof (v as { reason?: unknown }).reason === 'string' ? String((v as { reason: string }).reason) : undefined,
    };
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * hitlFeatureEnabled 为 true 时先铺默认 ask/deny，再由内存中的 tool_policies 覆盖。
 * 为 false 时仅应用内存策略（便于在未开 Feature 时由运营显式注入 deny）。
 */
export function mergeAgenticToolPolicies(
  hitlFeatureEnabled: boolean,
  fromMemoryConstraints?: unknown,
): Record<string, ToolGovernancePolicyEntry> {
  const base: Record<string, ToolGovernancePolicyEntry> = hitlFeatureEnabled ? { ...DEFAULT_HITL_TOOL_POLICIES } : {};
  const mem = normalizeToolPoliciesFromConstraints(fromMemoryConstraints) ?? {};
  return { ...base, ...mem };
}

export function policyForMcpTool(
  mcpToolName: string,
  policies: Record<string, ToolGovernancePolicyEntry> | undefined,
): ToolGovernancePolicyEntry {
  const p = policies?.[mcpToolName];
  return p ?? { mode: 'auto' };
}

/** 用户确认后的放行项；写入 TripTask.constraints.approved_tool_invocations 或 route_and_run.options.agentic_approved_tool_invocations。 */
export interface GovernanceApprovedToolInvocation {
  /** OpenAI tool_calls[].id，与挂起 envelope 中 tool_call_id 对齐 */
  toolCallId: string;
  /** 若填写则必须与当前 MCP toolName 一致才放行，防止 id 复用误放行 */
  mcpToolName?: string;
}

function readToolCallId(obj: Record<string, unknown>): string | undefined {
  const a = obj.tool_call_id ?? obj.toolCallId;
  if (typeof a === 'string' && a.trim()) return a.trim();
  return undefined;
}

function readOptionalMcpToolName(obj: Record<string, unknown>): string | undefined {
  const a = obj.mcp_tool_name ?? obj.mcpToolName;
  if (typeof a === 'string' && a.trim()) return a.trim();
  return undefined;
}

/**
 * 解析 constraints / options 中的 approved_tool_invocations（弱类型）。
 * 支持：`string[]`（仅 id）、`{ tool_call_id, mcp_tool_name? }[]`。
 */
export function normalizeApprovedToolInvocations(raw: unknown): GovernanceApprovedToolInvocation[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  const out: GovernanceApprovedToolInvocation[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const id = item.trim();
      if (id) out.push({ toolCallId: id });
      continue;
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const toolCallId = readToolCallId(item as Record<string, unknown>);
      if (!toolCallId) continue;
      const mcpToolName = readOptionalMcpToolName(item as Record<string, unknown>);
      out.push(mcpToolName ? { toolCallId, mcpToolName } : { toolCallId });
    }
  }
  return out;
}

/**
 * 合并多路放行列表；同 toolCallId 后者覆盖前者（便于 options 覆盖内存草稿）。
 */
export function mergeApprovedToolInvocations(...sources: unknown[]): GovernanceApprovedToolInvocation[] {
  const map = new Map<string, GovernanceApprovedToolInvocation>();
  for (const src of sources) {
    for (const e of normalizeApprovedToolInvocations(src)) {
      map.set(e.toolCallId, e);
    }
  }
  return [...map.values()];
}

/** `ask` 策略下是否因预审批跳过执行闸（仍走真实 MCP）。 */
export function isGovernanceAskPreApproved(
  approved: GovernanceApprovedToolInvocation[] | undefined,
  toolCallId: string | undefined,
  mcpToolName: string,
): boolean {
  if (!toolCallId || !approved?.length) return false;
  const hit = approved.find((a) => a.toolCallId === toolCallId);
  if (!hit) return false;
  if (hit.mcpToolName != null && hit.mcpToolName !== mcpToolName) return false;
  return true;
}

/** 不调用 MCP：供 LLM / UI 识别的治理挂起或拒绝包（success=false）。 */
export function buildToolGovernanceHoldEnvelope(
  mcpToolName: string,
  mode: 'ask' | 'deny',
  reason?: string,
  toolCallId?: string,
): {
  success: false;
  data: Record<string, unknown>;
  error: string;
  sideEffects: Record<string, unknown>;
  confidence: number;
} {
  return {
    success: false,
    data: {
      _system_status: mode === 'ask' ? 'AWAITING_APPROVAL' : 'GOVERNANCE_DENY',
      mcpToolName,
      ...(toolCallId ? { tool_call_id: toolCallId } : {}),
      governance_mode: mode,
      reason: reason ?? null,
      instruction:
        mode === 'ask'
          ? '本次工具调用需人工确认后再执行；请停止自动重试并向用户说明等待审批。'
          : '策略禁止执行该工具。',
    },
    error: mode === 'ask' ? 'NEED_USER_APPROVAL' : 'GOVERNANCE_DENY',
    sideEffects: {},
    confidence: 0,
  };
}

