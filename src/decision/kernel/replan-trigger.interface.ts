/**
 * REPLAN 触发接口
 *
 * 专利实施例 2：当 DSO 检测到航班取消、道路封闭等环境变化时，
 * 编排层实现此接口以执行 RESEARCH → PLAN_GEN → VERIFY 重规划流程
 */

export const REPLAN_TRIGGER = 'REPLAN_TRIGGER';

export interface IReplanTrigger {
  /**
   * 触发重规划
   * @param tripRunIdOrTripId TripRun.id 或 Trip.id
   * @param reason 触发原因（如 flight_cancelled、road_closed）
   */
  triggerReplan(tripRunIdOrTripId: string, reason: string): Promise<void>;
}
