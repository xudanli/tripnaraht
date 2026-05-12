// src/agent/runtime/testing/semantic-replay-golden-path.util.ts
/** 黄金路径拓扑 diff 切片；CI 推荐通过 `semantic-execution-graph-validation.facade` 单入口调用。 */
import type { ExecutionTimelineEvent } from '../execution-timeline-event.interface';
import topology from './fixtures/semantic-replay-golden-path/execution_graph_topology.json';

type RoleMatch = {
  operation: string;
  event_type?: string;
  parent_span_must_be_null?: boolean;
};

type SemanticRoleDef = {
  description?: string;
  match_any: RoleMatch[];
};

type TopologyFile = {
  semantic_roles: Record<string, SemanticRoleDef>;
  expected_parent_edges: Array<{ child_role: string; parent_role: string }>;
};

const T = topology as TopologyFile;

const ROLE_KEYS_SORTED = Object.keys(T.semantic_roles).sort();

/** 稳定 tie-break：同 startedAt 时按 spanId，避免输入数组顺序导致 resolveRoleLast 漂移 */
function compareEventTemporal(a: ExecutionTimelineEvent, b: ExecutionTimelineEvent): number {
  const ta = a.startedAt ?? '';
  const tb = b.startedAt ?? '';
  if (ta !== tb) {
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  }
  return a.spanId < b.spanId ? -1 : a.spanId > b.spanId ? 1 : 0;
}

const EDGES_SORTED = [...T.expected_parent_edges].sort((a, b) => {
  if (a.child_role !== b.child_role) {
    return a.child_role < b.child_role ? -1 : 1;
  }
  return a.parent_role < b.parent_role ? -1 : a.parent_role > b.parent_role ? 1 : 0;
});

function eventMatchesFingerprint(e: ExecutionTimelineEvent, m: RoleMatch): boolean {
  if (e.operation !== m.operation) {
    return false;
  }
  if (m.event_type !== undefined && e.eventType !== m.event_type) {
    return false;
  }
  if (m.parent_span_must_be_null && e.parentSpanId !== null) {
    return false;
  }
  return true;
}

function matchesRole(e: ExecutionTimelineEvent, role: string): boolean {
  const def = T.semantic_roles[role];
  if (!def?.match_any?.length) {
    return false;
  }
  return def.match_any.some((m) => eventMatchesFingerprint(e, m));
}

/** 同一 role 多条时按时间序稳定排序后取最后一条 */
function resolveRoleEventsSorted(events: ExecutionTimelineEvent[], role: string): ExecutionTimelineEvent[] {
  const list = events.filter((e) => matchesRole(e, role));
  return [...list].sort(compareEventTemporal);
}

function resolveRoleLast(events: ExecutionTimelineEvent[], role: string): ExecutionTimelineEvent | null {
  const sorted = resolveRoleEventsSorted(events, role);
  return sorted.length ? sorted[sorted.length - 1]! : null;
}

function roleLabelForSpanId(
  spanId: string | null,
  resolved: Map<string, string>,
): string {
  if (spanId === null) {
    return 'null';
  }
  const role = resolved.get(spanId);
  return role ?? `unresolved(${spanId.slice(0, 8)}…)`;
}

export type SemanticTopologyDiff = {
  ok: boolean;
  /** 人类可读漂移行，供 CI / 日志直接展示 */
  lines: string[];
};

/**
 * 对比事件序列与 fixture 中的语义角色与期望父子边，不校验 spanId 相等性。
 * 漂移时返回 Expected / Actual 行，而非单纯 assert(false)。
 *
 * **Diff determinism**：在相同事件集合与相同逻辑含义下，`lines` 顺序与文案稳定——
 * 角色遍历按字典序、边遍历按 (child_role, parent_role)、同 role 多事件按 (startedAt, spanId) 取末条，
 * 不因输入数组元素顺序变化而漂移。
 */
export function diffSemanticGoldPathTopology(events: ExecutionTimelineEvent[]): SemanticTopologyDiff {
  const lines: string[] = [];
  const resolved = new Map<string, string>();

  for (const role of ROLE_KEYS_SORTED) {
    const last = resolveRoleLast(events, role);
    if (!last) {
      lines.push(
        `Drift: missing event for semantic role "${role}" (${T.semantic_roles[role]?.description ?? 'no description'})`,
      );
      continue;
    }
    resolved.set(last.spanId, role);
  }

  for (const edge of EDGES_SORTED) {
    const child = resolveRoleLast(events, edge.child_role);
    const parent = resolveRoleLast(events, edge.parent_role);
    if (!child) {
      lines.push(
        `Drift: edge ${edge.child_role}←${edge.parent_role}: missing child role "${edge.child_role}"`,
      );
      continue;
    }
    if (!parent) {
      lines.push(
        `Drift: edge ${edge.child_role}←${edge.parent_role}: missing parent role "${edge.parent_role}"`,
      );
      continue;
    }
    const expectedParentSpanId = parent.spanId;
    const actualParentSpanId = child.parentSpanId;
    if (actualParentSpanId === expectedParentSpanId) {
      continue;
    }
    const actualRole =
      actualParentSpanId === null ? 'null' : resolved.get(actualParentSpanId) ?? null;
    lines.push(`Expected: ${edge.child_role}.parent = ${edge.parent_role}`);
    lines.push(
      `Actual: ${edge.child_role}.parent = ${actualRole ?? roleLabelForSpanId(actualParentSpanId, resolved)}`,
    );
  }

  return { ok: lines.length === 0, lines };
}

/**
 * 最小图完备性：悬空的 parentSpanId、未映射到任一 fixture 角色的 span。
 * 不与 topology 重复「黄金边 Expected/Actual」；缺 role 仍由 topology 报告。
 */
export function diffSemanticGraphCompleteness(events: ExecutionTimelineEvent[]): SemanticTopologyDiff {
  const lines: string[] = [];
  const spanIds = new Set(events.map((e) => e.spanId));

  const withParent = events.filter((e) => e.parentSpanId !== null);
  for (const e of [...withParent].sort((a, b) => a.spanId.localeCompare(b.spanId))) {
    const pid = e.parentSpanId;
    if (pid && !spanIds.has(pid)) {
      lines.push(
        `Completeness: dangling parent (child=${e.spanId.slice(0, 12)}… parent=${pid.slice(0, 12)}… not in graph)`,
      );
    }
  }

  for (const e of [...events].sort(compareEventTemporal)) {
    if (e.eventType === 'span' && !ROLE_KEYS_SORTED.some((r) => matchesRole(e, r))) {
      lines.push(`Completeness: unmapped span (operation=${e.operation}, span=${e.spanId.slice(0, 12)}…)`);
    }
  }

  return { ok: lines.length === 0, lines };
}

export class SemanticTopologyDriftError extends Error {
  readonly diffLines: string[];
  constructor(lines: string[]) {
    super(lines.join('\n'));
    this.name = 'SemanticTopologyDriftError';
    this.diffLines = lines;
  }
}

export function assertSemanticGoldPathTopology(events: ExecutionTimelineEvent[]): void {
  const { ok, lines } = diffSemanticGoldPathTopology(events);
  if (!ok) {
    throw new SemanticTopologyDriftError(lines);
  }
}

/** @deprecated 使用 assertSemanticGoldPathTopology；旧名保留以免外部引用断裂 */
export function assertMinimalGoldPathTopology(events: ExecutionTimelineEvent[]): void {
  assertSemanticGoldPathTopology(events);
}
