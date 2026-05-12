/**
 * 营运日窗可行性（v1）：用 policies.dayStart/dayEnd 检验槽位时刻（传播后）。
 * 不含天文日照；后续可与日出日落坐标模型叠加。
 */

import type { TripPlan } from '../plan-model';
import type { ISOTime } from '../world-model';
import type { OperationalDayWindowSignalSummary } from './temporal-propagation.types';
import { parseIsoTimeToMinutes } from '../utils/weather-slot-delay.util';

const TAG = 'operational_day_window_v1';

/** 与 TripWorldState.policies 注释对齐的默认营运窗 */
const DEFAULT_DAY_START: ISOTime = '08:00';
const DEFAULT_DAY_END: ISOTime = '21:00';

export interface OperationalDayWindowOptions {
  dayStart?: ISOTime;
  dayEnd?: ISOTime;
}

/**
 * 若槽位开始早于 dayStart，或结束（无 endTime 则视为与开始相同）晚于 dayEnd，则追加 reasons。
 */
export function applyOperationalDayWindowFeasibility(
  plan: TripPlan,
  options?: OperationalDayWindowOptions,
): OperationalDayWindowSignalSummary {
  const dayStart = options?.dayStart ?? DEFAULT_DAY_START;
  const dayEnd = options?.dayEnd ?? DEFAULT_DAY_END;
  const startM = parseIsoTimeToMinutes(dayStart);
  const endM = parseIsoTimeToMinutes(dayEnd);

  const outOfWindowSlotIds: string[] = [];

  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      const t0 = parseIsoTimeToMinutes(slot.time);
      const t1 = slot.endTime ? parseIsoTimeToMinutes(slot.endTime) : t0;

      const reasons: string[] = [...(slot.reasons ?? [])];
      let hit = false;

      if (t0 < startM) {
        hit = true;
        reasons.push(
          `[${TAG}] 开始 ${slot.time} 早于营运日窗起点 ${dayStart}`,
        );
      }
      if (t1 > endM) {
        hit = true;
        const endLabel = slot.endTime ?? slot.time;
        reasons.push(
          `[${TAG}] 结束 ${endLabel} 晚于营运日窗终点 ${dayEnd}`,
        );
      }

      if (hit) {
        slot.reasons = reasons;
        outOfWindowSlotIds.push(slot.id);
      }
    }
  }

  return {
    dayStart,
    dayEnd,
    violationCount: outOfWindowSlotIds.length,
    outOfWindowSlotIds,
  };
}
