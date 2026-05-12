import type { ImpactAnalysisResult } from './impact-analysis.types';

/**
 * 局部重规划请求：只重跑受影响 + 下游槽位（对接 Orchestrator / Repair 的占位契约）。
 */
export type PartialReplanScopeMode = 'affected-and-downstream' | 'affected-only';

export interface PartialReplanRequest {
  tripId: string;
  impact: ImpactAnalysisResult;
  scopeMode: PartialReplanScopeMode;
  /** 触发事件 id（Trace / 审计） */
  triggerEventId?: string;
}
