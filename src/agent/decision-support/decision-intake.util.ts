/**
 * 决策识别：显式选择句 / 冲突目标 → DecisionCandidate。
 * 不扩开放域万能意图；仅命中 Registry。
 */

import { DECISION_REGISTRY } from './decision-registry';
import { stripPlanningModeWrapper } from '../utils/strip-planning-mode-wrapper.util';

export type DecisionCandidate = {
  decisionKey: string;
  confidence: number;
  reason: 'explicit_choice' | 'conflict_goals' | 'select_commit' | 'system_trigger';
};

function stripNoise(message: string): string {
  return stripPlanningModeWrapper(String(message ?? ''))
    .replace(/\n*\[日程\][\s\S]*$/u, '')
    .trim();
}

/** 用户正在提交某选项：选择南岸 / 选 4WD / 回复 1 / 我选择：两驱 */
export function detectDecisionSelectIntent(message: string): {
  optionHint?: string;
  ordinal?: number;
  /** 输入框被错误地塞入多个方案 id/文案 */
  ambiguousMultiSelect?: boolean;
} | null {
  const m = stripNoise(message);
  if (!m) return null;

  /** 客户端把多个 chip（如 2WD、4WD、确认并继续）一次性填进输入框 */
  const idHits = (m.match(/\b(?:2WD|4WD_PLUS|4WD|SOUTH_COAST|RING_ROAD)\b/gi) ?? []).length;
  const choiceHits = (m.match(/我选择/g) ?? []).length;
  if (idHits >= 2 || choiceHits >= 2 || /、.{0,12}(?:2WD|4WD|两驱|四驱)/.test(m) && /(?:2WD|4WD|两驱|四驱).{0,12}、/.test(m)) {
    return { ambiguousMultiSelect: true };
  }

  const ordinal = m.match(/^(?:选|选择|我选|就选)?\s*([123])\s*[.、)]?\s*$/);
  if (ordinal) return { ordinal: Number(ordinal[1]) };

  const choosePrefixed = m.match(
    /^(?:我选择(?:（推荐）)?|选择（推荐）|选推荐|选择|我选|就选|决定)[:：]?\s*(.+)$/u,
  );
  if (choosePrefixed?.[1]?.trim()) {
    return { optionHint: choosePrefixed[1].trim().slice(0, 64) };
  }

  if (/^(?:选|选择|我选|就选|决定)\s*/u.test(m) || /选(?:这个|该方案|方案)/u.test(m)) {
    const rest = m.replace(/^(?:选|选择|我选|就选|决定)\s*/u, '').trim();
    if (rest.length >= 2) return { optionHint: rest.slice(0, 48) };
  }

  /** 单独提交技术 id（旧客户端） */
  if (/^(?:2WD|4WD_PLUS|4WD|SOUTH_COAST|RING_ROAD|HUB_STAY|FOLLOW_ROUTE|JOIN|SKIP|LIGHT_ALT)$/i.test(m)) {
    return { optionHint: m };
  }

  return null;
}

/**
 * 显式「A 还是 B / 应该选哪个 / 要不要」→ 注册表命中。
 */
export function detectDecisionSupportCandidate(message: string): DecisionCandidate | null {
  const m = stripNoise(message);
  if (!m || m.length < 4) return null;

  /** 已是明确指令改稿（删掉/换成）且非「要不要」——让位 ITINERARY_ADJUST */
  if (
    /(?:删掉|删除|去掉|换成|替换成|移到|挪到)/u.test(m) &&
    !/(?:要不要|还是|值不值得)/u.test(m)
  ) {
    return null;
  }

  for (const def of DECISION_REGISTRY) {
    for (const re of def.explicitPatterns) {
      if (re.test(m)) {
        return { decisionKey: def.decisionKey, confidence: 0.92, reason: 'explicit_choice' };
      }
    }
  }

  /** 隐式冲突目标 → 住宿策略 / 节奏 */
  if (
    /不想.{0,8}换酒店|少换酒店/.test(m) &&
    /(?:开太久|驾驶|车程|太累|轻松)/.test(m)
  ) {
    return {
      decisionKey: 'ACCOMMODATION_MOVEMENT',
      confidence: 0.88,
      reason: 'conflict_goals',
    };
  }
  if (
    /想看更多|想去更多|体验丰富/.test(m) &&
    /(?:不想|不要).{0,8}(?:开太久|太赶|太累)|少开车|轻松/.test(m)
  ) {
    return { decisionKey: 'DAILY_PACE', confidence: 0.86, reason: 'conflict_goals' };
  }

  return null;
}
