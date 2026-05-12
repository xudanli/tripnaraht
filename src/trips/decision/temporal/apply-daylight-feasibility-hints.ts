/**
 * 民用晨光/暮光可行性提示（v1）：对户外敏感槽位标注「暮光后仍在途 / 晨光前出发」。
 * 与营运日窗互补：此处为天文光照 + 冰岛高地/冰川路网语义占位。
 */

import type { TripPlan } from '../plan-model';
import type { ActivityType } from '../world-model';
import type { DaylightFeasibilitySignalSummary } from './temporal-propagation.types';
import { approximateCivilTwilightLocal } from './approximate-civil-twilight';
import { parseIsoTimeToMinutes } from '../utils/weather-slot-delay.util';

const TAG = 'daylight_civil_twilight_v1';

/** 默认视为受光照约束的活动类型（可按产品收紧） */
const DAYLIGHT_SENSITIVE: ReadonlySet<ActivityType> = new Set([
  'transport',
  'nature',
  'sightseeing',
  'tour',
]);

export interface DaylightFeasibilityOptions {
  latitudeDeg: number;
  longitudeDeg: number;
  utcOffsetMinutes?: number;
}

export function applyDaylightFeasibilityHints(
  plan: TripPlan,
  options: DaylightFeasibilityOptions,
): DaylightFeasibilitySignalSummary {
  const utcOffsetMinutes = options.utcOffsetMinutes ?? 0;
  const slotsEndingAfterCivilDusk: string[] = [];
  const slotsStartingBeforeCivilDawn: string[] = [];

  for (const day of plan.days) {
    const tw = approximateCivilTwilightLocal(
      day.date,
      options.latitudeDeg,
      options.longitudeDeg,
      utcOffsetMinutes,
    );
    if (!tw || tw.ambiguous) {
      continue;
    }

    const dawnM = parseIsoTimeToMinutes(tw.civilDawn);
    const duskM = parseIsoTimeToMinutes(tw.civilDusk);

    for (const slot of day.timeSlots) {
      if (!DAYLIGHT_SENSITIVE.has(slot.type)) {
        continue;
      }

      const t0 = parseIsoTimeToMinutes(slot.time);
      const t1 = slot.endTime ? parseIsoTimeToMinutes(slot.endTime) : t0;

      if (t1 > duskM) {
        slotsEndingAfterCivilDusk.push(slot.id);
        const endLabel = slot.endTime ?? slot.time;
        slot.reasons = [
          ...(slot.reasons ?? []),
          `[${TAG}] 结束 ${endLabel} 晚于民用暮光 ${tw.civilDusk}（暮光后户外/行车风险升高，冰川/高地路段需额外校验）`,
        ];
      }

      if (t0 < dawnM) {
        slotsStartingBeforeCivilDawn.push(slot.id);
        slot.reasons = [
          ...(slot.reasons ?? []),
          `[${TAG}] 开始 ${slot.time} 早于民用晨光 ${tw.civilDawn}（晨光前户外/行车风险升高）`,
        ];
      }
    }
  }

  const flagged = new Set([
    ...slotsEndingAfterCivilDusk,
    ...slotsStartingBeforeCivilDawn,
  ]);

  return {
    latitudeDeg: options.latitudeDeg,
    longitudeDeg: options.longitudeDeg,
    slotsEndingAfterCivilDusk,
    slotsStartingBeforeCivilDawn,
    violationCount: flagged.size,
  };
}
