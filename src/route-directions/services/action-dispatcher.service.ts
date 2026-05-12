import { Injectable, Logger } from '@nestjs/common';
import type { DecisionExecutableAction } from '../../world-facts/decision-execution.types';
import type { ActionDispatchTrace } from '../../world-facts/decision-dispatch.types';
import type { RouteDirectionRecommendation } from './route-direction-selector.service';
import { RouteDecisionEngineService } from './route-decision-engine.service';

export interface ActionDispatchContext {
  recommendations: RouteDirectionRecommendation[];
}

export interface ActionDispatchOutcome {
  recommendations: RouteDirectionRecommendation[];
  traces: ActionDispatchTrace[];
  /** 本次 dispatch 中产生的 rollback token（与 traces 中 SUCCESS 项对应） */
  rollbackTokens: string[];
}

/**
 * P3：统一执行入口 —— DecisionExecutableAction → Route / Planner / Trip。
 * v1 仅将 ROUTE_DEGRADE 交给 RouteDecisionEngine。
 */
@Injectable()
export class ActionDispatcherService {
  private readonly logger = new Logger(ActionDispatcherService.name);

  constructor(private readonly routeEngine: RouteDecisionEngineService) {}

  /**
   * 顺序执行动作；后序动作基于前一动作输出推荐继续变换。
   */
  dispatch(
    actions: DecisionExecutableAction[],
    ctx: ActionDispatchContext,
  ): ActionDispatchOutcome {
    let current = ctx.recommendations;
    const traces: ActionDispatchTrace[] = [];
    const rollbackTokens: string[] = [];

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]!;
      const startedAt = new Date().toISOString();

      try {
        if (action.actionType === 'ROUTE_DEGRADE') {
          const { adjusted, rollbackToken } = this.routeEngine.applyRouteDegrade(current, action);
          current = adjusted;
          rollbackTokens.push(rollbackToken);
          traces.push({
            actionIndex: i,
            actionType: action.actionType,
            status: 'SUCCESS',
            startedAt,
            finishedAt: new Date().toISOString(),
            rollbackToken,
          });
        } else {
          traces.push({
            actionIndex: i,
            actionType: action.actionType,
            status: 'FAILED',
            message: `Unsupported actionType: ${action.actionType}`,
            startedAt,
            finishedAt: new Date().toISOString(),
          });
        }
      } catch (e: any) {
        this.logger.warn(`dispatch action ${i} failed: ${e?.message ?? e}`);
        traces.push({
          actionIndex: i,
          actionType: action.actionType,
          status: 'FAILED',
          message: e?.message ?? String(e),
          startedAt,
          finishedAt: new Date().toISOString(),
        });
      }
    }

    return { recommendations: current, traces, rollbackTokens };
  }
}
