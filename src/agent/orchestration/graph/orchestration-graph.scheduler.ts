import { resolveMainChainNext } from './edges/main-chain.edges';
import { resolvePlanVerifyLoopNext } from './edges/plan-verify-loop.edges';
import type {
  GraphNodeOutcome,
  GraphRunOutcome,
  OrchestrationGraphNodeHandler,
  OrchestrationNodeId,
  SharedRunContext,
} from './orchestration-graph.types';

export type GraphEdgeResolver = (from: OrchestrationNodeId) => OrchestrationNodeId | 'END' | undefined;

export interface OrchestrationGraphRunOptions {
  entry: OrchestrationNodeId;
  exitOn?: OrchestrationNodeId | 'END';
  resolveNext?: GraphEdgeResolver;
  maxSteps?: number;
}

const DEFAULT_MAX_STEPS = 32;

/**
 * 轻量图调度器：顺序执行节点，支持 deadline、显式 next、边表与 terminal 出口。
 */
export class OrchestrationGraphScheduler {
  async run(
    handler: OrchestrationGraphNodeHandler,
    ctx: SharedRunContext,
    options: OrchestrationGraphRunOptions,
  ): Promise<GraphRunOutcome> {
    const resolveNext = options.resolveNext ?? resolveMainChainNext;
    const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    let current: OrchestrationNodeId | undefined = options.entry;
    let steps = 0;
    let decisionState = ctx.decisionState;

    while (current) {
      if (steps >= maxSteps) {
        throw new Error(`OrchestrationGraphScheduler: maxSteps=${maxSteps} exceeded at node=${current}`);
      }
      if (isGraphDeadlineExpired({ ...ctx, decisionState })) {
        throw new Error(`TIMEOUT: orchestration graph at node=${current}`);
      }

      const nodeCtx: SharedRunContext = { ...ctx, decisionState };
      const outcome = await handler.runNode(current, nodeCtx);
      if (outcome.decisionState !== undefined) {
        decisionState = outcome.decisionState;
      }

      if (outcome.kind === 'terminal') {
        return {
          kind: 'terminal',
          terminal: outcome.terminal,
          result: outcome.result,
          decisionState,
        };
      }

      if (outcome.kind === 'complete') {
        return { kind: 'completed', lastNode: current, decisionState };
      }

      if (outcome.kind === 'reroute') {
        return { kind: 'rerouted', to: outcome.to, decisionState };
      }

      steps += 1;
      if (options.exitOn && current === options.exitOn) {
        return { kind: 'completed', lastNode: current, decisionState };
      }

      const edgeNext = resolveNext(current);
      const next =
        outcome.next ?? (edgeNext === 'END' ? undefined : (edgeNext as OrchestrationNodeId | undefined));
      current = next;
    }

    return { kind: 'completed', lastNode: options.entry, decisionState };
  }
}

/** plan_verify_loop 专用边解析 */
export function planVerifyLoopEdgeResolver(from: OrchestrationNodeId) {
  return resolvePlanVerifyLoopNext(from);
}

/** 超时 terminal 须由宿主构建；调度器仅检测 deadline */
export function isGraphDeadlineExpired(ctx: SharedRunContext): boolean {
  return (ctx.deadline?.remainingMs?.() ?? Number.POSITIVE_INFINITY) <= 0;
}

export type { GraphNodeOutcome };
