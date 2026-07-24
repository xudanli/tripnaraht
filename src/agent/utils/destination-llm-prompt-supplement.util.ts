/**
 * 按目的地/稀疏 profile 注入 LLM prompt 补充段（Intent / Discovery / Triage 共用）。
 */

import { resolveSparseRegionProfile } from '../../planning-policy/profiles/sparse-region.profile';

export interface DestinationLlmPromptSupplementInput {
  userMessage?: string;
  countryCode?: string;
  destinationHint?: string;
  regionTags?: string[];
}

const ICELAND_RE =
  /冰岛|iceland|雷克雅|reykjav|vik|维克|黄金圈|南岸|ring\s*road|f[\s-]?road|高地|highland/i;

/** 解析 ISO 3166-1 alpha-2（粗匹配） */
export function inferCountryCodeFromText(text: string): string | undefined {
  const t = String(text ?? '');
  if (/格陵兰|greenland|\bGL\b/i.test(t)) return 'GL';
  if (/斯瓦尔巴|svalbard|longyearbyen|朗伊尔|\bSJ\b/i.test(t)) return 'SJ';
  if (/冰岛|iceland|\bIS\b/i.test(t)) return 'IS';
  if (/日本|japan|东京|tokyo|\bJP\b/i.test(t)) return 'JP';
  if (/中国|china|\bCN\b/i.test(t)) return 'CN';
  return undefined;
}

export function resolveDestinationLlmPromptSupplement(
  input: DestinationLlmPromptSupplementInput,
): string | undefined {
  const hint = [input.destinationHint, input.userMessage].filter(Boolean).join(' ');
  const cc =
    String(input.countryCode ?? '').trim().toUpperCase() ||
    inferCountryCodeFromText(hint)?.toUpperCase();

  const sparse = resolveSparseRegionProfile({
    countryCode: cc,
    destinationHint: hint,
    regionTags: input.regionTags,
  });

  const sections: string[] = [];

  if (sparse) {
    sections.push(
      `## 稀疏极地 / 开放世界（${sparse.regionTag}）`,
      '- POI 数据库密度极低：勿因「候选 POI 不足」判定规划失败。',
      '- 用户提及的长尾体验（皮划艇、极光天气窗、防熊缓冲等）应视为 **provisional / elastic** 节点，非缺失目的地。',
      '- 正确策略：Discovery Buffer + intentional slack（留白），而非强行 fillMissingSlots。',
      `- minPoiRequired=${sparse.minPoiRequired}；freezeFillMissingSlots=${sparse.freezeFillMissingSlots}。`,
      `- 默认留白原因码：${sparse.slackSlotTemplate.defaultReasonCode}（约 ${sparse.slackSlotTemplate.minMinutes}–${sparse.slackSlotTemplate.maxMinutes} 分钟）。`,
    );
  }

  if (cc === 'IS' || ICELAND_RE.test(hint)) {
    sections.push(
      '## 冰岛特化',
      '- F-road / 高地：须结合季节、车辆等级、SafeTravel 与 Vedur 证据；2WD 默认不可进高地。',
      '- 可并列 safetravel.get_advisories + world.buildContext，不替代点位级 opening_hours。',
    );
  }

  if (cc === 'GL') {
    sections.push(
      '## 格陵兰特化',
      '- 体验多为 expedition / 船程 / 向导团，少固定 placeId。',
      '- 迪斯科湾、东格陵兰等需对齐天气窗与持证向导。',
    );
  }

  if (cc === 'SJ') {
    sections.push(
      '## 斯瓦尔巴特化',
      '- 朗伊尔城为基地；野外活动须考虑 polar bear safety buffer。',
      '- 极光观测依赖天气窗，不宜排满 POI。',
    );
  }

  if (!sections.length) return undefined;
  return sections.join('\n');
}
