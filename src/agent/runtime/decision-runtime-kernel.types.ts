import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';
import type { AgentExecutionContext } from './agent-execution-context.interface';
import type { DecisionOsExecutionContext } from './decision-os-execution-context';
import type { HydratedGovernanceRuntimeContext } from '../../governance/activation/governance-activation.types';
import type { RouteAndRunResponseDto } from '../dto/route-and-run.dto';

/** DOS Runtime Tick 阶段（单向数据流事件循环） */
export type DecisionRuntimeTickPhase =
  | 'GATEKEEPING'
  | 'MEMORY_HYDRATE'
  | 'LEDGER_RECONCILE'
  | 'MVCC_FREEZE'
  | 'GOVERNANCE_EVALUATE'
  | 'DOS_ASSEMBLE'
  | 'INTENT_COMPILE'
  | 'EXECUTE_ORCHESTRATION'
  | 'COMMIT'
  | 'RECOVERY';

export type DecisionRuntimeTickPhaseRecord = {
  phase: DecisionRuntimeTickPhase;
  at: string;
  duration_ms?: number;
};

export type DecisionRuntimeTickObservabilityV1 = {
  revision: 'v1';
  tick_id: string;
  request_id: string;
  phases: DecisionRuntimeTickPhaseRecord[];
  replay_anchor?: string;
  /** Agentic hint — not a formal decision run */
  decision_trigger?: import('../../decision-runtime/trigger/build-route-and-run-decision-trigger-input.util').RouteAndRunDecisionTriggerObservabilityV1;
};

/**
 * 单次 route_and_run Tick 的运行时束：Kernel 各阶段产出，编排体只读消费。
 */
export type DecisionRuntimeTickBundle = {
  tickId: string;
  wallStart: number;
  replayAnchor?: string;
  memory: AgentMemoryContext;
  execCtx: AgentExecutionContext;
  goldenChainSpanId: string;
  tickObs: DecisionRuntimeTickObservabilityV1;
  dosExecutionContext?: DecisionOsExecutionContext;
  governanceRuntime?: HydratedGovernanceRuntimeContext;
  /** 前置阶段早退（replay 快照缺失等） */
  earlyResponse?: RouteAndRunResponseDto;
};

export type DecisionRuntimeTickBody = (
  bundle: DecisionRuntimeTickBundle,
) => Promise<RouteAndRunResponseDto>;
