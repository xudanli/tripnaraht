/**
 * 组装面向用户的 answer_text（纯函数，从 ClaudeOrchestrator 迁出）。
 */

import type { OrchestratorState } from '../interfaces/trip-plan.interface';

/**
 * 优先使用 NARRATE 产出的摘要与逐日叙述，
 * 避免仅有「已为您生成 N 天」导致前端只展示一句空话。
 */
export function buildUserFacingAnswerText(state: OrchestratorState): string {
  const narr = state.narration;
  const parts: string[] = [];

  const summary = narr?.user_friendly_summary?.trim();
  if (summary) {
    parts.push(summary);
  }

  const preformattedDays = narr?.day_by_day_text_zh?.trim();
  if (preformattedDays) {
    parts.push(preformattedDays);
  } else {
    const days = narr?.day_by_day_narrative;
    if (Array.isArray(days) && days.length > 0) {
      const dayLines = days
        .map((d) => {
          const header =
            d.day != null
              ? `第 ${d.day} 天${d.date ? `（${d.date}）` : ''}`
              : d.date
                ? String(d.date)
                : '';
          const body = (d.narrative || '').trim();
          if (!header && !body) return '';
          return header ? `${header}\n${body}` : body;
        })
        .filter(Boolean);
      if (dayLines.length > 0) {
        parts.push(dayLines.join('\n\n'));
      }
    }
  }

  if (parts.length > 0) {
    return parts.join('\n\n');
  }

  const n = state.itinerary?.days?.length ?? 0;
  if (n > 0) {
    return `已为您生成 ${n} 天的行程安排。`;
  }
  return '处理完成。';
}
