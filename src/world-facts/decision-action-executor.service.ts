import { Injectable } from '@nestjs/common';
import type { DecisionFactor } from './decision-awareness.types';
import type { DecisionExecutableAction } from './decision-execution.types';

export interface DecisionActionExecutionContext {
  countryCode?: string;
  routeDirectionId?: string;
}

/**
 * DSL → DecisionExecutableAction（v1：WEATHER 强风 → ROUTE_DEGRADE）。
 * 实际执行由 ActionDispatcherService + RouteDecisionEngineService 统一调度。
 */
@Injectable()
export class DecisionActionExecutorService {
  /**
   * 从 DecisionFactor[] 生成可执行动作列表（幂等：同一因子只产生一条 ROUTE_DEGRADE）。
   */
  buildExecutableActions(
    factors: DecisionFactor[],
    ctx?: DecisionActionExecutionContext,
  ): DecisionExecutableAction[] {
    const actions: DecisionExecutableAction[] = [];

    for (const f of factors) {
      if (f.factorType !== 'WEATHER') continue;
      if (f.actionHint !== 'DEGRADE_ROUTE') continue;
      if (f.effect !== 'WARNING') continue;

      actions.push({
        actionType: 'ROUTE_DEGRADE',
        severity: 'MEDIUM',
        reversible: true,
        rollbackHint:
          'Clear route risk-downgrade / wind penalty flags and restore prior scoring weights.',
        sourceFactorIds: [...f.derivedFromFactIds],
        payload: {
          kind: 'WEATHER_WIND',
          countryCode: ctx?.countryCode?.trim().toUpperCase(),
          routeDirectionId: ctx?.routeDirectionId?.trim(),
          assert: f.assert,
        },
      });
    }

    return actions;
  }
}
