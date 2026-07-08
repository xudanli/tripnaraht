import type { GuideTravelContext } from '../types/guide-to-plan.types';

export interface GuidePendingConfirmation {
  field: string;
  label: string;
  reason: string;
  required: boolean;
}

/**
 * 出行条件 / 草案页待用户确认项（对齐 Gate1 requiredConfirmations 语义，无人格包装）。
 */
export function buildPendingConfirmations(
  travelContext?: GuideTravelContext | null,
  session?: { countryCode?: string | null; destination?: string | null },
  packHints?: GuidePendingConfirmation[],
): GuidePendingConfirmation[] {
  const items: GuidePendingConfirmation[] = [];
  const ctx = travelContext ?? {};

  if (!ctx.startDate) {
    items.push({
      field: 'startDate',
      label: '出发日期',
      reason: '攻略通常不含具体日期，需确认本次出行时间',
      required: true,
    });
  }
  if (!ctx.endDate) {
    items.push({
      field: 'endDate',
      label: '返回日期',
      reason: '用于计算行程天数与每日活动密度',
      required: true,
    });
  }
  if (!ctx.travelers?.adults && !ctx.travelers?.children && !ctx.travelers?.seniors) {
    items.push({
      field: 'travelers',
      label: '出行成员',
      reason: '成员构成影响每日强度与活动筛选',
      required: true,
    });
  }
  if (!ctx.transportMode || ctx.transportMode === 'unknown') {
    items.push({
      field: 'transportMode',
      label: '交通方式',
      reason: '自驾/跟团/公交会显著影响路线可行性',
      required: true,
    });
  }
  if (!ctx.countryCode && !session?.countryCode) {
    items.push({
      field: 'countryCode',
      label: '目的地国家',
      reason: '用于 POI 匹配与道路/季节规则校验',
      required: true,
    });
  }
  if (!ctx.preserveExperiences?.length) {
    items.push({
      field: 'preserveExperiences',
      label: '最想保留的体验',
      reason: '可选；填写后草案会优先保留对应地点',
      required: false,
    });
  }
  mergePackHints(items, packHints);

  return items;
}

function mergePackHints(
  items: GuidePendingConfirmation[],
  packHints?: GuidePendingConfirmation[],
) {
  if (!packHints?.length) return;
  for (const hint of packHints) {
    if (items.some((i) => i.field === hint.field)) continue;
    items.push(hint);
  }
}
