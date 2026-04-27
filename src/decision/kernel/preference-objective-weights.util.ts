/**
 * Preference → ObjectiveFunction 权重（V2 意图感知世界模型的挂钩）
 *
 * - 供 INTENT_CHANGE / styleTags 更新时调用 `ObjectiveFunctionService.updateWeights` 前合并权重。
 * - CGUS 内 `DEFAULT_UNIFIED_WEIGHTS` 仍为另一路径；长期应对齐或注入同一套 wi。
 */

import type { ObjectiveFunctionWeights } from '../../trips/decision/optimization/objective-function.interface';
import { DEFAULT_OBJECTIVE_WEIGHTS } from '../../trips/decision/optimization/objective-function.interface';

function renormalize(w: ObjectiveFunctionWeights): ObjectiveFunctionWeights {
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  if (sum <= 0 || !Number.isFinite(sum)) return { ...DEFAULT_OBJECTIVE_WEIGHTS };
  const out = { ...w };
  for (const k of Object.keys(out) as (keyof ObjectiveFunctionWeights)[]) {
    out[k] = out[k] / sum;
  }
  return out;
}

/**
 * 根据 `UserIntent.styleTags` 粗分类，返回与默认权重合并并归一化后的全量权重。
 * 未命中任何画像时返回 `undefined`（调用方可跳过 `updateWeights`）。
 */
export function mergeObjectiveWeightsWithStyleTags(
  styleTags: string[] | undefined,
  base: ObjectiveFunctionWeights = DEFAULT_OBJECTIVE_WEIGHTS,
): ObjectiveFunctionWeights | undefined {
  if (!styleTags?.length) return undefined;
  const s = styleTags.join(' ').toLowerCase();

  // 极致出片：抬高体验密度，略压时间余量
  if (/出片|打卡|摄|photo|instagram|人像/.test(s)) {
    return renormalize({
      ...base,
      experienceDensity: Math.min(0.32, base.experienceDensity + 0.08),
      timeSlack: Math.max(0.06, base.timeSlack - 0.02),
      philosophyAlignment: Math.max(0.1, base.philosophyAlignment - 0.02),
    });
  }

  // 深度静谧：抬高哲学对齐与疲劳惩罚权重，压低体验密度
  if (/静谧|安静|慢|修|zen|meditat|放空|隐居/.test(s)) {
    return renormalize({
      ...base,
      philosophyAlignment: Math.min(0.28, base.philosophyAlignment + 0.08),
      fatigueRisk: Math.min(0.24, base.fatigueRisk + 0.06),
      experienceDensity: Math.max(0.12, base.experienceDensity - 0.06),
      timeSlack: Math.min(0.14, base.timeSlack + 0.04),
    });
  }

  // 特种兵式：偏高密度与体验，压余量
  if (/特种兵|拉满|暴走|rush|紧凑|赶场/.test(s)) {
    return renormalize({
      ...base,
      experienceDensity: Math.min(0.28, base.experienceDensity + 0.06),
      timeSlack: Math.max(0.05, base.timeSlack - 0.04),
      fatigueRisk: Math.max(0.1, base.fatigueRisk - 0.03),
    });
  }

  return undefined;
}
