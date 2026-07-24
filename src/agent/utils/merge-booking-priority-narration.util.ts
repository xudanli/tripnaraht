/**
 * 将 booking_priority_list 并入 NARRATE 输出：正文只保留摘要 tip，详情交给 ui_display 卡片。
 */

import type { NarrationLike } from '../../decision/kernel/interfaces/phase-executor.interface';
import type { BookingPriorityList } from '../delivery/types/booking-priority-list.type';

function formatCountdownZh(seconds: number): string {
  if (seconds <= 0) return '已到期或需立即处理';
  const days = Math.floor(seconds / 86400);
  if (days >= 1) return `约 ${days} 天后`;
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) return `约 ${hours} 小时后`;
  const mins = Math.floor(seconds / 60);
  return mins >= 1 ? `约 ${mins} 分钟后` : '不到 1 分钟';
}

export function mergeBookingPriorityIntoNarration(
  narration: NarrationLike,
  list: BookingPriorityList | undefined,
): NarrationLike {
  if (!list?.items?.length) return narration;

  const critical = list.items.filter((i) => i.urgencyLevel === 'CRITICAL');
  const top = critical[0] ?? list.items[0];

  let tips = [...(narration.tips ?? [])];
  const summaryLine =
    `[预订优先级] ${critical.length ? `有 ${critical.length} 项需优先预约` : `共 ${list.items.length} 项待预订`}` +
    `；最近节点「${top.title}」${formatCountdownZh(top.timing.countdownSeconds)}。详情见下方「预订优先级」卡片。`;
  if (!tips.some((t) => t.startsWith('[预订优先级]'))) {
    tips.unshift(summaryLine.slice(0, 500));
  }
  if (tips.length > 14) tips = tips.slice(0, 14);

  let userSummary = (narration.user_friendly_summary ?? '').trim();
  if (critical.length && !userSummary.includes('优先预约')) {
    const prefix = `⚠️ 行程含 ${critical.length} 个需提前预约的硬节点，系统已按紧迫程度排序并生成日历提醒。`;
    userSummary = userSummary ? `${prefix}\n\n${userSummary}` : prefix;
  }

  return {
    ...narration,
    user_friendly_summary: userSummary,
    tips,
    booking_priority_list: list,
  };
}
