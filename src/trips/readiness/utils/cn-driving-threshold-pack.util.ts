/**
 * 中国自驾行程：按经典线路 regions 解析驾驶阈值 Country Pack 码。
 * 涉藏优先 CN_XIZANG（更严），仅川西用 CN_SICHUAN，否则国家级 CN。
 */
import { getCnClassicRouteById } from './cn-classic-routes.util';

export function resolveCnDrivingThresholdPackCode(input: {
  destination?: string | null;
  classicRouteId?: string | null;
}): string {
  const dest = (input.destination ?? '').trim().toUpperCase();
  if (dest !== 'CN') return dest || 'GLOBAL';

  const routeId = (input.classicRouteId ?? '').trim();
  if (!routeId) return 'CN';

  const route = getCnClassicRouteById(routeId);
  if (!route) return 'CN';
  if (route.regions.includes('xizang')) return 'CN_XIZANG';
  if (route.regions.includes('sichuan')) return 'CN_SICHUAN';
  return 'CN';
}
