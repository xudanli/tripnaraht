/**
 * 小红书 MCP 结果 → TripNARA 社区体验证据（Experience Bundle）。
 * sourceType=COMMUNITY；强度上限 MODERATE；非事实权威。
 */

export type XhsEvidenceStrength = 'WEAK' | 'MODERATE';

export type XhsEvidenceFact = {
  factId: string;
  sourceType: 'COMMUNITY';
  evidenceKind: 'recent_social_image' | 'community_note';
  strength: XhsEvidenceStrength;
  freshness: 'ASSUMED' | 'STALE';
  title?: string;
  excerpt?: string;
  sourceUrl?: string;
  mediaUrl?: string;
  authorRef?: string;
  engagement?: {
    liked?: number;
    collected?: number;
    commented?: number;
  };
  observedAt?: string;
  disclaimerZh: string;
};

export type XhsExperienceBundle = {
  query: string;
  destinationHint?: string;
  sampleSize: number;
  stance: { worth: number; skip: number; conditional: number; unclear: number };
  themes: Array<{ label: string; count: number; quoteIds: string[] }>;
  risksMentioned: string[];
  facts: XhsEvidenceFact[];
  evidenceRefs: string[];
  disclaimerZh: string;
  source: 'xiaohongshu';
};

function asRecord(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : null;
}

function pickStr(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function pickNum(o: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  }
  return undefined;
}

function extractFeedRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.map(asRecord).filter((x): x is Record<string, unknown> => !!x);
  }
  const root = asRecord(raw);
  if (!root) return [];
  for (const key of [
    'feeds',
    'items',
    'list',
    'data',
    'notes',
    'results',
    'feed_list',
  ]) {
    const v = root[key];
    if (Array.isArray(v) && v.length) {
      return v.map(asRecord).filter((x): x is Record<string, unknown> => !!x);
    }
    const nested = asRecord(v);
    if (nested) {
      for (const nk of ['feeds', 'items', 'list', 'notes']) {
        const arr = nested[nk];
        if (Array.isArray(arr) && arr.length) {
          return arr
            .map(asRecord)
            .filter((x): x is Record<string, unknown> => !!x);
        }
      }
    }
  }
  return [];
}

const WORTH_RE =
  /(?<!不)值得|推荐|必去|太美了|强烈推荐|不会后悔|超值|下次还来|打卡成功/i;
const SKIP_RE = /不值得|别去|踩坑|后悔|避雷|劝退|千万别|浪费钱|大坑/i;
const COND_RE = /看天气|看季节|体力|关门|预约|看路况|小心|注意|有条件|看情况/i;

const RISK_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /天气|刮风|下雨|暴风|能见度/i, label: '天气风险' },
  { re: /F[- ]?road|土路|封路|路况|洗车/i, label: '道路风险' },
  { re: /体力|高原|累|徒步难度/i, label: '体力门槛' },
  { re: /预约|售罄|关门|停业|季节/i, label: '开放/预约' },
  { re: /贵|坑|宰客|预算/i, label: '价格体验' },
];

const THEME_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /冰川|ice\s*cave|冰川湖/i, label: '冰川' },
  { re: /徒步|hiking|trail/i, label: '徒步' },
  { re: /向导|团|跟团|diy/i, label: '向导/行程形式' },
  { re: /装备|钉鞋|冲锋衣|防水/i, label: '装备' },
  { re: /拍照|出片|机位/i, label: '拍照' },
];

function classifyStance(
  text: string,
): keyof XhsExperienceBundle['stance'] {
  // 先判负向（「不值得」含「值得」子串，不能先跑 WORTH）
  if (SKIP_RE.test(text)) return 'skip';
  if (COND_RE.test(text) && WORTH_RE.test(text)) return 'conditional';
  if (COND_RE.test(text)) return 'conditional';
  if (WORTH_RE.test(text)) return 'worth';
  return 'unclear';
}

