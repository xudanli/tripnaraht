// src/agent/memory/decision-memory/decision-memory.types.ts
import { randomUUID } from 'crypto';

/** 世界侧操作决策（非聊天记忆）：车辆 / 路线 / 天气改道 / 风险拦截等因果链 */
export type DecisionMemoryType = 'vehicle' | 'route' | 'weather_reroute' | 'risk_block';

export type DecisionMemoryOutcome = 'accepted' | 'rejected' | 'failed' | 'overridden';

/**
 * TripNARA Decision Memory：记录「为何如此选 / 为何否决」，供后续轮次避免重复撞墙。
 * inputs / outputs 刻意保持结构化 JSON 形态，由各调用方写入稳定字段名。
 */
export interface DecisionMemory {
  causalityId: string;
  decisionType: DecisionMemoryType;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  outcome: DecisionMemoryOutcome;
  rationale: string[];
  causedBy: string[];
  timestamp: number;
}

export function buildDecisionMemory(
  input: Omit<DecisionMemory, 'causalityId' | 'timestamp'> & {
    causalityId?: string;
    timestamp?: number;
  },
): DecisionMemory {
  return {
    causalityId: input.causalityId ?? randomUUID(),
    decisionType: input.decisionType,
    inputs: input.inputs,
    outputs: input.outputs,
    outcome: input.outcome,
    rationale: input.rationale,
    causedBy: input.causedBy,
    timestamp: input.timestamp ?? Date.now(),
  };
}
