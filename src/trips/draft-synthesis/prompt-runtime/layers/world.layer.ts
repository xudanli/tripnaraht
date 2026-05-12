import { DateTime } from 'luxon';

/**
 * World Layer —— 日历 / 世界状态（时区 + 星期）
 */
export function renderWorldCalendarLayer(
  days: Array<{ day: number; date: string }>,
  tz: string,
): string {
  const lines = days.map((d) => {
    const dt = DateTime.fromISO(d.date, { zone: tz });
    const zh = dt.setLocale('zh-Hans').toFormat('EEEE');
    const en = dt.setLocale('en').toFormat('cccc');
    return `- Day ${d.day} — ${d.date} · ${zh} (${en})`;
  });
  return `## 行程日历（Calendar / 世界状态）
${lines.join('\n')}`;
}
