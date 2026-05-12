import { Injectable, Logger } from '@nestjs/common';
import type { DecisionExecutableAction } from '../../world-facts/decision-execution.types';
import type { RouteDirectionRecommendation } from './route-direction-selector.service';

/**
 * Route 侧决策执行引擎（P3）：消费 DecisionExecutableAction，产生可观测的路线推荐变更。
 * v1 仅实现 ROUTE_DEGRADE（天气强风 → 分数降权）。
 */
@Injectable()
export class RouteDecisionEngineService {
  private readonly logger = new Logger(RouteDecisionEngineService.name);

  /** token → dispatch 前快照（用于 rollbackRecommendations） */
  private readonly rollbackSnapshots = new Map<string, RouteDirectionRecommendation[]>();
  private rollbackSeq = 0;

  /**
   * 对匹配 payload.routeDirectionId 的推荐降分（未指定则对国家内全部推荐稍降权）。
   */
  applyRouteDegrade(
    recommendations: RouteDirectionRecommendation[],
    action: DecisionExecutableAction,
  ): { adjusted: RouteDirectionRecommendation[]; rollbackToken: string } {
    const severityMultiplier =
      action.severity === 'HIGH' ? 0.82 : action.severity === 'LOW' ? 0.94 : 0.88;

    const token = `rb_${Date.now()}_${++this.rollbackSeq}`;
    this.rollbackSnapshots.set(token, this.cloneRecommendations(recommendations));
    this.pruneSnapshots();

    const targetRaw = action.payload.routeDirectionId?.trim();
    const targetId = targetRaw ? String(targetRaw) : '';

    const adjusted = recommendations.map((r) => {
      const id = String(r.routeDirection?.id ?? '');
      const applies =
        !targetId ||
        id === targetId ||
        id === String(Number(targetId));

      const nextScore = applies
        ? Math.max(0, Math.round(r.score * severityMultiplier * 100) / 100)
        : r.score;

      return { ...r, score: nextScore };
    });

    this.logger.debug(
      `ROUTE_DEGRADE applied token=${token} targets=${targetId || 'ALL'} mult=${severityMultiplier}`,
    );

    return { adjusted, rollbackToken: token };
  }

  /**
   * 取回 dispatch 前的推荐快照（一次性 token，取出后即失效）。
   */
  rollbackRecommendations(token: string): RouteDirectionRecommendation[] | null {
    const snap = this.rollbackSnapshots.get(token);
    if (!snap) return null;
    this.rollbackSnapshots.delete(token);
    return this.cloneRecommendations(snap);
  }

  private cloneRecommendations(
    recs: RouteDirectionRecommendation[],
  ): RouteDirectionRecommendation[] {
    try {
      return structuredClone(recs);
    } catch {
      return JSON.parse(JSON.stringify(recs)) as RouteDirectionRecommendation[];
    }
  }

  private pruneSnapshots() {
    while (this.rollbackSnapshots.size > 500) {
      const first = this.rollbackSnapshots.keys().next().value as string | undefined;
      if (first) this.rollbackSnapshots.delete(first);
      else break;
    }
  }
}
