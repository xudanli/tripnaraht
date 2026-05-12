import type { DecisionMemory } from './decision-memory.types';

export type WorldDecisionArchivePersistInput = {
  requestId: string;
  tripId: string | null;
  userId: string | null;
  entry: DecisionMemory;
};

/** 热路径 ring 之外的持久化 / 按 trip 拉取（装配进 Context 可后续接此端口） */
export interface WorldDecisionMemoryArchivePort {
  isEnabled(): boolean;
  persist(input: WorldDecisionArchivePersistInput): Promise<void>;
  /** 按时间倒序，最多 limit 条（含 payload 反序列化） */
  listRecentForTrip(tripId: string, limit: number): Promise<DecisionMemory[]>;
}

export const WORLD_DECISION_MEMORY_ARCHIVE = Symbol('WORLD_DECISION_MEMORY_ARCHIVE');
