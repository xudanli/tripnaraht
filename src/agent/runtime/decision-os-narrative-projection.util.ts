import { buildBriefItineraryLinesFromTripDays } from '../../trips/utils/trip-prompt-summary.util';
import type { DecisionOsWorldState } from './decision-os-world-state.types';

/**
 * 将结构化世界状态压缩为 LLM 叙事投影（与 RouteAndRunContextEnricher 粒度对齐）。
 */
export function compressWorldStateToNarrative(
  world: DecisionOsWorldState | null | undefined,
  tripId: string,
): string {
  if (!world || !tripId.trim()) {
    return '';
  }

  const lines: string[] = [];
  lines.push(`[active_trip_summary trip_id=${tripId}]`);
  if (world.name) lines.push(`名称: ${world.name}`);
  if (world.status) lines.push(`状态: ${world.status}`);
  if (world.destination) lines.push(`目的地代码: ${world.destination}`);
  if (world.startDate) lines.push(`开始: ${world.startDate}`);
  if (world.endDate) lines.push(`结束: ${world.endDate}`);

  const dayInputs = world.days.map((d) => ({
    date: d.date ? new Date(`${d.date}T00:00:00.000Z`) : null,
    ItineraryItem: d.items.map((it) => ({
      note: it.note ?? null,
      type: it.type ?? null,
      Place: it.placeName
        ? { nameCN: it.placeName, nameEN: null }
        : null,
    })),
  }));

  lines.push(...buildBriefItineraryLinesFromTripDays(dayInputs));

  return `[系统注入·当前行程摘要]\n${lines.join('\n')}`;
}
