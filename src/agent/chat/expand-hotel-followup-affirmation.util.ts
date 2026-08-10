/**
 * 酒店推荐后的短确认（「需要 / 好的」）→ 显式库存检索句，避免误入 GENERAL_PLAN / CGUS。
 * iOS 日程编辑器常附带文末 `[日程] DayN …`，须先剥离再判定短确认。
 */

import { stripUiInjectedDayScheduleContext } from '../utils/ui-day-schedule-context.util';
import { parseLodgingChoiceDayNumber } from '../utils/day-lodging-choice.util';

const SHORT_AFFIRM_RE =
  /^(需要|好的?|可以|要|行|嗯+|是的?|确认|继续|帮我筛|筛一下|ok|okay|yes|sure|go\s*ahead|please)$/i;

/** 助手上一轮是否在邀请继续筛可订房 / 推荐住宿 */
const HOTEL_FOLLOWUP_OFFER_RE =
  /(?:如需|若需|需要的话|要的话)?.{0,24}?(?:筛|过滤|查|找|推荐).{0,24}?(?:霍芬|Höfn|Hofn|酒店|住宿|房源|可订)|(?:我可|我可以|还能).{0,16}?(?:筛|查|找|推荐).{0,24}?(?:酒店|住宿|房源|可订)|继续.{0,12}?(?:筛|查).{0,16}?(?:酒店|住宿|房源)|(?:酒店|住宿|民宿).{0,24}?(?:推荐|候选|可订|性价比)|换.{0,16}?(?:酒店|住宿)/i;

/** 上一轮用户是否在谈换住 / 搜酒店（无助手邀筛时的兜底） */
const PRIOR_USER_LODGING_RE =
  /(?:换一个|换成|换|改|找|搜|查|推荐).{0,40}?(?:酒店|住宿|民宿)|(?:酒店|住宿).{0,24}?(?:更近|靠近|性价比|不想早起|睡晚)|Day\s*\d+.{0,16}?(?:酒店|住宿)|第\s*\d+\s*天.{0,16}?(?:酒店|住宿)/i;

const DATE_IN_TEXT_RE =
  /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?|(\d{1,2})\s*[.．/]\s*(\d{1,2})\s*[日号]?|(\d{4})-(\d{2})-(\d{2})/;

const TRAILING_SCHEDULE_DAY_RE = /\[日程\]\s*Day\s*[-_]?\s*(\d+)/i;

function stripRolePrefix(line: string): { role: 'user' | 'assistant' | 'unknown'; text: string } {
  const s = String(line ?? '').trim();
  if (/^用户[:：]/.test(s)) return { role: 'user', text: s.replace(/^用户[:：]\s*/, '') };
  if (/^助手[:：]/.test(s)) return { role: 'assistant', text: s.replace(/^助手[:：]\s*/, '') };
  if (/^user[:：]/i.test(s)) return { role: 'user', text: s.replace(/^user[:：]\s*/i, '') };
  if (/^assistant[:：]/i.test(s)) return { role: 'assistant', text: s.replace(/^assistant[:：]\s*/i, '') };
  return { role: 'unknown', text: s };
}

function lastAssistantText(recentMessages: string[]): string | undefined {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const { role, text } = stripRolePrefix(recentMessages[i] ?? '');
    if (role === 'assistant' && text.trim()) return text.trim();
  }
  return undefined;
}

function lastUserText(recentMessages: string[]): string | undefined {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const { role, text } = stripRolePrefix(recentMessages[i] ?? '');
    if (role === 'user' && text.trim()) return text.trim();
    // 无角色前缀时：跳过助手块，取非空行作兜底用户话
    if (role === 'unknown' && text.trim() && !/^助手/.test(text)) {
      return text.trim();
    }
  }
  return undefined;
}

function extractStayDateHint(blobs: string[]): string | undefined {
  for (const blob of blobs) {
    const m = blob.match(DATE_IN_TEXT_RE);
    if (!m) continue;
    if (m[5] && m[6] && m[7]) {
      return `${Number(m[6])}月${Number(m[7])}日`;
    }
    const mo = m[1] ?? m[3];
    const day = m[2] ?? m[4];
    if (mo && day) return `${Number(mo)}月${Number(day)}日`;
  }
  return undefined;
}

function preferHofn(assistantText: string): boolean {
  return /霍芬|Höfn|Hofn/i.test(assistantText);
}

function resolveDayNumberFromMessage(raw: string): number | undefined {
  const fromSchedule = raw.match(TRAILING_SCHEDULE_DAY_RE);
  if (fromSchedule) {
    const n = Number(fromSchedule[1]);
    if (n >= 1) return n;
  }
  return parseLodgingChoiceDayNumber(stripUiInjectedDayScheduleContext(raw));
}

export function isShortHotelFollowupAffirmation(message: string): boolean {
  const stripped = stripUiInjectedDayScheduleContext(String(message ?? '')).trim();
  return SHORT_AFFIRM_RE.test(stripped);
}

export function assistantOffersHotelInventoryFollowup(assistantText: string): boolean {
  return HOTEL_FOLLOWUP_OFFER_RE.test(String(assistantText ?? ''));
}

function buildDayHotelInventoryQuery(dayNumber: number): string {
  return `请帮我推荐第${dayNumber}天性价比高、靠近次日行程的可订酒店`;
}

/**
 * 若当前句为短确认且（助手邀筛房 / 上轮用户在谈换住 / 带 DayN 日程锚）则扩成显式酒店库存检索句。
 */
export function expandHotelFollowupAffirmation(input: {
  message: string;
  recentMessages?: string[];
}): string {
  const raw = String(input.message ?? '').trim();
  if (!raw) return raw;
  if (!isShortHotelFollowupAffirmation(raw)) return raw;

  const recent = input.recentMessages ?? [];
  const assistant = lastAssistantText(recent);
  const priorUser = lastUserText(recent);
  const dayNumber = resolveDayNumberFromMessage(raw);

  if (assistant && assistantOffersHotelInventoryFollowup(assistant)) {
    const dateHint = extractStayDateHint([assistant, ...[...recent].reverse()]);
    if (dayNumber != null && !dateHint) {
      return buildDayHotelInventoryQuery(dayNumber);
    }
    const place = preferHofn(assistant) ? '霍芬（Höfn）' : '行程当晚末站附近';
    const datePart = dateHint ?? '';
    return `请帮我筛选${place}${datePart}可订酒店并给出推荐`;
  }

  if (priorUser && PRIOR_USER_LODGING_RE.test(priorUser)) {
    const day =
      dayNumber ??
      parseLodgingChoiceDayNumber(priorUser) ??
      resolveDayNumberFromMessage(priorUser);
    if (day != null) return buildDayHotelInventoryQuery(day);
    return '请帮我筛选行程当晚末站附近可订酒店并给出推荐';
  }

  // iOS 日程编辑器：短确认 + [日程] DayN，无 recent 时仍按当日搜酒店（避免「需要」进 CGUS）
  if (dayNumber != null) {
    return buildDayHotelInventoryQuery(dayNumber);
  }

  return raw;
}
