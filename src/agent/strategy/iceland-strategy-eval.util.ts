/**
 * 冰岛 driving 策略命中（纯函数）。与 `tripOverlapsIcelandWinterStuddedWindow` 冬季窗口语义保持同步。
 * 不 import skills 仲裁文件，避免与 `iceland-vehicle-terrain-arbitrator.util` 形成环依赖。
 */
import type { Itinerary } from '../interfaces/trip-plan.interface';
import type { IcelandStrategyDocumentV1 } from './world-strategy.types';

/** 与 `CarRentalDriveInference` 对齐；本地声明以避免 skills↔agent 环 */
export type IcelandDriveInference = 'likely_2wd_only' | 'four_wheel_present' | 'unknown';

export type IcelandDrivingStrategyEvalContext = {
  itinerary: Itinerary;
  fRoad: boolean;
  drive: IcelandDriveInference;
  icelandContext: boolean;
};

/** 与 `tripOverlapsIcelandWinterStuddedWindow` 一致：11/1–次年 4/15 重叠即 true */
export function itineraryOverlapsIcelandWinterStrategyWindow(itinerary: Itinerary): boolean {
  for (const d of itinerary.days ?? []) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d.date ?? '');
    if (!m) continue;
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month === 11 || month === 12 || month === 1 || month === 2 || month === 3) return true;
    if (month === 4 && day <= 15) return true;
  }
  return false;
}

export function listMatchedIcelandDrivingStrategyIds(
  doc: IcelandStrategyDocumentV1 | undefined,
  ctx: IcelandDrivingStrategyEvalContext,
): string[] {
  if (!doc?.principles?.driving || !ctx.icelandContext) return [];
  const driving = doc.principles.driving;
  const out: string[] = [];

  const winter = itineraryOverlapsIcelandWinterStrategyWindow(ctx.itinerary);
  const w001 = driving.winter_f_road_prohibited?.id;
  if (ctx.fRoad && winter && typeof w001 === 'string' && w001.trim()) {
    out.push(w001.trim());
  }

  const w002 = driving.two_wheel_drive_f_road_prohibited?.id;
  if (ctx.fRoad && ctx.drive === 'likely_2wd_only' && typeof w002 === 'string' && w002.trim()) {
    out.push(w002.trim());
  }

  return [...new Set(out)];
}
