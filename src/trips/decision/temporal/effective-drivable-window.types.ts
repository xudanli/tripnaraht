/**
 * 有效可驾驶日光窗 = 天文 civil twilight − 天气 − 路况（冰岛等场景）。
 */

import type { ISODate, ISOTime } from '../world-model';

export interface EffectiveDrivableWindow {
  date: ISODate;
  civilTwilightStart: ISOTime;
  civilTwilightEnd: ISOTime;
  weatherPenaltyMinutes: number;
  roadPenaltyMinutes: number;
  effectiveStart: ISOTime;
  effectiveEnd: ISOTime;
  notes?: string[];
}
