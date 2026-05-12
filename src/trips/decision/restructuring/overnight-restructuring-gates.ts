/**
 * 与 migrationEconomicsApproved 对称：拓扑级「许可证」，避免 physics→瞬间突变。
 */

import type { OvernightRestructuringPressure } from './overnight-restructuring.types';

/** 较 restructuringRecommended 更严：供 Neptune 真正动 overnight 拓扑前校验 */
export function restructuringPressureApproved(
  p: OvernightRestructuringPressure,
): boolean {
  if (!p.restructuringRecommended) {
    return false;
  }
  const stress = p.downstreamShiftMinutes + p.crossDaySpillMinutes;
  return (
    p.daylightCollapseSeverity === 'HIGH' ||
    stress >= 55 ||
    p.operationalWindowViolations >= 2 ||
    p.unsafeLegIds.length >= 2
  );
}
