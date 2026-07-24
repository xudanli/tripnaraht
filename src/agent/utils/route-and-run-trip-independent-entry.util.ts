import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

/**
 * 不要求 trip_id 的 route_and_run 入口（Odyssey / 智能搭子产品已下线）。
 */
export function isTripIndependentRouteAndRunEntry(
  _request: RouteAndRunRequestDto,
): boolean {
  return false;
}
