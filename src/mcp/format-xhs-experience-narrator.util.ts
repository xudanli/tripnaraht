/**
 * 小红书社区体验证据 → Narrator / 用户可见文案模板。
 * 硬约束：标明「社区体验，非官方事实」；与天气/道路/库存并陈时官方优先。
 */

import type { XhsExperienceBundle } from './xiaohongshu-evidence.mapper';

export const XHS_COMMUNITY_EVIDENCE_DISCLAIMER_ZH =
  '基于小红书社区体验抽样，非官方事实；与天气/道路/库存冲突时以官方传感器为准。';

export type XhsExperienceNarratorInput = Pick<
  XhsExperienceBundle,
  'query' | 'sampleSize' | 'stance' | 'themes' | 'risksMentioned' | 'disclaimerZh'
> & {
  destinationHint?: string;
};

function stanceLineZh(stance: XhsExperienceBundle['stance']): string {
  const parts: string[] = [];
  if (stance.worth > 0) parts.push(`值得/推荐 ${stance.worth}`);
  if (stance.skip > 0) parts.push(`不建议 ${stance.skip}`);
  if (stance.conditional > 0) parts.push(`看条件 ${stance.conditional}`);
  if (stance.unclear > 0) parts.push(`态度不明 ${stance.unclear}`);
  return parts.length ? parts.join('，') : '样本态度分散';
}

/** 供 Observation summary / LLM 工具结果摘要 */
export function formatXhsExperienceNarratorBlock(
  bundle: XhsExperienceNarratorInput,
): string {
  const disclaimer = bundle.disclaimerZh?.trim() || XHS_COMMUNITY_EVIDENCE_DISCLAIMER_ZH;
  const themeTop = (bundle.themes ?? [])
    .slice(0, 4)
    .map((t) => t.label)
    .join('、');
  const risks = (bundle.risksMentioned ?? []).slice(0, 4).join('、');
  const dest = bundle.destinationHint?.trim();
  const lines = [
    `【社区体验·小红书】查询「${bundle.query}」${dest ? `（${dest}）` : ''}，抽样 ${bundle.sampleSize} 条。`,
    `立场分布：${stanceLineZh(bundle.stance)}。`,
  ];
  if (themeTop) lines.push(`高频主题：${themeTop}。`);
  if (risks) lines.push(`提及风险：${risks}。`);
  lines.push(`【说明】${disclaimer}`);
  return lines.join('');
}

/** Narration tips 单行（更短） */
export function formatXhsExperienceTipZh(
  bundle: XhsExperienceNarratorInput,
): string {
  const disclaimer = bundle.disclaimerZh?.trim() || XHS_COMMUNITY_EVIDENCE_DISCLAIMER_ZH;
  const stance = stanceLineZh(bundle.stance);
  return `[社区体验] 小红书抽样 ${bundle.sampleSize} 条（${stance}）。${disclaimer}`;
}

/** 若正文尚未含社区说明，则追加一段尾注 */
export function appendXhsCommunityDisclaimerToAnswer(
  answerText: string,
  disclaimerZh?: string | null,
): string {
  const base = String(answerText ?? '').trim();
  const disclaimer = (disclaimerZh?.trim() || XHS_COMMUNITY_EVIDENCE_DISCLAIMER_ZH).trim();
  if (!disclaimer) return base;
  if (!base) return `【说明】${disclaimer}`;
  if (base.includes('社区体验') || base.includes(disclaimer)) return base;
  return `${base}\n\n【说明】${disclaimer}`;
}

/** 从 route-and-run / tool 结果树中提取小红书 disclaimer（若有） */
export function extractXhsDisclaimerFromUnknown(root: unknown): string | null {
  const seen = new Set<unknown>();
  const stack: unknown[] = [root];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (seen.size > 400) break;
    const o = cur as Record<string, unknown>;
    if (typeof o.disclaimer_zh === 'string' && o.disclaimer_zh.includes('社区体验')) {
      return o.disclaimer_zh.trim();
    }
    if (typeof o.disclaimerZh === 'string' && o.disclaimerZh.includes('社区体验')) {
      return o.disclaimerZh.trim();
    }
    const bundle = o.experience_bundle ?? o.communityExperience;
    if (bundle && typeof bundle === 'object') {
      const d = (bundle as { disclaimerZh?: unknown; disclaimer_zh?: unknown }).disclaimerZh
        ?? (bundle as { disclaimer_zh?: unknown }).disclaimer_zh;
      if (typeof d === 'string' && d.includes('社区体验')) return d.trim();
    }
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item);
      continue;
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return null;
}
