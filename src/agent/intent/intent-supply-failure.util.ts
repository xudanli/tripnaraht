/**
 * 意图型 POI 新增失败时的补给稀疏区反哺文案（产品层，不访问 DB）。
 */

import type { PoiIntentProfile } from '../utils/itinerary-item-add-intent.util';

export interface SupplyGapFailureOpts {
  dayNumber?: number;
  anchorMissing?: boolean;
  searchRadiusKm?: number;
  countryCode?: string;
}

/** 冰岛稀疏补给场景的固定建议（与 sparse-supply.pack 叙事对齐） */
export function buildSupplyGapFailureGuidance(
  profile: PoiIntentProfile,
  opts?: SupplyGapFailureOpts,
): string {
  const dayPart = opts?.dayNumber ? `第${opts.dayNumber}天` : '该天';
  const radius = opts?.searchRadiusKm ?? 35;

  if (opts?.anchorMissing) {
    return `${dayPart}行程项缺少坐标，无法按「${profile.intentLabel}」做附近检索。请先在时间轴上确认当天景点已入库，或指定具体店名（如 Krónan、Bónus）。`;
  }

  const icelandHint =
    opts?.countryCode?.toUpperCase() === 'IS' || !opts?.countryCode
      ? `冰岛南岸/高地部分路段补给稀疏（${radius}km 内可能无超市）。建议：① 在前一日雷克雅未克/Selfoss 或大镇（Vík、Höfn）集中采购；② 携带至少 1 日水食；③ 准备度检查中的「补给稀疏」规则会提示强制补给点。`
      : `当前搜索半径 ${radius}km 内未找到${profile.intentLabel}。可尝试指定具体名称，或扩大活动区域至最近城镇。`;

  return `未在${dayPart}景点附近（约 ${radius}km）找到合适的${profile.intentLabel}。${icelandHint}`;
}
