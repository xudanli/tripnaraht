/**
 * Intent → WorldCommand — 用户自然语言落到世界约束（非直接改 prompt）
 * MVP：启发式规则；后续可接 NLU / LLM 结构化输出。
 */

import type { WorldCommand } from './world-command.types';

/**
 * 将短语映射为一条世界命令；无法识别时返回 `undefined`。
 */
export function userPhraseToWorldCommand(text: string): WorldCommand | undefined {
  const t = text.trim();
  if (!t) {
    return undefined;
  }

  const wantsLessMountain =
    /不想|不要|避免|少|别/.test(t) &&
    (/山路|盘山|发卡|mountain|switchback|hairpin/i.test(t) ||
      /很长|太久|太多/.test(t));

  if (wantsLessMountain) {
    return {
      type: 'ADD_DRIVING_CONSTRAINT',
      constraint: { maxMountainRoadRatio: 0.2 },
    };
  }

  return undefined;
}
