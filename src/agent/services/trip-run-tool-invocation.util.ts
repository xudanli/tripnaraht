/**
 * 从 route_and_run 响应 / 会话 summary 提取 skill / MCP / live tool 调用摘要，供 TripRun.metadata 与 Admin 展示。
 */

export type ToolInvocationKind = 'skill' | 'mcp' | 'live_tool' | 'other';

export type ToolInvocationItem = {
  toolId: string;
  kind: ToolInvocationKind;
  ok: boolean | null;
  latencyMs: number | null;
  error: string | null;
};

export type ToolInvocationSummary = {
  toolCallsCount: number;
  skills: ToolInvocationItem[];
  mcp: ToolInvocationItem[];
  liveTools: ToolInvocationItem[];
  other: ToolInvocationItem[];
  stepsExecuted: string[];
  skillNames: string[];
  mcpNames: string[];
};

function classifyToolId(toolId: string): ToolInvocationKind {
  const id = toolId.toLowerCase();
  if (id.startsWith('skill.') || id.includes('.skill.') || id.startsWith('skill:')) {
    return 'skill';
  }
  if (id.includes('mcp.') || id.startsWith('mcp:') || id.includes('live_tool.mcp')) {
    return 'mcp';
  }
  if (id.startsWith('live_tool.') || id.startsWith('live.')) {
    return 'live_tool';
  }
  return 'other';
}

function asItem(row: Record<string, unknown>): ToolInvocationItem | null {
  const toolId = String(row.tool_id ?? row.toolId ?? row.name ?? row.skill ?? '').trim();
  if (!toolId) return null;
  const latencyRaw = row.latency_ms ?? row.latencyMs;
  const latencyMs =
    typeof latencyRaw === 'number' && Number.isFinite(latencyRaw) ? latencyRaw : null;
  const ok =
    typeof row.ok === 'boolean'
      ? row.ok
      : typeof row.success === 'boolean'
        ? row.success
        : null;
  const error =
    typeof row.error === 'string'
      ? row.error
      : typeof row.message === 'string' && ok === false
        ? row.message
        : null;
  return {
    toolId,
    kind: classifyToolId(toolId),
    ok,
    latencyMs,
    error,
  };
}

function collectAuditRows(source: unknown): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  const visit = (node: unknown, depth = 0) => {
    if (depth > 6 || node == null) return;
    if (Array.isArray(node)) {
      for (const el of node) {
        if (el && typeof el === 'object' && !Array.isArray(el)) {
          const obj = el as Record<string, unknown>;
          if (obj.tool_id != null || obj.toolId != null) {
            rows.push(obj);
          } else {
            visit(el, depth + 1);
          }
        }
      }
      return;
    }
    if (typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (
        /live_sensor_audit|tool_audit|mcp_audit|skill_audit|tool_invocations/i.test(k) &&
        Array.isArray(v)
      ) {
        visit(v, depth + 1);
      } else if (k === 'live_hotel_audit' && v && typeof v === 'object') {
        const audit = v as Record<string, unknown>;
        rows.push({
          tool_id: audit.tool_id ?? 'live_tool.mcp.hotel',
          ok: audit.ok,
          latency_ms: audit.latency_ms ?? audit.latencyMs,
          error: audit.error,
        });
      } else if (v && typeof v === 'object') {
        visit(v, depth + 1);
      }
    }
  };
  visit(source);
  return rows;
}

function collectStepsExecuted(source: unknown): string[] {
  const out: string[] = [];
  const visit = (node: unknown, depth = 0) => {
    if (depth > 5 || node == null) return;
    if (Array.isArray(node)) {
      for (const el of node) {
        if (typeof el === 'string' && el.trim()) out.push(el.trim());
        else if (el && typeof el === 'object') {
          const obj = el as Record<string, unknown>;
          const name = obj.step ?? obj.name ?? obj.type ?? obj.skill ?? obj.id;
          if (typeof name === 'string' && name.trim()) out.push(name.trim());
        }
      }
      return;
    }
    if (typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (/steps_executed|stepsExecuted|skills_invoked|skillsInvoked/i.test(k)) {
        visit(v, depth + 1);
      } else if (v && typeof v === 'object') {
        visit(v, depth + 1);
      }
    }
  };
  visit(source);
  return [...new Set(out)].slice(0, 40);
}

export function buildToolInvocationSummary(source: unknown): ToolInvocationSummary | null {
  if (!source) return null;
  const items: ToolInvocationItem[] = [];
  const seen = new Set<string>();
  for (const row of collectAuditRows(source)) {
    const item = asItem(row);
    if (!item) continue;
    const key = `${item.toolId}|${item.ok}|${item.latencyMs}|${item.error ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  const stepsExecuted = collectStepsExecuted(source);

  // observability.tool_calls 仅有计数时也保留
  let toolCallsCount = items.length;
  if (source && typeof source === 'object') {
    const obs = (source as any).observability;
    if (obs && typeof obs.tool_calls === 'number' && obs.tool_calls > toolCallsCount) {
      toolCallsCount = obs.tool_calls;
    }
  }

  if (items.length === 0 && stepsExecuted.length === 0 && toolCallsCount === 0) {
    return null;
  }

  const skills = items.filter((i) => i.kind === 'skill');
  const mcp = items.filter((i) => i.kind === 'mcp');
  const liveTools = items.filter((i) => i.kind === 'live_tool');
  const other = items.filter((i) => i.kind === 'other');

  return {
    toolCallsCount,
    skills,
    mcp,
    liveTools,
    other,
    stepsExecuted,
    skillNames: [...new Set(skills.map((s) => s.toolId))],
    mcpNames: [...new Set(mcp.map((m) => m.toolId))],
  };
}

/** 写入 TripRun.metadata 的可序列化块 */
export function buildToolInvocationMetadataPatch(source: unknown): Record<string, unknown> {
  const summary = buildToolInvocationSummary(source);
  if (!summary) return {};
  return {
    tool_invocation_summary: summary,
    skills_invoked: summary.skillNames,
    mcp_invoked: summary.mcpNames,
    tool_calls_count: summary.toolCallsCount,
  };
}
