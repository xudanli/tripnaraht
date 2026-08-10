import type { ConversationLifecycle } from './conversation-turn-result.constants';

/**
 * 将 Trip.status + 日期窗解析为对话生命周期（不新增意图）。
 */
export function resolveConversationLifecycle(params: {
  tripStatus?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  /** 墙钟今天 YYYY-MM-DD */
  todayYmd?: string | null;
}): ConversationLifecycle {
  const status = String(params.tripStatus ?? '')
    .trim()
    .toUpperCase();

  if (status === 'COMPLETED' || status === 'CANCELLED' || status === 'ARCHIVED') {
    return 'COMPLETED';
  }
  if (status === 'TRAVELING' || status === 'IN_PROGRESS') {
    return 'TRAVELING';
  }
  if (
    status === 'PLANNING' ||
    status === 'DRAFT' ||
    status === 'RECRUITING' ||
    status === 'FORMING'
  ) {
    // 日期窗内但未点开始：仍可按墙钟视为 TRAVELING 口径（执行答问）
    const today = String(params.todayYmd ?? '').slice(0, 10);
    const start = String(params.startDate ?? '').slice(0, 10);
    const end = String(params.endDate ?? '').slice(0, 10);
    if (today && start && end && today >= start && today <= end) {
      return 'TRAVELING';
    }
    return 'PLANNING';
  }

  if (!status) {
    const today = String(params.todayYmd ?? '').slice(0, 10);
    const start = String(params.startDate ?? '').slice(0, 10);
    const end = String(params.endDate ?? '').slice(0, 10);
    if (today && start && end && today >= start && today <= end) return 'TRAVELING';
    if (today && end && today > end) return 'COMPLETED';
    if (start) return 'PLANNING';
  }

  return 'UNKNOWN';
}
