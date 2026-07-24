import type { Logger } from '@nestjs/common';
import type { DecisionState, DecisionStatePatch } from '../../../../decision/kernel/decision-state.types';
import type { LlmProvider } from '../../../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext } from '../../../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import type {
  GraphNodeOutcome,
  OrchestrationNodeId,
  SharedRunContext,
} from '../orchestration-graph.types';

/**
 * 原子编排节点标准输入（与 {@link SharedRunContext} 对齐，禁止节点私传非标字段）。
 */
export interface NodeExecutionContext extends SharedRunContext {
  systemRequestId: string;
  logger: Logger;
}

export type NodeExecutionResult =
  | {
      success: true;
      decisionState?: DecisionState | undefined;
      /** 提议合并进 DSO 的增量（由编排层 StateManager / updateState 应用） */
      dsoPatch?: DecisionStatePatch;
      /** 显式下一跳；缺省时由边表解析 */
      nextAnchorOverride?: OrchestrationNodeId;
    }
  | {
      success: false;
      error: Error;
      decisionState?: DecisionState | undefined;
      /** 终端/重路由时直接给出图 outcome */
      graphOutcome?: GraphNodeOutcome;
    };

export abstract class BaseOrchestratorNode {
  abstract readonly nodeId: OrchestrationNodeId;

  abstract execute(context: NodeExecutionContext): Promise<NodeExecutionResult>;
}

/** pre_plan 子图内节点可携带的段控制（stopAfter / terminal 构建） */
export interface PrePlanSegmentControl {
  startTime: number;
  stopAfter?: OrchestrationNodeId;
  maybeStopAfter(node: OrchestrationNodeId): import('../orchestration-graph.types').GraphRunOutcome | null;
  prePlanTerminal(
    terminal: import('../orchestration-graph.types').OrchestrationTerminalId,
    result: import('../../../interfaces/claude-orchestration.interface').OrchestrationResult,
  ): import('../orchestration-graph.types').GraphRunOutcome;
}

export type ResearchPrePlanSegmentInput = NodeExecutionContext & {
  prePlan: PrePlanSegmentControl;
};

export type IntakePrePlanSegmentInput = NodeExecutionContext & {
  prePlan: PrePlanSegmentControl;
  resumeSkipIntake?: boolean;
};

export type StateUpdatePrePlanSegmentInput = NodeExecutionContext & {
  prePlan: PrePlanSegmentControl;
};

export type PoiSelectionPrePlanSegmentInput = NodeExecutionContext & {
  prePlan: PrePlanSegmentControl;
};

export type GateEvalPrePlanSegmentInput = NodeExecutionContext & {
  prePlan: PrePlanSegmentControl;
};

export type ContextBuildPrePlanSegmentInput = NodeExecutionContext & {
  prePlan: PrePlanSegmentControl;
};
