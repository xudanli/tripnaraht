/**
 * DSO 最新状态提供者接口
 *
 * 用于多代理并发提交时的协调：当 StateCommitConflictError 发生时，
 * 从 store 读取最新 DSO 后重试，避免覆盖其他 Agent 的更新。
 *
 * 实现示例：从 Trip.metadata 或 Redis 读取
 */

import type { DecisionState } from './decision-state.types';

export const DSO_LATEST_STATE_PROVIDER = 'DSO_LATEST_STATE_PROVIDER';

export interface IDsoLatestStateProvider {
  /**
   * 获取指定 request 的最新 DSO（从持久化 store）
   * @param requestId 通常为 tripId 或 request_id
   * @returns 最新状态，若无则 undefined
   */
  getLatest(requestId: string): Promise<DecisionState | undefined>;
}
