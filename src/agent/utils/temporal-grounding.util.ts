/**
 * 向 LLM 注入可验证的「当前时刻」锚点，减少自行编造「今天是某年某月」的幻觉。
 * MCP Agent 与轻量咨询编排共用。
 */

/** 英文单行锚点（MCP system 前缀）。 */
export function buildTemporalGroundingLine(now: Date = new Date()): string {
  const iso = now.toISOString();
  return `[Temporal anchor] UTC now: ${iso}. Interpret 今天/明天/后天 and weather startDate/endDate relative to this instant.`;
}

export function parseTripDatesFromLightweightContext(tripContextJoined: string): {
  startYmd?: string;
  endYmd?: string;
} {
  const startYmd = tripContextJoined.match(/开始日期:\s*(\d{4}-\d{2}-\d{2})/)?.[1];
  const endYmd =
    tripContextJoined.match(/结束日期:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ??
    tripContextJoined.match(/行程跨度:[^\d]*(\d{4}-\d{2}-\d{2})\s*[～~\-–—至到]\s*(\d{4}-\d{2}-\d{2})/)?.[2];
  return { startYmd, endYmd };
}

/** 轻量咨询编排用中文时间锚（与 buildLightweightClockFactPromptLines 的 UTC 参考一致）。 */
export function buildLightweightTemporalGroundingZhLines(
  now: Date = new Date(),
  opts?: { tripStartYmd?: string; tripEndYmd?: string },
): string[] {
  const iso = now.toISOString();
  const utcDate = iso.slice(0, 10);
  const lines: string[] = [
    `【UTC 参考 / 当前时刻】协调世界时：${utcDate}（ISO 8601：${iso}）。凡提及「当前日期」「今天」「近期」「出发前」均须以此为准；禁止自行推断或编造系统当前年月。`,
  ];
  const start = opts?.tripStartYmd;
  if (start) {
    const endPart = opts.tripEndYmd ? `，结束：${opts.tripEndYmd}` : '';
    const tripMid = Date.parse(`${start}T12:00:00.000Z`);
    const days = Number.isFinite(tripMid)
      ? Math.round((tripMid - now.getTime()) / 86_400_000)
      : undefined;
    const lead =
      days !== undefined && Number.isFinite(days)
        ? `；距出行开始约 ${days} 天（据此判断是否在气象/路况预报有效窗口内）`
        : '';
    lines.push(`【相对行程】出行开始日：${start}${endPart}${lead}。`);
  }
  return lines;
}

const LIGHTWEIGHT_CURRENT_TIME_CUE =
  /当前日期|当前时间|当前[（(]|当前为|今天是|由于当前|眼下|如今|截至今天|as of today|current date|today is/i;

/**
 * 检测轻量回答是否在「当前时刻」语境下引用了与服务器 UTC 不一致的年月（如编造 2025年4月）。
 */
export function lightweightAnswerCitesWrongCurrentYm(
  answer: string,
  now: Date = new Date(),
): boolean {
  const text = answer.trim();
  if (!text) return false;

  const refY = now.getUTCFullYear();
  const refM = now.getUTCMonth() + 1;

  const nearCue = (index: number, before = 96, after = 24): boolean => {
    const start = Math.max(0, index - before);
    return LIGHTWEIGHT_CURRENT_TIME_CUE.test(text.slice(start, index + after));
  };

  for (const match of text.matchAll(/(\d{4})\s*年\s*(\d{1,2})\s*月/g)) {
    const idx = match.index ?? 0;
    if (!nearCue(idx)) continue;
    const y = Number.parseInt(match[1], 10);
    const m = Number.parseInt(match[2], 10);
    if (!Number.isFinite(y) || !Number.isFinite(m)) continue;
    if (y !== refY || m !== refM) return true;
  }

  for (const match of text.matchAll(/(\d{4})-(\d{2})(?:-(\d{2}))?/g)) {
    const idx = match.index ?? 0;
    if (!nearCue(idx)) continue;
    const y = Number.parseInt(match[1], 10);
    const m = Number.parseInt(match[2], 10);
    if (y !== refY || m !== refM) return true;
  }

  return false;
}

/**
 * 距出发尚不足半年，正文却声称「超过一年」等（常由错误「当前日期」推算导致）。
 */
export function lightweightAnswerImpliesWrongTripLeadTimeClaim(
  answer: string,
  daysUntilTripStart: number | undefined,
): boolean {
  if (daysUntilTripStart === undefined || !Number.isFinite(daysUntilTripStart)) {
    return false;
  }
  if (daysUntilTripStart >= 330) return false;
  return /超过\s*一\s*年|一年以上|一年多|more than (a )?year/i.test(answer);
}

export function shouldRepairLightweightTemporalHallucination(
  answer: string,
  now: Date = new Date(),
  opts?: { daysUntilTripStart?: number },
): boolean {
  return (
    lightweightAnswerCitesWrongCurrentYm(answer, now) ||
    lightweightAnswerImpliesWrongTripLeadTimeClaim(answer, opts?.daysUntilTripStart)
  );
}

/** 轻量咨询时间幻觉修复指令（接在首轮 prompt 之后）。 */
export function buildLightweightTemporalRepairSuffix(
  now: Date = new Date(),
  opts?: { tripStartYmd?: string; tripEndYmd?: string },
): string {
  const iso = now.toISOString();
  const utcDate = iso.slice(0, 10);
  const ymZh = `${now.getUTCFullYear()}年${now.getUTCMonth() + 1}月`;
  const tripPart = opts?.tripStartYmd
    ? `出行开始日为 ${opts.tripStartYmd}${opts.tripEndYmd ? `、结束 ${opts.tripEndYmd}` : ''}；请按【相对行程】中的距出发天数表述时效，勿写「超过一年」除非距出发确实超过 330 天。`
    : '';
  return (
    `\n\n【系统纠正 · 时间锚】你上一版回答中的「当前日期/今天」与系统 UTC 不一致。` +
    `系统当前时刻为 ${utcDate}（${ymZh}，ISO：${iso}）。请重写：凡描述「当前」「今天」「近期」「出发前多久」必须以该时刻为准；删除错误的年月表述。${tripPart}`
  );
}

export function computeDaysUntilTripStartYmd(
  tripStartYmd: string | undefined,
  now: Date = new Date(),
): number | undefined {
  if (!tripStartYmd) return undefined;
  const tripMid = Date.parse(`${tripStartYmd}T12:00:00.000Z`);
  if (!Number.isFinite(tripMid)) return undefined;
  return Math.round((tripMid - now.getTime()) / 86_400_000);
}
