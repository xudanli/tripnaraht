/**
 * Itinerary Day Editor (date-level) Copilot — prompts, limits, rule copy.
 * Advisor for「这一天怎么排」— not a system tip assistant.
 */

import { NARA_UNIFIED_SYSTEM_PROMPT } from './activity-editor-ai';

export { NARA_UNIFIED_SYSTEM_PROMPT };

/** Planning status for the selected day (card title / diag). */
export type DayPlanStatus =
  | 'INCOMPLETE'
  | 'BLOCKED'
  | 'TIGHT'
  | 'OPTIMIZABLE'
  | 'READY';

/** @deprecated Prefer DayPlanStatus; kept for evaluation.daySeverity compat. */
export type DaySeverity = 'CLEAR' | 'SOFT' | 'HARD';

export function dayPlanStatusToSeverity(status: DayPlanStatus): DaySeverity {
  if (status === 'READY') return 'CLEAR';
  if (status === 'BLOCKED') return 'HARD';
  return 'SOFT';
}

export const ITINERARY_DAY_EDITOR_PAGE_PROMPT = `你是 TripNARA 的日程编排顾问 Nara。

请根据用户当前选中的一天，说明当天安排是否完整、合理、可执行，并给出一个最重要的下一步。

规则：
1. 只分析当前日期，不讨论无关日期或全行程问题。
2. 优先级：硬冲突 > 规划缺失 > 时间窗与驾驶 > 空档与顺序 > 预订状态。
3. 必须指出具体时间、活动或住宿，不说「建议调整」等空话。
4. 一次只给一个主要建议。
5. 不重复页面已有标题和活动列表。
6. 不介绍系统功能，不说明字段在哪里修改。
7. 数据过期仅在影响当前判断时作为次要提示，不得作为主建议。
8. 推荐必须来自已验证方案；无验证方案时只说明缺什么、先看什么。
9. 信息不足时，明确指出缺少什么。
10. summary 与 suggestion 合计不超过65个汉字。

字数限制：
summary 不超过45个汉字；
suggestion 不超过20个汉字。

输出 JSON：
{"status":"INSIGHT|SILENT|CONTEXT_MISSING|DATA_CONFLICT","summary":"...","suggestion":"..."}`;

export const DAY_EDITOR_SUMMARY_MAX = 45;
export const DAY_EDITOR_SUGGESTION_MAX = 20;
export const DAY_EDITOR_TITLE_MAX = 12;
/** Gap minutes before we treat as「较长空档」. */
export const DAY_GAP_OPTIMIZE_MINUTES = 90;
/** Transfer buffer minutes below this → TIGHT (only very tight handoffs). */
export const DAY_BUFFER_TIGHT_MINUTES = 10;

export type DayAdvisorStatus =
  | 'INSIGHT'
  | 'SILENT'
  | 'CONTEXT_MISSING'
  | 'DATA_CONFLICT';

export interface DayAdvisorLlmOutput {
  status: DayAdvisorStatus;
  summary: string;
  suggestion: string;
}

export const DAY_NO_VALIDATED_FALLBACK: DayAdvisorLlmOutput = {
  status: 'INSIGHT',
  summary: '当天存在冲突，修复方案尚未通过验证。',
  suggestion: '先打开冲突核对时间窗。',
};

export const DAY_CONTEXT_MISSING_COPY: DayAdvisorLlmOutput = {
  status: 'CONTEXT_MISSING',
  summary: '缺少当前日期，无法评估当日安排。',
  suggestion: '请选择行程日期。',
};

export const DAY_SILENT_COPY: DayAdvisorLlmOutput = {
  status: 'SILENT',
  summary: '当天安排完整且可执行。',
  suggestion: '可继续微调细节。',
};

/** Feasibility / world-state messages that must not dominate the day card. */
export function isSystemMaintenanceIssue(message: string): boolean {
  return /规则已超|未核验|超过\s*\d+\s*天|数据过期|证据过期|STALE|未更新的开放/i.test(
    message,
  );
}

export function dayPlanStatusTitle(status: DayPlanStatus, dayIndex?: number): string {
  const day = dayIndex != null ? `Day ${dayIndex}` : '当天';
  switch (status) {
    case 'INCOMPLETE':
      return `${day}规划不完整`.slice(0, 12);
    case 'BLOCKED':
      return '当天不可行';
    case 'TIGHT':
      return '缓冲偏紧';
    case 'OPTIMIZABLE':
      return '可优化编排';
    case 'READY':
      return '当天已就绪';
  }
}
