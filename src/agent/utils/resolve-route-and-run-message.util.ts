import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

/** 从 recent_messages 逆序取最近一条用户话术（跳过系统注入块与助手回复） */
export function extractLatestUserMessageFromRecent(recent: string[] | undefined): string | null {
  if (!Array.isArray(recent) || recent.length === 0) {
    return null;
  }
  for (let i = recent.length - 1; i >= 0; i--) {
    const raw = recent[i]?.trim();
    if (!raw) continue;
    if (raw.startsWith('[系统注入') || raw.startsWith('[active_trip_summary')) {
      continue;
    }
    const prefixed = raw.match(/^用户[:：]\s*([\s\S]+)$/i) ?? raw.match(/^user[:：]\s*([\s\S]+)$/i);
    if (prefixed?.[1]?.trim()) {
      return prefixed[1].trim();
    }
    if (/^助手[:：]/i.test(raw)) {
      continue;
    }
    return raw;
  }
  return null;
}

/** 解析本轮有效用户消息：优先 `message`，否则 recent_messages 末条用户话术 */
export function resolveRouteAndRunUserMessage(
  request: Pick<RouteAndRunRequestDto, 'message' | 'conversation_context'>,
): string {
  const direct = request.message?.trim();
  if (direct) {
    return direct;
  }
  return extractLatestUserMessageFromRecent(request.conversation_context?.recent_messages) ?? '';
}

/** Plan Studio 等客户端有时只写 recent_messages；补齐顶层 message 供编排与 process_fairness 使用 */
export function normalizeRouteAndRunRequestMessage(request: RouteAndRunRequestDto): void {
  if (request.message?.trim()) {
    return;
  }
  request.message = resolveRouteAndRunUserMessage(request);
}
