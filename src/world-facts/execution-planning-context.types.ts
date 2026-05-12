import type { TripDecisionExecutionHistoryEntry } from './decision-execution-sync.types';

/**
 * P5：Planner / RouteSelector 可读的结构化「执行记忆」上下文。
 */
export interface ExecutionPlanningContext {
  tripId?: string;
  countryCode: string;
  tripExecutionHistory: TripDecisionExecutionHistoryEntry[];
  /** Resolver 读到的最近一次 dispatch 派生事实（可选） */
  lastCountryDispatchFact?: {
    factId: string;
    observedAt: string | null;
    valueJson: Record<string, unknown>;
  };
  hints: {
    routeDegradeCountByRouteDirectionId: Record<string, number>;
    ambientDegradeEvents: number;
  };
}
