// src/agent/context-engine/interfaces/trip-task-memory.interface.ts
/**
 * 旅行任务记忆（Trip Task Memory）
 *
 * Context Orchestrator 第三优先级：当前行程状态、已选路线、中间决策
 * 参考：docs/CONTEXT_ORCHESTRATOR_IMPLEMENTATION_PLAN.md 5.2
 */

export type TripTaskPhase =
  | 'intake'
  | 'route_selection'
  | 'poi_candidate'
  | 'decision'
  | 'confirm';

export interface TripTaskMemory {
  tripId: string;
  currentPhase: TripTaskPhase;
  selectedRouteDirectionId?: string;
  decisionLogSummary: string;
  artifactsRefs: string[];
  lastUpdated: string; // ISO 8601
}
