/** INTAKE 车型抽取：仅用户侧 NL，避免助手/System 历史（含辩论「2WD+24h」文案）污染。 */

import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import { sliceRecentMessagesForProfile } from '../context/utils/conversation-context-window.util';

export type TripPlanVehicleType = '2WD' | '4WD';

const ASSISTANT_LINE = /^\s*(助手|assistant|system|系统|ai|bot)\s*[:：]/i;
const USER_LINE = /^\s*(用户|user|human)\s*[:：]/i;

function stripRolePrefix(line: string): string {
  return line.replace(/^\s*(用户|user|human|助手|assistant|system|系统|ai|bot)\s*[:：]\s*/i, '').trim();
}

/**
 * 过滤对话历史：去掉助手/System/系统注入行；保留「用户:」行（去前缀）与无角色前缀的用户原话。
 * ContextEnricher 的 `[系统注入·用户长期偏好摘要]` / `[系统注入·当前行程摘要]` 不得参与目的地/日期抽取。
 */
export function filterUserAuthoredIntakeLines(messages: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of messages) {
    const line = String(raw ?? '').trim();
    if (!line) continue;
    if (ASSISTANT_LINE.test(line)) continue;
    if (/^\s*\[SYSTEM_MESSAGE\]/i.test(line)) continue;
    if (/^\s*\[系统注入/i.test(line)) continue;
    out.push(USER_LINE.test(line) ? stripRolePrefix(line) : line);
  }
  return out;
}

export function normalizeIntakeTextDigits(text: string): string {
  return String(text).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));
}

/** 当前轮 message + 最近用户话（不含助手/System），用于车型等「须用户明示」的抽取。 */
export function buildUserAuthoredIntakeTextBundle(
  message: string | undefined | null,
  recentMessages?: readonly string[] | null,
): string {
  const userRecent = sliceRecentMessagesForProfile(
    'orchestrator_claude',
    filterUserAuthoredIntakeLines(recentMessages ?? []),
  );
  const parts = [message, ...userRecent].map((s) => String(s ?? '').trim()).filter(Boolean);
  return normalizeIntakeTextDigits(parts.join('\n'));
}

export function parseVehicleTypeFromUserIntakeText(text: string): TripPlanVehicleType | undefined {
  const t = normalizeIntakeTextDigits(text);
  if (/4wd|4x4|四驱|四驱车/i.test(t)) return '4WD';
  if (/2wd|两驱|二驱|前驱/i.test(t)) return '2WD';
  if (
    /雅力士|yaris|经济型|小型车|普通.*(?:车|轿车)|丰田.*(?:轿车|小车)/i.test(t) &&
    !/4wd|4x4|四驱/i.test(t)
  ) {
    return '2WD';
  }
  return undefined;
}

export function extractVehicleTypeFromIntakeInputs(
  message: string | undefined | null,
  recentMessages?: readonly string[] | null,
): TripPlanVehicleType | undefined {
  return parseVehicleTypeFromUserIntakeText(buildUserAuthoredIntakeTextBundle(message, recentMessages));
}

/**
 * 去掉 INTAKE 注入块，避免体能画像 / 长期偏好 / 行程摘要等干扰 NL 目的地·日期抽取。
 * 例：偏好「从杭州自驾出发」不得把绑定冰岛行程误写成目的地杭州。
 */
export function stripSystemMessageBlocksForIntakeNl(text: string): string {
  return String(text ?? '')
    .replace(/\[SYSTEM_MESSAGE\][\s\S]*?(?:\n\n|$)/gi, '')
    .replace(/\[系统注入[^\]]*\][\s\S]*?(?=\n\[|\n\n(?![-•*])|$)/gi, '')
    .trim();
}

/**
 * 车型仅认「本轮用户原话」，不用 recent_messages（常含上一轮助手合议全文里的 2WD 字样）。
 */
export function extractVehicleTypeFromCurrentUserMessage(
  message: string | undefined | null,
): TripPlanVehicleType | undefined {
  return parseVehicleTypeFromUserIntakeText(stripSystemMessageBlocksForIntakeNl(String(message ?? '')));
}

/** 用户是否在 NL 中明示两驱/四驱（与 trip.constraints 是否被误写无关）。 */
export function isVehicleTypeUserSpecifiedInNl(
  trip: { constraints?: { vehicle_type?: string } } | undefined | null,
  intakeUserMessage?: string | null,
): boolean {
  const msg =
    intakeUserMessage ??
    stripSystemMessageBlocksForIntakeNl(
      String((trip as { message?: string } | undefined)?.message ?? ''),
    );
  const vt = extractVehicleTypeFromCurrentUserMessage(msg);
  return vt === '2WD' || vt === '4WD';
}

/**
 * 去掉误写入的 constraints.vehicle_type。
 * - 用户本轮明示车型 → 以 NL 为准
 * - 未明示时：仅清除可疑的 stale **2WD**（助手合议/偏好污染常见）；**保留 4WD**
 *   （行程 metadata / 决策写回的已确认四驱不得被静默丢掉，否则 VERIFY 会回退到画像「冬季冰岛2WD」假冲突）
 */
export function reconcileTripPlanVehicleConstraints(
  trip: TripPlanRequest,
  intakeUserMessage?: string | null,
): TripPlanRequest {
  const nl =
    intakeUserMessage ??
    stripSystemMessageBlocksForIntakeNl(String(trip.message ?? ''));
  const fromNl = extractVehicleTypeFromCurrentUserMessage(nl);
  if (fromNl) {
    return {
      ...trip,
      constraints: { ...(trip.constraints ?? {}), vehicle_type: fromNl },
    };
  }
  if (trip.constraints?.vehicle_type !== '2WD') return trip;
  const { vehicle_type: _omit, ...rest } = trip.constraints;
  const next = { ...trip };
  if (Object.keys(rest).length > 0) {
    next.constraints = rest as typeof trip.constraints;
  } else {
    delete next.constraints;
  }
  return next;
}
