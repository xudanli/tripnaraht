/**
 * 小红书社区笔记 → Chat / iOS 卡片（summary_json.xhs_note_cards）。
 * 仅投影有可打开链接的笔记；标明 COMMUNITY、非官方事实。
 */

import type { XhsEvidenceFact, XhsExperienceBundle } from '../../mcp/xiaohongshu-evidence.mapper';
import { XHS_COMMUNITY_EVIDENCE_DISCLAIMER_ZH } from '../../mcp/format-xhs-experience-narrator.util';

export const XHS_NOTE_CARDS_SCHEMA = 'tripnara/chat_xhs_note_cards@v1' as const;

/**
 * 轻量 CONSULT / live sensor：是否应拉取小红书社区体验证据。
 * 与 slimLoad 例外、shouldAttemptXhsSensor 共用。
 */
export function isXhsCommunityEvidenceConsultQuery(message: string): boolean {
  const m = String(message ?? '').trim();
  if (!m) return false;
  if (/小红书|xhs\b|xiaohongshu|rednote/i.test(m)) return true;
  if (/值不值得|值得去吗|踩坑|避雷|大家怎么说|网上怎么说|社区(体验|评价|反馈)/.test(m)) {
    return true;
  }
  return false;
}

/** 从用户话术构造 search_feeds keyword（保留目的地/主题，去掉元指令噪声） */
export function buildXhsSearchKeywordFromMessage(
  message: string,
  destinationHint?: string | null,
): string {
  let k = String(message ?? '')
    .replace(/看看小红书怎么[样做说看]?/g, ' ')
    .replace(/小红书|xhs|xiaohongshu|rednote/gi, ' ')
    .replace(/然后|帮我|请问|一下/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const dest = String(destinationHint ?? '').trim();
  if (dest && dest.length <= 24 && !k.includes(dest)) {
    k = `${dest} ${k}`.trim();
  }
  if (!k || k.length < 2) {
    k = dest ? `${dest} 旅行体验` : '旅行体验 值不值得';
  }
  return k.slice(0, 80);
}

export type XhsNoteChatCard = {
  id: string;
  title: string;
  titleZh: string;
  excerpt?: string;
  /** 笔记页 https（explore / 分享链） */
  url: string;
  photoUrl?: string;
  authorRef?: string;
  likedCount?: number;
  collectedCount?: number;
  cta_zh: string;
  disclaimerZh: string;
  source: 'xiaohongshu';
  sourceType: 'COMMUNITY';
  fields_zh: Array<{ key: string; label: string; value: string }>;
  field_labels_zh: Record<string, string>;
  actions: Array<{
    action: string;
    label: string;
    labelCN: string;
    params?: Record<string, unknown>;
  }>;
};

export type XhsNoteSearchMeta = {
  query?: string;
  sample_size?: number;
  disclaimer_zh: string;
  source: 'xiaohongshu';
  ui_layout_hint_zh?: string;
};

function isHttpUrl(u: string): boolean {
  return /^https?:\/\//i.test(u);
}

function factToCard(fact: XhsEvidenceFact, idx: number): XhsNoteChatCard | null {
  const url = String(fact.sourceUrl ?? '').trim();
  if (!url || !isHttpUrl(url)) return null;
  const title = String(fact.title ?? fact.excerpt ?? `小红书笔记 ${idx + 1}`).trim();
  const excerpt = fact.excerpt?.trim();
  const photoUrl = fact.mediaUrl?.trim();
  const liked = fact.engagement?.liked;
  const collected = fact.engagement?.collected;
  const disclaimerZh = fact.disclaimerZh?.trim() || XHS_COMMUNITY_EVIDENCE_DISCLAIMER_ZH;

  const fields_zh: XhsNoteChatCard['fields_zh'] = [];
  if (excerpt) fields_zh.push({ key: 'excerpt', label: '摘要', value: excerpt.slice(0, 160) });
  if (fact.authorRef) fields_zh.push({ key: 'author', label: '作者', value: fact.authorRef });
  if (liked != null) fields_zh.push({ key: 'liked', label: '点赞', value: String(liked) });
  if (collected != null) {
    fields_zh.push({ key: 'collected', label: '收藏', value: String(collected) });
  }
  fields_zh.push({ key: 'source', label: '来源', value: '小红书·社区体验' });
  fields_zh.push({ key: 'disclaimer', label: '说明', value: disclaimerZh });

  const field_labels_zh: Record<string, string> = {};
  for (const f of fields_zh) field_labels_zh[f.key] = f.label;

  return {
    id: fact.factId || `xhs-note-${idx}`,
    title,
    titleZh: title,
    ...(excerpt ? { excerpt: excerpt.slice(0, 280) } : {}),
    url,
    ...(photoUrl ? { photoUrl } : {}),
    ...(fact.authorRef ? { authorRef: fact.authorRef } : {}),
    ...(liked != null ? { likedCount: liked } : {}),
    ...(collected != null ? { collectedCount: collected } : {}),
    cta_zh: '查看笔记',
    disclaimerZh,
    source: 'xiaohongshu',
    sourceType: 'COMMUNITY',
    fields_zh,
    field_labels_zh,
    actions: [
      {
        action: 'open_xhs_note_url',
        label: 'Open note',
        labelCN: '查看笔记',
        params: { url },
      },
    ],
  };
}

export function mapXhsExperienceBundleToNoteCards(
  bundle: XhsExperienceBundle | null | undefined,
  opts?: { limit?: number },
): XhsNoteChatCard[] {
  if (!bundle?.facts?.length) return [];
  const limit = Math.min(Math.max(opts?.limit ?? 6, 1), 12);
  const out: XhsNoteChatCard[] = [];
  for (let i = 0; i < bundle.facts.length && out.length < limit; i++) {
    const card = factToCard(bundle.facts[i]!, i);
    if (card) out.push(card);
  }
  return out;
}

export function buildXhsNoteSearchMeta(
  bundle: XhsExperienceBundle | null | undefined,
): XhsNoteSearchMeta {
  return {
    ...(bundle?.query ? { query: bundle.query } : {}),
    ...(typeof bundle?.sampleSize === 'number' ? { sample_size: bundle.sampleSize } : {}),
    disclaimer_zh: bundle?.disclaimerZh?.trim() || XHS_COMMUNITY_EVIDENCE_DISCLAIMER_ZH,
    source: 'xiaohongshu',
    ui_layout_hint_zh: '社区体验笔记卡；打开 https 链接；非官方事实',
  };
}

function asBundle(raw: unknown): XhsExperienceBundle | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.facts)) return null;
  return raw as XhsExperienceBundle;
}

