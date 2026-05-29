/**
 * Decision OS 世界状态快照（Source of Truth 结构化投影，v1）。
 * 单次 Tick 内由 Kernel/Tools 经收拢入口变更；LLM 只读叙事投影。
 */

/** Prisma / DB 可能返回 Date；出站世界状态统一为 ISO 字符串。 */
export function formatDecisionOsTripTime(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

export interface DecisionOsTripDayItem {
  type?: string | null;
  note?: string | null;
  placeName?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

export interface DecisionOsTripDay {
  date: string;
  items: DecisionOsTripDayItem[];
}

export interface DecisionOsWorldState {
  revision: 'v1';
  tripId: string;
  name?: string | null;
  status?: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  days: DecisionOsTripDay[];
}
