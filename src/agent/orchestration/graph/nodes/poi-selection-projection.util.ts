import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';

/** POI 选点阶段内部工作区键（禁止挂到 OrchestratorState / DSO 顶层） */
export const POI_SELECTION_WORKSPACE_KEY = '__poiSelectionWorkspace' as const;

const POI_WORKSPACE_PREFIX = '__poi';

/**
 * 进入 POI_SELECTION 前：剥离上轮残留的旁路工作区键（Lint 闭环）。
 */
export function stripPoiSelectionWorkspaceKeys(root: Record<string, unknown>): void {
  delete root[POI_SELECTION_WORKSPACE_KEY];
  for (const k of Object.keys(root)) {
    if (k.startsWith(POI_WORKSPACE_PREFIX) && k !== POI_SELECTION_WORKSPACE_KEY) {
      delete root[k];
    }
  }
}

export function sanitizeOrchestratorStateBeforePoiSelection(state: OrchestratorState): void {
  stripPoiSelectionWorkspaceKeys(state as unknown as Record<string, unknown>);
  const meta = state.metadata as Record<string, unknown> | undefined;
  if (meta) {
    stripPoiSelectionWorkspaceKeys(meta);
  }
}

/**
 * 离开 POI_SELECTION 后：再次熔断工作区键；仅保留 research_data.poi_evidence 与合规 metadata 摘要。
 */
export function sanitizeOrchestratorStateAfterPoiSelection(state: OrchestratorState): void {
  sanitizeOrchestratorStateBeforePoiSelection(state);
}
