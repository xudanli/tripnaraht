/**
 * 将编排 / Kernel 侧的 `research_data` 防御性同步到 `TripWorldState.signals.planResearchDataMirror`，
 * 避免各业务入口重复手写镜像；仅当存在结构化 `__research_trace_signals` 时写入（与日志映射契约一致）。
 */
import type { TripWorldState } from '../world-model';

const RESEARCH_TRACE_SIGNALS_KEY = '__research_trace_signals';

export function syncPlanResearchDataMirrorFromKernelResearch(
  state: TripWorldState,
  researchData: Record<string, unknown> | undefined | null,
): void {
  if (!researchData || typeof researchData !== 'object' || Array.isArray(researchData)) {
    return;
  }
  const raw = researchData[RESEARCH_TRACE_SIGNALS_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return;
  }
  state.signals.planResearchDataMirror = { ...researchData };
}
