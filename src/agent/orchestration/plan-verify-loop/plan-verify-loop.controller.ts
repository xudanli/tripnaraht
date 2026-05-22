import {
  OrchestrationGraphScheduler,
  planVerifyLoopEdgeResolver,
} from '../graph/orchestration-graph.scheduler';
import { PLAN_VERIFY_LOOP_ENTRY } from '../graph/edges/plan-verify-loop.edges';
import type {
  GraphNodeOutcome,
  OrchestrationGraphNodeHandler,
  SharedRunContext,
} from '../graph/orchestration-graph.types';
import type { PlanVerifyLoopHost } from './plan-verify-loop.host';
import {
  applyUtilityDecayAfterRepairIfNeeded,
  checkRepairCountExceededIfNeeded,
} from './plan-verify-loop-repair-guards';
import {
  consumeGraphStep,
  createPlanVerifyTransientState,
  syncRepairsRemainingFromDso,
} from './plan-verify-loop-transient.util';
import type { PlanVerifyLoopOutcome, PlanVerifyLoopRunParams } from './plan-verify-loop.types';

function toSharedContext(params: PlanVerifyLoopRunParams): SharedRunContext {
  return {
    request: params.request,
    context: params.context,
    state: params.state,
    decisionState: params.decisionState,
    llmProvider: params.llmProvider,
    startTime: params.startTime,
  };
}

/**
 * plan-verify-loop 控制流胶水：瞬态预算 + Verdict 驱动分支 + REPAIR/OPTIMIZE 执行体委托。
 */
export function createPlanVerifyLoopHandler(
  host: PlanVerifyLoopHost,
  initialDecisionState: import('../../../decision/kernel/decision-state.types').DecisionState | undefined,
): OrchestrationGraphNodeHandler {
  let loopState = createPlanVerifyTransientState(initialDecisionState);

  return {
    async runNode(nodeId, ctx): Promise<GraphNodeOutcome> {
      const stepTick = consumeGraphStep(loopState);
      loopState = stepTick.loop;
      if (stepTick.exhausted) {
        const msg = `plan_verify_loop 调度步数耗尽（max=${loopState.config.maxGraphSteps}），防止死锁`;
        ctx.state.current_step = 'FAILED';
        ctx.state.errors.push({
          step: 'VERIFY',
          error_code: 'PLAN_VERIFY_LOOP_STEP_BUDGET',
          message: msg,
          timestamp: new Date().toISOString(),
        });
        host.maybeSnapshot(ctx.state, 'CHECKPOINT');
        return {
          kind: 'terminal',
          terminal: 'terminal_failed',
          result: host.buildErrorResult(
            ctx.state,
            new Error(msg),
            ctx.startTime,
            ctx.decisionState,
            'VERIFY',
            undefined,
            ctx.context,
          ),
          decisionState: ctx.decisionState,
        };
      }

      let { state, decisionState, request, context, llmProvider, startTime } = ctx;

      switch (nodeId) {
        case 'optimize': {
          decisionState = await host.runOptimizePhase(state, decisionState);
          host.maybeSnapshot(state, 'AUTO');
          return { kind: 'continue', decisionState };
        }
        case 'verify': {
          host.touchAsyncTaskProgress('VERIFY');
          const verifyResult = await host.runVerifyPhase(
            decisionState,
            state,
            request,
            context,
            llmProvider,
          );
          decisionState = verifyResult.decisionState;
          decisionState = host.syncConfidenceAfterVerify(state, decisionState) ?? decisionState;
          host.maybeSnapshot(state, 'AUTO');

          const { verdict } = verifyResult;
          if (verdict.kind === 'fatal') {
            const msg = verdict.fatalMessage ?? 'FATAL_VERIFICATION_ISSUE';
            state.current_step = 'FAILED';
            state.errors.push({
              step: 'VERIFY',
              error_code: 'VERIFICATION_FATAL',
              message: msg,
              timestamp: new Date().toISOString(),
            });
            host.maybeSnapshot(state, 'CHECKPOINT');
            return {
              kind: 'terminal',
              terminal: 'terminal_failed',
              result: host.buildErrorResult(
                state,
                new Error(msg),
                startTime,
                decisionState,
                'VERIFY',
                undefined,
                context,
              ),
              decisionState,
            };
          }

          if (verdict.kind === 'return_to_research') {
            host.persistHarnessTraceOnReturnToResearch(decisionState);
            decisionState = await host.applyReturnToResearchInvalidation(state, decisionState, request);
            return { kind: 'reroute', to: 'research', decisionState };
          }

          if (verdict.kind === 'needs_repair') {
            return { kind: 'continue', next: 'repair', decisionState };
          }
          return { kind: 'complete', decisionState };
        }
        case 'repair': {
          const euBefore = decisionState?.optimizationHints?.expectedUtility;
          decisionState =
            (await host.runRepairPhase(decisionState, state, request, context, llmProvider)) ??
            decisionState;
          host.maybeSnapshot(state, 'AUTO');
          loopState = syncRepairsRemainingFromDso(loopState, decisionState);

          const guardParams = {
            request,
            context,
            state,
            decisionState,
            llmProvider,
            startTime,
            euBefore,
            loop: loopState,
          };

          const utilityGuard = await applyUtilityDecayAfterRepairIfNeeded(host, guardParams);
          loopState = utilityGuard.loop;
          decisionState = utilityGuard.decisionState;
          if (utilityGuard.terminal) {
            return {
              kind: 'terminal',
              terminal: 'terminal_clarification',
              result: utilityGuard.terminal,
              decisionState,
            };
          }

          const repairTerminal = checkRepairCountExceededIfNeeded(host, {
            ...guardParams,
            decisionState,
            loop: loopState,
          });
          if (repairTerminal) {
            return {
              kind: 'terminal',
              terminal: 'terminal_clarification',
              result: repairTerminal,
              decisionState,
            };
          }

          return { kind: 'complete', decisionState };
        }
        default:
          throw new Error(`plan_verify_loop: unsupported node ${nodeId}`);
      }
    },
  };
}

/** 经图调度器执行 OPTIMIZE → VERIFY → (REPAIR) 子图 */
export async function runPlanVerifyOptimizeRepairGraph(
  host: PlanVerifyLoopHost,
  params: PlanVerifyLoopRunParams,
): Promise<PlanVerifyLoopOutcome> {
  const scheduler = new OrchestrationGraphScheduler();
  const graphOutcome = await scheduler.run(
    createPlanVerifyLoopHandler(host, params.decisionState),
    toSharedContext(params),
    {
      entry: PLAN_VERIFY_LOOP_ENTRY,
      resolveNext: planVerifyLoopEdgeResolver,
      maxSteps: parsePlanVerifyLoopMaxSteps(params.decisionState),
    },
  );

  if (graphOutcome.kind === 'terminal') {
    return {
      kind: 'terminal',
      result: graphOutcome.result,
      decisionState: graphOutcome.decisionState,
    };
  }

  if (graphOutcome.kind === 'rerouted' && graphOutcome.to === 'research') {
    return {
      kind: 'reroute_pre_plan',
      entry: 'research',
      decisionState: graphOutcome.decisionState,
    };
  }

  return { kind: 'continue', decisionState: graphOutcome.decisionState };
}

function parsePlanVerifyLoopMaxSteps(
  decisionState: import('../../../decision/kernel/decision-state.types').DecisionState | undefined,
): number {
  const loop = createPlanVerifyTransientState(decisionState);
  return loop.config.maxGraphSteps;
}
