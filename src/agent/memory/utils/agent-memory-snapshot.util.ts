import type { AgentMemoryContextStore } from '../context/agent-memory-context.store';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';
import type { AgentMemoryContext } from '../interfaces/agent-memory-context.interface';

/** NARRATE / EmotionalContext 消费的 L1-L4  slim 快照（避免 metadata 膨胀） */
export type AgentMemoryNarrateSnapshot = Readonly<{
  snapshotId: string;
  userId: string | null;
  tripId: string | null;
  recentWorldDecisions: AgentMemoryContext['recentWorldDecisions'];
  recentTripFeedbacks: AgentMemoryContext['recentTripFeedbacks'];
}>;

export function slimAgentMemoryForNarrate(
  mem: AgentMemoryContext,
): AgentMemoryNarrateSnapshot {
  return {
    snapshotId: mem.snapshotId,
    userId: mem.userId,
    tripId: mem.tripId,
    recentWorldDecisions: mem.recentWorldDecisions ?? [],
    recentTripFeedbacks: mem.recentTripFeedbacks ?? [],
  };
}

export function agentMemoryNarrateSnapshotToContext(
  snap: AgentMemoryNarrateSnapshot,
): Pick<AgentMemoryContext, 'recentWorldDecisions' | 'recentTripFeedbacks' | 'snapshotId' | 'userId' | 'tripId'> {
  return {
    snapshotId: snap.snapshotId,
    userId: snap.userId,
    tripId: snap.tripId,
    recentWorldDecisions: snap.recentWorldDecisions,
    recentTripFeedbacks: snap.recentTripFeedbacks,
  };
}

/**
 * 将 ALS 内 AgentMemoryContext 上卷至 OrchestratorState.metadata，
 * 供 EmotionNarratorOrchestrator / SharedExperienceGraph 只读消费。
 */
export function attachAgentMemorySnapshotToOrchestratorState(
  store: AgentMemoryContextStore | undefined,
  state: OrchestratorState,
): void {
  const mem = store?.get();
  if (!mem || mem.requestId !== state.request_id) return;
  state.metadata = {
    ...state.metadata,
    agent_memory_context: slimAgentMemoryForNarrate(mem),
  } as OrchestratorState['metadata'];
}
