/**
 * Overnight Restructuring Pressure — Physics 与「是否值得动拓扑」之间的中间层。
 * 不自动生成 repair；Neptune 拓扑变更前应再经闸门。
 */

import type { ISODate } from '../world-model';

export type DaylightCollapseSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface OvernightRestructuringPressure {
  date: ISODate;
  unsafeLegIds: string[];
  downstreamShiftMinutes: number;
  crossDaySpillMinutes: number;
  operationalWindowViolations: number;
  daylightCollapseSeverity: DaylightCollapseSeverity;
  /** 是否值得进入重构管线讨论（非立即改计划） */
  restructuringRecommended: boolean;
}
