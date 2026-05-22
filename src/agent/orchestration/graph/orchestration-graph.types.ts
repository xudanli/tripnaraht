import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { LlmProvider } from '../../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';
import type { AgentContext, OrchestrationResult } from '../../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';

/** 编排图节点（与 backlog §2 对齐） */
export type OrchestrationNodeId =
  | 'intake'
  | 'state_update'
  | 'research'
  | 'poi_selection'
  | 'gate_eval'
  | 'context_build'
  | 'plan_gen'
  | 'optimize'
  | 'verify'
  | 'repair'
  | 'narrate'
  | 'feedback'
  | 'hallucination';

export type OrchestrationTerminalId =
  | 'terminal_clarification'
  | 'terminal_blocked'
  | 'terminal_done'
  | 'terminal_failed'
  | 'terminal_no_solution'
  | 'terminal_timeout';

export interface OrchestrationDeadline {
  remainingMs(): number;
}

/** 单轮图运行共享上下文（指针语义，禁止跨节点私传非标字段） */
export interface SharedRunContext {
  request: RouteAndRunRequestDto;
  context: AgentContext;
  state: OrchestratorState;
  decisionState: DecisionState | undefined;
  llmProvider: LlmProvider;
  startTime: number;
  deadline?: OrchestrationDeadline;
}

export type GraphNodeOutcome =
  | {
      kind: 'continue';
      /** 显式下一跳；缺省时由边表解析 */
      next?: OrchestrationNodeId;
      decisionState?: DecisionState | undefined;
    }
  | {
      /** 子图正常结束（如 plan_verify_loop → narrate） */
      kind: 'complete';
      decisionState?: DecisionState | undefined;
    }
  | {
      /** 子图退出并请求主图跳转到另一节点（如 VERIFY → research） */
      kind: 'reroute';
      to: OrchestrationNodeId;
      decisionState?: DecisionState | undefined;
    }
  | {
      kind: 'terminal';
      terminal: OrchestrationTerminalId;
      result: OrchestrationResult;
      decisionState?: DecisionState | undefined;
    };

export type GraphRunOutcome =
  | {
      kind: 'completed';
      lastNode: OrchestrationNodeId;
      decisionState: DecisionState | undefined;
    }
  | {
      kind: 'rerouted';
      to: OrchestrationNodeId;
      decisionState: DecisionState | undefined;
    }
  | {
      kind: 'terminal';
      terminal: OrchestrationTerminalId;
      result: OrchestrationResult;
      decisionState: DecisionState | undefined;
    };

export interface OrchestrationGraphEdge {
  from: OrchestrationNodeId;
  /** 静态下一跳（条件边由节点 outcome.next / terminal 表达） */
  to: OrchestrationNodeId | 'END';
  reason?: string;
}

export interface OrchestrationGraphNodeHandler {
  runNode(nodeId: OrchestrationNodeId, ctx: SharedRunContext): Promise<GraphNodeOutcome>;
}
