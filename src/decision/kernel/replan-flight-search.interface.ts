/**
 * REPLAN 航班替换接口
 *
 * 专利实施例 2（6.2.9）：航班取消时搜索替代航班
 * 可选注入，当 Amadeus 等服务可用时提供实现
 */

import type { EnvironmentFlight } from './decision-state.types';

export const REPLAN_FLIGHT_SEARCH = 'REPLAN_FLIGHT_SEARCH';

/**
 * 航班替换搜索适配器
 * 当 environmentState.flights 存在 cancelled 时，REPLAN 会调用此接口获取替代航班
 */
export interface IReplanFlightSearch {
  /**
   * 搜索替代航班
   * @param origin 出发地（城市名或 IATA 代码）
   * @param destination 目的地
   * @param departureDate 出发日期 YYYY-MM-DD
   * @returns 替代航班列表，写入 DSO.environmentState.flights
   */
  searchAlternatives(
    origin: string,
    destination: string,
    departureDate: string,
  ): Promise<EnvironmentFlight[]>;
}
