/**
 * INTAKE 用户原话：避免把澄清卡/合议全文误当作下一轮 message 或 intake_user_message。
 */

import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';

const CLARIFICATION_ECHO_MARKERS =
  /按您本轮诉求|针对该诉求的可行性|安全节奏：|可行替代：|租车：您尚未说明两驱|guardian_debate|需要您确认或补充信息/;

/** 规划工作台 UI 占位/欢迎语（非用户真实提问） */
const WORKBENCH_PLACEHOLDER_MARKERS = [
  /已关联当前行程/,
  /在这一页提问/,
  /可选快捷语句/,
  /行程助手\s*Nara/i,
] as const;

/** 是否为规划工作台助手占位欢迎语（前端 echo，不应触发完整 TRIP_PLANNING） */
export function isWorkbenchAssistantPlaceholderMessage(text: string | undefined | null): boolean {
  const t = stripSystemMessageBlocksForIntakeNl(String(text ?? '')).trim();
  if (!t || t.length < 20) return false;
  const hits = WORKBENCH_PLACEHOLDER_MARKERS.filter((re) => re.test(t)).length;
  if (hits < 2) return false;
  // 真实用户问法通常更短且不含 UI 引导块
  if (t.length < 180 && !/可选快捷语句/.test(t)) return false;
  return true;
}

/** 是否为结构化澄清/辩论卡片回声（非用户自然语言输入） */
export function isStructuredClarificationEchoMessage(text: string | undefined | null): boolean {
  const t = String(text ?? '').trim();
  if (!t) return false;
  if (CLARIFICATION_ECHO_MARKERS.test(t)) return true;
  return t.length >= 120 && /不可行|NEED_USER_CONFIRM|接受分段环岛方案后继续/.test(t);
}

/** 保留 [SYSTEM_MESSAGE] 前缀，仅替换其后用户 NL */
export function rebuildTripPlanMessagePreservingSystemBlocks(
  currentMessage: string | undefined | null,
  userNl: string,
): string {
  const raw = String(currentMessage ?? '');
  const nl = userNl.trim();
  if (!nl) return raw.trim();
  const stripped = stripSystemMessageBlocksForIntakeNl(raw);
  if (!stripped || stripped === raw.trim()) return nl;
  const prefixEnd = raw.lastIndexOf(stripped);
  if (prefixEnd <= 0) return nl;
  const prefix = raw.slice(0, prefixEnd).trimEnd();
  return prefix ? `${prefix}\n\n${nl}` : nl;
}

/**
 *  canonical 用户原话：澄清回合勿用整张卡覆盖；优先保留上一轮真实 NL。
 */
export function resolveCanonicalIntakeUserMessage(params: {
  requestMessage?: string | null;
  previousIntake?: string | null;
}): string | undefined {
  const prev = params.previousIntake?.trim();
  const req = params.requestMessage?.trim();
  if (!req) return prev || undefined;
  if (!isStructuredClarificationEchoMessage(req)) return req;
  if (prev && !isStructuredClarificationEchoMessage(prev)) return prev;
  return prev || undefined;
}
