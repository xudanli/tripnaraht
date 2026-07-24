import type { AgentMemoryContextStore } from '../context/agent-memory-context.store';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';

/**
 * 将当前 ALS 中的 `AgentMemoryContext.travelPreference` 上卷到 `OrchestratorState.metadata`，
 * 供 Assembler / 观测层读取（与 DSO 主体解耦的「解释面」快照）。
 */
export function attachTravelPreferenceSnapshotToOrchestratorState(
  store: AgentMemoryContextStore | undefined,
  state: OrchestratorState,
): void {
  const mem = store?.get();
  if (!mem || mem.requestId !== state.request_id) return;
  if (mem.travelPreference == null || typeof mem.travelPreference !== 'object') return;
  state.metadata = {
    ...state.metadata,
    travel_preference_snapshot: { ...mem.travelPreference },
  } as OrchestratorState['metadata'];
}
