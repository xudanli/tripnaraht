import type { AccessCapacityPlanB } from '../interfaces/poi-access-capacity.interface';

/** C 端展示文案 — 与 poi-access-capacity/FRONTEND_API.md PlanBAction 表一致 */
export const POI_ACCESS_PLAN_B_ACTION_LABEL_ZH: Record<
  AccessCapacityPlanB['action'],
  string
> = {
  SHIFT_ARRIVAL: '改到达时刻',
  CHANGE_DATE: '改期',
  USE_ALTERNATIVE: '替代 POI',
  BOOK_NOW: '立即预订',
};

/** 决策空间方案卡 title — 禁止把 SHIFT_ARRIVAL 等内部 key 直接暴露给前端 */
export function planBActionLabelZh(action: string, detail?: string): string {
  const mapped = POI_ACCESS_PLAN_B_ACTION_LABEL_ZH[action as AccessCapacityPlanB['action']];
  if (mapped) return mapped;
  if (detail?.trim() && /[\u4e00-\u9fff]/.test(detail)) return detail.trim();
  return action;
}