/** 从 agentic envelope / research_data / payload 树提取体验包 */
export function extractXhsExperienceBundlesFromUnknown(root: unknown): XhsExperienceBundle[] {
  const bundles: XhsExperienceBundle[] = [];
  const seen = new Set<unknown>();
  const stack: unknown[] = [root];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (seen.size > 500) break;

    const o = cur as Record<string, unknown>;
    const direct = asBundle(o.experience_bundle ?? o.communityExperience);
    if (direct?.facts?.length) bundles.push(direct);

    const ev = o.communityExperienceEvidence;
    if (ev && typeof ev === 'object') {
      const arr = (ev as { bundles?: unknown }).bundles;
      if (Array.isArray(arr)) {
        for (const b of arr) {
          const mapped = asBundle(b);
          if (mapped?.facts?.length) bundles.push(mapped);
        }
      }
    }

    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item);
      continue;
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return bundles;
}

/** 从任意嵌套结果投影笔记卡 + meta（去重 url） */
export function projectXhsNoteCardsFromUnknown(root: unknown): {
  xhs_note_cards: XhsNoteChatCard[];
  xhs_search_meta?: XhsNoteSearchMeta;
} {
  const bundles = extractXhsExperienceBundlesFromUnknown(root);
  if (!bundles.length) return { xhs_note_cards: [] };

  const seenUrl = new Set<string>();
  const cards: XhsNoteChatCard[] = [];
  for (const b of bundles) {
    for (const c of mapXhsExperienceBundleToNoteCards(b)) {
      if (seenUrl.has(c.url)) continue;
      seenUrl.add(c.url);
      cards.push(c);
      if (cards.length >= 8) break;
    }
    if (cards.length >= 8) break;
  }
  if (!cards.length) return { xhs_note_cards: [] };
  return {
    xhs_note_cards: cards,
    xhs_search_meta: buildXhsNoteSearchMeta(bundles[0]),
  };
}
