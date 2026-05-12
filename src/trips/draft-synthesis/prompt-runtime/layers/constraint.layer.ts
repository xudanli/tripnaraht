import type { CreateTripDraftDto } from '../../../dto/trip-draft.dto';

/**
 * Constraint Layer —— 结构化需求摘要 + 时段槽位定义（硬形状）
 */
export function renderStructuredConstraintLayer(dto: CreateTripDraftDto): string {
  return `## 结构化需求摘要
- 目的地（ISO）：${dto.destination}
- 行程天数：${dto.days}（与日历 Day 1…N 对齐）
- 风格：${dto.style || 'balanced'}
- 强度：${dto.intensity || 'balanced'}
- 交通方式（草案假设）：${dto.transport || 'walk'}
- 其他约束（JSON）：${JSON.stringify(dto.constraints || {})}

## 时段定义（草案 slot）
- morning: 9:00-12:00
- lunch: 12:00-13:30（**必须** cat=RESTAURANT 的 placeId，除非 deferred）
- afternoon: 13:30-17:30
- dinner: 18:00-20:00（**必须** cat=RESTAURANT，除非 deferred）
- evening: 20:00-22:00（**可选**；信息不足或疲劳风险高时可 deferred）
`;
}
