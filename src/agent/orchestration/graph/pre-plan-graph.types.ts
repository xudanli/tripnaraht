import type { OrchestrationNodeId, SharedRunContext } from './orchestration-graph.types';
import type { GraphRunOutcome } from './orchestration-graph.types';

export interface PrePlanGraphRunParams extends SharedRunContext {
  resumeSkipIntake?: boolean;
  /** Durable / VERIFY 回溯入口；缺省 intake */
  entry?: OrchestrationNodeId;
  /** 仅执行到该节点（图调度逐节点模式） */
  stopAfter?: OrchestrationNodeId;
}

export type PrePlanGraphOutcome =
  | GraphRunOutcome
  | {
      kind: 'terminal';
      terminal: import('./orchestration-graph.types').OrchestrationTerminalId;
      result: import('../../interfaces/claude-orchestration.interface').OrchestrationResult;
      decisionState: import('../../../decision/kernel/decision-state.types').DecisionState | undefined;
    };
