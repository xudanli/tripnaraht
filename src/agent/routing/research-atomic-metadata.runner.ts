/**
 * RESEARCH 原子元数据清理（纯函数，从 ClaudeOrchestrator 迁出）。
 */

import type { OrchestratorState } from '../interfaces/trip-plan.interface';

export function clearResearchAtomicPendingMetadata(state: OrchestratorState): void {
  const m = { ...(state.metadata as any) };
  delete m.pending_research_prior_for_kernel;
  delete m.research_atomic_rollback_snapshot;
  delete m.research_scopes_to_recompute;
  state.metadata = m as OrchestratorState['metadata'];
}
