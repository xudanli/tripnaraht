/**
 * 前端（编排页 / agent chat）常在用户话术后附带当前日锚点，例如：
 *
 *   您好
 *
 *   [日程] Day2 Day 2 · 黄金圈
 *
 * 该后缀用于 UI 上下文，不应单独把寒暄升级为 TRIP_PLANNING / 全量状态机。
 */

/** 匹配文末「[日程] …」整行（含前导空行） */
const TRAILING_UI_DAY_SCHEDULE_RE =
  /(?:\r?\n)+\s*\[日程\][^\n\r]*\s*$/u;

/**
 * 去掉文末 UI 注入的 `[日程] DayN …` 锚点，保留用户真实话术。
 */
export function stripUiInjectedDayScheduleContext(message: string): string {
  const raw = String(message ?? '');
  if (!raw.includes('[日程]')) return raw;
  return raw.replace(TRAILING_UI_DAY_SCHEDULE_RE, '').trimEnd();
}
