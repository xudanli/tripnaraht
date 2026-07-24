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

/** 从 recent_messages 逆序取最近一条助手回复正文（不含「助手:」前缀） */
export function extractLatestAssistantMessageFromRecent(
  recent: string[] | undefined,
): string | null {
  if (!Array.isArray(recent) || recent.length === 0) {
    return null;
  }
  for (let i = recent.length - 1; i >= 0; i--) {
    const raw = recent[i]?.trim();
    if (!raw) continue;
    if (raw.startsWith('[系统注入') || raw.startsWith('[active_trip_summary')) {
      continue;
    }
    const prefixed =
      raw.match(/^助手[:：]\s*([\s\S]+)$/i) ?? raw.match(/^assistant[:：]\s*([\s\S]+)$/i);
    if (prefixed?.[1]?.trim()) {
      return prefixed[1].trim();
    }
  }
  return null;
}

/**
 * 用户点击「将以上建议应用到行程」类按钮时，message 往往只有元指令、不含建议正文。
 */
export function detectConsultationApplyAdviceIntent(message: string): boolean {
  const t = String(message ?? '').trim();
  if (!t) return false;
  if (/\[SYSTEM_MESSAGE\]\[CONSULTATION_APPLY\]/.test(t)) return false;
  const pointsToPrior =
    /(?:上文|以上|前述|刚才|先前|你(?:给出|提到|分析)|顾问).{0,24}(?:建议|分析|结论|方案)/.test(
      t,
    ) || /(?:根据|按照|依照).{0,24}(?:上文|以上|前述|刚才).{0,40}(?:建议|分析)/.test(t);
  const applyVerb =
    /(?:落实|应用到|应用到当前|合并调整|优化当前|调整行程|改到行程|写入行程|按建议改)/.test(t) ||
    /请使用行程规划模式/.test(t);
  return pointsToPrior && applyVerb;
}

const MAX_BOUND_ADVICE_CHARS = 3500;

/**
 * 将上轮助手建议绑定进本轮 message，供 INTAKE/PLAN_GEN 使用（否则「上文」是空指针）。
 * @returns true 若已改写 message
 */
export function bindPriorConsultationAdviceIntoMessage(
  request: Pick<RouteAndRunRequestDto, 'message' | 'conversation_context' | 'meta'>,
): boolean {
  const current = String(request.message ?? '').trim();
  if (!current || !detectConsultationApplyAdviceIntent(current)) {
    return false;
  }
  if (/\[SYSTEM_MESSAGE\]\[CONSULTATION_APPLY\]/.test(current)) {
    return false;
  }

  const advice = extractLatestAssistantMessageFromRecent(
    request.conversation_context?.recent_messages,
  );
  const meta = {
    ...((request.meta as Record<string, unknown> | undefined) ?? {}),
  } as Record<string, unknown>;

  if (!advice || advice.length < 40) {
    meta.consultation_apply_prior_bound = false;
    meta.consultation_apply_missing_prior = true;
    (request as RouteAndRunRequestDto).meta = meta as RouteAndRunRequestDto['meta'];
    request.message = [
      '[SYSTEM_MESSAGE][CONSULTATION_APPLY]',
      '未能从会话历史中找到上一条顾问建议正文。请先向用户确认要落实的具体改动（哪一天、哪些景点/住宿/路线），不要空跑重规划。',
      '',
      '[USER]',
      current,
    ].join('\n');
    return true;
  }

  const clipped = advice.length > MAX_BOUND_ADVICE_CHARS ? `${advice.slice(0, MAX_BOUND_ADVICE_CHARS)}…` : advice;
  meta.consultation_apply_prior_bound = true;
  meta.consultation_apply_missing_prior = false;
  meta.consultation_apply_prior_chars = clipped.length;
  (request as RouteAndRunRequestDto).meta = meta as RouteAndRunRequestDto['meta'];
  request.message = [
    '[SYSTEM_MESSAGE][CONSULTATION_APPLY]',
    '以下为上轮咨询建议正文（须按优先级落实；尽量不推翻未提及的日程）：',
    clipped,
    '',
    '[USER]',
    current,
  ].join('\n');
  return true;
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

/**
 * Plan Studio 等客户端有时只写 recent_messages；补齐顶层 message。
 * 并对「落实上文建议」类指令绑定上轮助手正文，避免上下文断开。
 */
export function normalizeRouteAndRunRequestMessage(request: RouteAndRunRequestDto): void {
  if (!request.message?.trim()) {
    request.message = resolveRouteAndRunUserMessage(request);
  }
  bindPriorConsultationAdviceIntoMessage(request);
}
