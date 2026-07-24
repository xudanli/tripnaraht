import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';
import type { NarratePhaseHost, RunNarratePhaseParams } from './narrate-phase.host';

/**
 * post_plan 子图 NARRATE 节点宿主：编排壳能力 + narrate 执行体委托面。
 */
export interface NarrateNodeHost extends NarratePhaseHost {
  recordPoiPlanningOutcomeAfterItinerary(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): void;

  touchAsyncTaskProgress(phase: string): void;

  maybeSnapshot(
    state: OrchestratorState,
    kind: 'AUTO' | 'USER_ACTION' | 'CHECKPOINT',
  ): void;

  runNarratePhase(
    params: RunNarratePhaseParams,
  ): Promise<import('./narrate-phase.host').NarratePhaseResult>;
}
