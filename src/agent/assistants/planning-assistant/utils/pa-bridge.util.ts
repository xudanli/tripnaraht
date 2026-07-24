import type { ConversationMessage } from '../interfaces/planning-assistant.interface';

export type PaBridgeMessageRole = ConversationMessage['role'];

export type FormatPaHistoryOptions = {
  /** 默认 10 */
  limit?: number;
  /**
   * 若与 messageHistory 末尾 user 消息 content 相同，则排除该条（避免与 route_and_run.message 重复）。
   */
  excludeTrailingUserContent?: string;
};

/**
 * 将 PA 聊天气泡历史转化为 route_and_run.conversation_context.recent_messages。
 */
export function formatPaHistoryForRouteAndRun(
  history: ConversationMessage[] | undefined | null,
  limitOrOptions: number | FormatPaHistoryOptions = 10,
): string[] {
  const opts: FormatPaHistoryOptions =
    typeof limitOrOptions === 'number' ? { limit: limitOrOptions } : limitOrOptions;
  const limit = opts.limit ?? 10;

  if (!history?.length) {
    return [];
  }

  let filtered = history.filter((m) => m.role === 'user' || m.role === 'assistant');

  const exclude = opts.excludeTrailingUserContent?.trim();
  if (exclude) {
    const last = filtered[filtered.length - 1];
    if (last?.role === 'user' && last.content.trim() === exclude) {
      filtered = filtered.slice(0, -1);
    }
  }

  return filtered
    .slice(-limit)
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`);
}
