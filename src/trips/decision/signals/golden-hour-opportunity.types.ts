/**
 * Golden hour — 机会域（utility / photography），勿与 execution feasibility 混用。
 */

import type { ISODate, ISOTime } from '../world-model';

export interface GoldenHourOpportunitySignal {
  date: ISODate;
  morningGoldenStart?: ISOTime;
  morningGoldenEnd?: ISOTime;
  eveningGoldenStart?: ISOTime;
  eveningGoldenEnd?: ISOTime;
  /** 0–1：摄影/景观时段综合效用（非安全约束） */
  photographyUtilityScore?: number;
}
