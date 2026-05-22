import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { OrchestrationTerminalId } from '../graph/orchestration-graph.types';
import type { OrchestrationResult } from '../../interfaces/claude-orchestration.interface';

/** 单段 pre_plan 节点执行结果 */
export type PrePlanSegmentOutcome =
  | { kind: 'ok'; decisionState: DecisionState | undefined }
  | {
      kind: 'terminal';
      terminal: OrchestrationTerminalId;
      result: OrchestrationResult;
      decisionState: DecisionState | undefined;
    };
