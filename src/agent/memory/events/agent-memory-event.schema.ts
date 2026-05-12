// src/agent/memory/events/agent-memory-event.schema.ts
import type { RouteDirectionDecisionMemory } from '../interfaces/route-direction-decision-memory.interface';

/** 注册表内事件名（与 emit 字符串对齐） */
export type AgentMemoryEventKind = 'agent.memory.decision.completed';

export interface AgentMemoryEvent<TPayload> {
  readonly kind: AgentMemoryEventKind;
  readonly payload: TPayload;
  readonly emittedAt: string;
}

/** L2：路线方向决策完成（写入总线消费） */
export type AgentMemoryDecisionCompletedPayload = RouteDirectionDecisionMemory & {
  kind: 'route_direction';
};

export function isAgentMemoryDecisionCompletedPayload(
  p: unknown,
): p is AgentMemoryDecisionCompletedPayload {
  const x = p as AgentMemoryDecisionCompletedPayload;
  return (
    typeof p === 'object' &&
    p !== null &&
    x.kind === 'route_direction' &&
    typeof x.userId === 'string' &&
    typeof x.selectedRouteDirectionId === 'number'
  );
}