function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function mapXhsFeedRowToFact(
  row: Record<string, unknown>,
  idx: number,
): XhsEvidenceFact | null {
  const id =
    pickStr(row, ['feed_id', 'feedId', 'note_id', 'noteId', 'id', 'model_type']) ||
    `xhs-${idx}`;
  const title = pickStr(row, ['title', 'display_title', 'desc', 'name']);
  const content = pickStr(row, [
    'content',
    'desc',
    'description',
    'text',
    'note_card',
  ]);
  const excerptSrc = content || title;
  if (!excerptSrc && !title) return null;

  const liked = pickNum(row, [
    'liked_count',
    'likedCount',
    'like_count',
    'likes',
  ]);
  const collected = pickNum(row, [
    'collected_count',
    'collectedCount',
    'collect_count',
  ]);
  const commented = pickNum(row, [
    'comment_count',
    'commentCount',
    'comments_count',
  ]);
  const engagementSum = (liked ?? 0) + (collected ?? 0) + (commented ?? 0);
  const strength: XhsEvidenceStrength =
    engagementSum >= 200 || (liked ?? 0) >= 100 ? 'MODERATE' : 'WEAK';

  const author =
    pickStr(row, ['user_id', 'userId', 'author_id']) ||
    (() => {
      const u = asRecord(row.user) || asRecord(row.author);
      return u ? pickStr(u, ['user_id', 'userId', 'id', 'nickname', 'name']) : undefined;
    })();

  const cover =
    pickStr(row, ['cover', 'coverUrl', 'image', 'mainPic']) ||
    (() => {
      const imgs = row.images ?? row.image_list;
      if (Array.isArray(imgs) && imgs.length) {
        const first = imgs[0];
        if (typeof first === 'string') return first;
        const fr = asRecord(first);
        return fr
          ? pickStr(fr, ['url', 'url_default', 'info_list'])
          : undefined;
      }
      return undefined;
    })();

  const url =
    pickStr(row, ['url', 'share_url', 'note_url', 'link']) ||
    (id && !id.startsWith('xhs-')
      ? `https://www.xiaohongshu.com/explore/${id}`
      : undefined);

  return {
    factId: `xhs:${id}`,
    sourceType: 'COMMUNITY',
    evidenceKind: cover ? 'recent_social_image' : 'community_note',
    strength,
    freshness: 'ASSUMED',
    ...(title ? { title: truncate(title, 120) } : {}),
    ...(excerptSrc ? { excerpt: truncate(excerptSrc, 600) } : {}),
    ...(url ? { sourceUrl: url } : {}),
    ...(cover ? { mediaUrl: cover } : {}),
    ...(author ? { authorRef: author } : {}),
    engagement: {
      ...(liked != null ? { liked } : {}),
      ...(collected != null ? { collected } : {}),
      ...(commented != null ? { commented } : {}),
    },
    observedAt: pickStr(row, [
      'time',
      'publish_time',
      'create_time',
      'lastUpdateTime',
    ]),
    disclaimerZh: '小红书社区体验，非官方事实',
  };
}

export function mapXhsFeedsToExperienceBundle(input: {
  query: string;
  destinationHint?: string | null;
  raw: unknown;
  limit?: number;
}): XhsExperienceBundle {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 30);
  const rows = extractFeedRows(input.raw).slice(0, limit);
  const facts: XhsEvidenceFact[] = [];
  for (let i = 0; i < rows.length; i++) {
    const f = mapXhsFeedRowToFact(rows[i]!, i);
    if (f) facts.push(f);
  }

  const stance = { worth: 0, skip: 0, conditional: 0, unclear: 0 };
  const themeMap = new Map<string, { count: number; quoteIds: string[] }>();
  const risks = new Set<string>();

  for (const f of facts) {
    const text = `${f.title ?? ''} ${f.excerpt ?? ''}`;
    stance[classifyStance(text)] += 1;
    for (const t of THEME_PATTERNS) {
      if (t.re.test(text)) {
        const cur = themeMap.get(t.label) ?? { count: 0, quoteIds: [] };
        cur.count += 1;
        if (cur.quoteIds.length < 5) cur.quoteIds.push(f.factId);
        themeMap.set(t.label, cur);
      }
    }
    for (const r of RISK_PATTERNS) {
      if (r.re.test(text)) risks.add(r.label);
    }
  }

  const themes = [...themeMap.entries()]
    .map(([label, v]) => ({ label, count: v.count, quoteIds: v.quoteIds }))
    .sort((a, b) => b.count - a.count);

  return {
    query: input.query,
    ...(input.destinationHint?.trim()
      ? { destinationHint: input.destinationHint.trim() }
      : {}),
    sampleSize: facts.length,
    stance,
    themes,
    risksMentioned: [...risks],
    facts,
    evidenceRefs: facts.map((f) => f.factId),
    disclaimerZh:
      '基于小红书社区体验抽样，非官方事实；与天气/道路/库存冲突时以官方传感器为准。',
    source: 'xiaohongshu',
  };
}
