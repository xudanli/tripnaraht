/**
 * DSO 反馈持久化接口
 *
 * 专利实施例 6.1.5：用户反馈通过 STATE_UPDATE 原子写入 DSO
 * 当用户采纳/拒绝/评分时，需加载 DSO、commit feedback patch、持久化回存储
 */

import type { DecisionState, DecisionStateFeedback } from './decision-state.types';

export const DSO_FEEDBACK_PERSISTENCE = 'DSO_FEEDBACK_PERSISTENCE';

/**
 * 解析 trip_run_id 或 trip_id 到可用的 Trip 标识
 * - trip_run_id (TripRun.id): 需通过 TripRun.tripId 解析到 Trip
 * - trip_id (Trip.id): 直接使用
 */
export interface IDsoFeedbackPersistence {
  /**
   * 获取指定请求的当前 DSO（用于 commit 前读取）
   * @param tripRunIdOrTripId TripRun.id 或 Trip.id
   */
  getDso(tripRunIdOrTripId: string): Promise<DecisionState | undefined>;

  /**
   * 将更新后的 DSO 持久化
   * @param tripRunIdOrTripId TripRun.id 或 Trip.id，由实现方解析
   * @param dso 更新后的完整 DSO
   */
  persistDso(tripRunIdOrTripId: string, dso: DecisionState): Promise<void>;
}
