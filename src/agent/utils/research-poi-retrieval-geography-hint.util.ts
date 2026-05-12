/**
 * RESEARCH 阶段 `poi.search` 的地理基串：在「行程表目的地=整国冰岛」但用户只给出
 * 南/西入口 + 北部锚点（如 KEF/雷克雅未克—阿克雷里）且未在话里写「冰岛/Iceland」时，
 * 用走廊式基串替代默认的「冰岛」，避免向量/关键词检索被整国 centroid 拉偏。
 *
 * 不参与 DSO 决策；仅影响检索 query 文本。`buildPoiSearchContext` 仍用原始 `trip.destination`。
 */

export interface ResolveResearchPoiBaseQueryHintInput {
  tripDestination: string;
  userMessage: string;
}

function tripDestinationIsBroadIcelandOnly(dest: string): boolean {
  const t = dest.trim();
  if (!t) return false;
  if (t === '冰岛' || t === '冰島') return true;
  if (/^iceland$/i.test(t)) return true;
  if (/^ísland$/i.test(t)) return true;
  return false;
}

function userExplicitlyNamesIcelandCountry(userMessage: string): boolean {
  return /冰岛|冰島|\b(iceland|ísland)\b/i.test(userMessage);
}

function icelandCorridorZhAnchors(tripDestination: string, userMessage: string): string[] | null {
  const dest = (tripDestination ?? '').trim();
  const msg = (userMessage ?? '').trim();
  if (!msg || !tripDestinationIsBroadIcelandOnly(dest)) return null;
  if (userExplicitlyNamesIcelandCountry(msg)) return null;

  const zh: string[] = [];
  if (/凯夫拉维克|\bKEF\b/i.test(msg)) zh.push('凯夫拉维克');
  if (/雷克雅未克|雷克雅維克|\bReykjavik\b|reykjavík/i.test(msg)) zh.push('雷克雅未克');
  if (/阿克雷里|\bAkureyri\b/i.test(msg)) zh.push('阿克雷里');

  const hasSouthEntry = zh.some((x) => x === '凯夫拉维克' || x === '雷克雅未克');
  const hasNorthAnchor = zh.includes('阿克雷里');
  if (!hasSouthEntry || !hasNorthAnchor) return null;

  return [...new Set(zh)];
}

export interface SparseCatalogRestDayPoiSearchHintsInput {
  tripDestination: string;
  userMessage: string;
  /** 当前占位日，1-based（与行程日序号一致） */
  dayNumber1Based: number;
  totalDays: number;
}

/**
 * 单 POI 多日 →「待安排」日时给工作台的 **建议检索串**（只读提示；不触发自动检索）。
 * 冰岛 KEF/雷克雅未克—阿克雷里走廊：按日序粗分南 / 中 / 北段关键词，便于二次 `poi.search`。
 */
export function buildSparseCatalogRestDayPoiSearchHints(input: SparseCatalogRestDayPoiSearchHintsInput): string[] {
  const dest = (input.tripDestination ?? '').trim();
  const msg = (input.userMessage ?? '').trim();
  const d = input.dayNumber1Based;
  const total = Math.max(1, input.totalDays);
  const out: string[] = [];

  const corridorZh = icelandCorridorZhAnchors(dest, msg);
  if (corridorZh && corridorZh.length > 0) {
    const t1 = Math.max(1, Math.ceil(total / 3));
    const t2 = Math.max(1, Math.floor((2 * total) / 3));
    const phase = d <= t1 ? 'south' : d >= t2 ? 'north' : 'central';
    if (phase === 'south') {
      out.push(
        `South Iceland Ring Road scenic stops day ${d} of ${total}`,
        '冰岛南岸 一号公路 沿途 景点 斯科加瀑布 维克',
      );
    } else if (phase === 'north') {
      out.push(
        `North Iceland Akureyri region attractions day ${d} of ${total}`,
        '冰岛北部 米湖 众神瀑布 胡萨维克 阿克雷里周边',
      );
    } else {
      out.push(
        `Iceland Ring Road central segment day ${d} of ${total}`,
        '冰岛东部 埃伊尔斯塔济 环岛 沿途 观景台',
      );
    }
    out.push(`Keflavík Reykjavik Akureyri Iceland corridor day ${d} scenic POI`);
  } else if (dest && dest !== 'destination') {
    out.push(`${dest} day ${d} attractions scenic`);
  }
  const snippet = msg.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (snippet.length > 5) out.push(`${snippet} POI search`);

  const seen = new Set<string>();
  return out
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => {
      if (!s || seen.has(s.toLowerCase())) return false;
      seen.add(s.toLowerCase());
      return true;
    })
    .slice(0, 5);
}

/**
 * @returns 若应覆盖整国基串则返回新基串；否则 `undefined`（调用方继续用 trip 目的地）。
 */
export function resolveResearchPoiBaseQueryHint(input: ResolveResearchPoiBaseQueryHintInput): string | undefined {
  const dest = (input.tripDestination ?? '').trim();
  const msg = (input.userMessage ?? '').trim();
  const anchors = icelandCorridorZhAnchors(dest, msg);
  if (!anchors || anchors.length === 0) return undefined;
  return `${anchors.join(' ')} Iceland scenic route corridor`.replace(/\s+/g, ' ').trim();
}
