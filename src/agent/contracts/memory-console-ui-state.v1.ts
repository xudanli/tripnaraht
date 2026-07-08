/**
 * Memory OS P0 — 前端 UI 状态映射（v1）
 * - Memory Console 列表/删除确认文案键
 * - Gate / Evidence Drawer 对 constraint_sink 的消费
 * - 与 `observability.memory_contract.constraint_sink` 对账
 */

export type MemoryConsoleSectionV1 =
  | 'l1'
  | 'l0'
  | 'l2'
  | 'trip_patches'
  | 'decision_ledger_causality'
  | 'export';

export type ConstraintSinkUiAnchorV1 = {
  patch_ids: string[];
  applied_keys: string[];
  headline_key: string;
  subline_key?: string;
  /** Evidence Drawer 打开时携带 */
  drawer_tab: 'memory' | 'constraint_sink';
};

export type MemoryConsoleUiStateV1 = {
  enabled: boolean;
  sections: MemoryConsoleSectionV1[];
  trip_patches_count: number;
  decision_ledger_links_count: number;
  l1_present: boolean;
  l2_count: number;
};

export type MemoryContractConstraintSinkObsV1 = {
  hydrated?: boolean;
  applied_keys?: string[];
  patch_ids?: string[];
  overridden_by_request_keys?: string[];
};

/** route_and_run 响应 → Gate 卡片「依据行」 */
export function deriveConstraintSinkUiAnchorV1(
  sink: MemoryContractConstraintSinkObsV1 | null | undefined,
): ConstraintSinkUiAnchorV1 | null {
  if (!sink?.hydrated || !sink.patch_ids?.length) return null;
  const keys = sink.applied_keys ?? [];
  const hasAvoid = keys.some(k => k.includes('guardian') || k.includes('negative') || k.includes('style'));
  const hasPivot = keys.includes('destination');
  return {
    patch_ids: sink.patch_ids,
    applied_keys: keys,
    headline_key: hasPivot
      ? 'memory.ui.constraint_sink.pivot_applied'
      : hasAvoid
        ? 'memory.ui.constraint_sink.avoidance_applied'
        : 'memory.ui.constraint_sink.preferences_applied',
    subline_key: 'memory.ui.constraint_sink.view_in_console',
    drawer_tab: 'constraint_sink',
  };
}

/** GET /agent/memory/v1/console → 侧栏/设置页结构 */
export function deriveMemoryConsoleUiStateV1(input: {
  feature_flags?: { constraint_sink?: boolean; memory_console?: boolean; decision_semantics?: boolean };
  l1?: unknown | null;
  l2_recent?: unknown[];
  trip_constraints?: { patches?: unknown[] } | null;
  decision_ledger_causality?: { links?: unknown[] } | null;
}): MemoryConsoleUiStateV1 {
  const enabled = input.feature_flags?.memory_console === true;
  const patches = input.trip_constraints?.patches?.length ?? 0;
  const ledgerLinks = input.decision_ledger_causality?.links?.length ?? 0;
  const sections: MemoryConsoleSectionV1[] = ['l1', 'l0', 'l2', 'export'];
  if (input.feature_flags?.constraint_sink && patches > 0) {
    sections.splice(3, 0, 'trip_patches');
  }
  if (ledgerLinks > 0) {
    sections.splice(sections.length - 1, 0, 'decision_ledger_causality');
  }
  return {
    enabled,
    sections,
    trip_patches_count: patches,
    decision_ledger_links_count: ledgerLinks,
    l1_present: input.l1 != null,
    l2_count: input.l2_recent?.length ?? 0,
  };
}

export const MEMORY_CONSOLE_UI_DEFAULT_ZH: Record<string, string> = {
  'memory.ui.console.title': '我的旅行记忆',
  'memory.ui.console.l1': '长期偏好',
  'memory.ui.console.l0': '基础资料',
  'memory.ui.console.l2': '近期路线决策',
  'memory.ui.console.trip_patches': '本行程偏好更新',
  'memory.ui.console.decision_ledger_causality': '决策账本关联',
  'memory.ui.console.decision_ledger_link_row': 'Ledger 节点 → 用户决策',
  'memory.ui.console.export': '导出我的数据',
  'memory.ui.console.delete_l1_confirm': '这将清空 AI 记住的长期旅行偏好，不会影响当前对话。',
  'memory.ui.console.delete_patch_confirm': '删除后，后续规划将不再自动应用这条偏好更新。',
  'memory.ui.constraint_sink.pivot_applied': '已按你在对话中的改主意更新方向',
  'memory.ui.constraint_sink.avoidance_applied': '已记住你要避开的区域/类型',
  'memory.ui.constraint_sink.preferences_applied': '已应用对话中的行程偏好',
  'memory.ui.constraint_sink.view_in_console': '在记忆看板中查看或删除',
  'memory.ui.gate.sink_anchor_label': '依据：对话偏好',
};
