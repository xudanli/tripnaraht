/**
 * 从 hotel/activity 检索参数中抽取飞猪可用的中文城市/目的地。
 * 川藏等自驾线：景点名映射到宜住城镇，避免默认落到「成都」。
 */

export type FliggyLodgingSearchResolved = {
  destName: string;
  poiName?: string;
  keyWords?: string;
};

/** 知名城市（可直接作 dest_name） */
const CITY_HINT_RE =
  /(北京|上海|广州|深圳|杭州|成都|重庆|西安|南京|苏州|三亚|厦门|青岛|武汉|长沙|昆明|丽江|大理|桂林|拉萨|林芝|波密|昌都|康定|理塘|巴塘|芒康|左贡|香格里拉|稻城|九寨沟|乌鲁木齐|哈尔滨|沈阳|大连|天津|郑州|济南|合肥|福州|南昌|南宁|贵阳|海口|银川|西宁|呼和浩特|石家庄|太原|兰州|香港|澳门|台北|张家界|黄山|峨眉山|新都桥)/;

/**
 * 景点 / 走廊名 → 宜住城镇（飞猪 dest_name）。
 * 未命中时返回 null，由上层用原文短地名。
 */
const LODGING_HUB_RULES: Array<{ match: RegExp; hub: string; poi?: string }> = [
  { match: /布达拉宫|大昭寺|八廓|罗布林卡|拉萨/i, hub: '拉萨', poi: '布达拉宫' },
  { match: /林芝机场|米林|鲁朗|雅鲁藏布|林芝/i, hub: '林芝' },
  { match: /波密|通麦|嘎隆拉/i, hub: '波密' },
  { match: /东达山|业拉山|怒江72拐|左贡/i, hub: '左贡' },
  { match: /芒康|如美/i, hub: '芒康' },
  { match: /巴塘/i, hub: '巴塘' },
  { match: /理塘|勒通古镇/i, hub: '理塘' },
  { match: /新都桥/i, hub: '新都桥' },
  { match: /木格措/i, hub: '康定', poi: '木格措' },
  { match: /康定|情歌/i, hub: '康定' },
  { match: /稻城|亚丁/i, hub: '稻城' },
  { match: /香格里拉|中甸/i, hub: '香格里拉' },
  { match: /九寨|黄龙/i, hub: '九寨沟' },
  { match: /兵马俑|华清宫|大雁塔|回民街/i, hub: '西安', poi: '兵马俑' },
  { match: /宽窄巷子|春熙路|太古里|双流|天府/i, hub: '成都' },
];

/**
 * 去掉 iOS/客户端拼在消息末尾的日程附录，避免污染飞猪 keyword-search。
 * 例：「成都租车，拉萨还车\n\n[日程] Day1 …」→「成都租车，拉萨还车」
 */
export function stripClientContextAppendix(message: string): string {
  return String(message ?? '')
    .replace(/\n+\s*\[(?:日程|行程|上下文|Context)\][\s\S]*$/iu, '')
    .replace(/\n+\s*Day\s*\d+[\s\S]*$/iu, '')
    .split('\n')[0]
    ?.trim() ?? '';
}

function stripNoise(raw: string): string {
  return String(raw ?? '')
    .replace(/\blodging\b/gi, ' ')
    .replace(/第\d+\s*\/\s*\d+\s*晚/g, ' ')
    .replace(/周边|附近|酒店|住宿|民宿|宾馆|旅馆|推荐|帮我|可以|吗|的|和|与/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapToLodgingHub(text: string): { hub: string; poi?: string } | null {
  const t = String(text ?? '').trim();
  if (!t) return null;
  for (const rule of LODGING_HUB_RULES) {
    if (rule.match.test(t)) {
      // 仅当文案里真出现 poi 名时带上（如「康定木格措」→ poi=木格措；纯「拉萨」不带布达拉宫）
      const poiHit =
        rule.poi &&
        new RegExp(rule.poi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(t);
      return {
        hub: rule.hub,
        ...(poiHit ? { poi: rule.poi } : {}),
      };
    }
  }
  const city = t.match(CITY_HINT_RE)?.[1];
  if (city) return { hub: city };
  return null;
}

/** 目的地/国家是否应按国内 OTA / 飞猪检索 */
export function isChinaOtaMarketLoose(input: {
  destination?: string | null;
  countryCode?: string | null;
}): boolean {
  const code = String(input.countryCode ?? '').trim().toUpperCase();
  if (code === 'CN' || code === 'CHN' || code === 'HK' || code === 'MO') return true;
  const dest = String(input.destination ?? '').trim();
  return /^(CN|CHN|China|中国)$/i.test(dest) || /中国|国内/.test(dest);
}

/**
 * 文本是否命中国内飞猪城镇/景点锚点（CITY_HINT / 走廊规则）。
 * 不含「任意 2–8 字中文」回落，避免冰岛中文地名误判为国内。
 */
export function hasChinaFliggyHubHint(
  ...texts: Array<string | null | undefined>
): boolean {
  for (const raw of texts) {
    const t = stripNoise(String(raw ?? ''));
    if (!t) continue;
    if (mapToLodgingHub(t)) return true;
  }
  return false;
}

/**
 * 解析飞猪酒店检索：dest_name（城镇）+ 可选 poi_name / key_words。
 * 优先行程锚点 / placeHint，绝不在「仅有 CN」时静默落到成都。
 */
export function resolveFliggyLodgingSearch(input: {
  destination?: string | null;
  placeHint?: string | null;
  query?: string | null;
  naturalLanguage?: string | null;
  itineraryPlaceName?: string | null;
}): FliggyLodgingSearchResolved | null {
  const ordered = [
    input.itineraryPlaceName,
    input.placeHint,
    input.naturalLanguage,
    input.query,
    input.destination,
  ]
    .map((s) => stripNoise(String(s ?? '')))
    .filter(Boolean);

  for (const c of ordered) {
    if (/^[A-Z]{2}$/i.test(c)) continue;
    if (/^(CN|CHN|China|中国)$/i.test(c)) continue;

    const hubbed = mapToLodgingHub(c);
    if (hubbed) {
      const poiFromText =
        hubbed.poi ||
        (/^[\u4e00-\u9fffA-Za-z0-9·]{2,16}$/.test(c) && c !== hubbed.hub
          ? c
          : undefined);
      return {
        destName: hubbed.hub,
        ...(poiFromText && poiFromText !== hubbed.hub
          ? { poiName: poiFromText.slice(0, 24) }
          : {}),
        keyWords: undefined,
      };
    }

    // 纯中文短地名（县城/镇）直接作 dest
    if (/^[\u4e00-\u9fff]{2,8}$/.test(c)) {
      return { destName: c };
    }

    const zhChunk = c.match(/([\u4e00-\u9fff]{2,12})/)?.[1];
    if (zhChunk) {
      const hub2 = mapToLodgingHub(zhChunk);
      if (hub2) {
        return {
          destName: hub2.hub,
          ...(zhChunk !== hub2.hub ? { poiName: zhChunk } : {}),
        };
      }
      return { destName: zhChunk };
    }
  }

  return null;
}

/** @deprecated 使用 resolveFliggyLodgingSearch；保留兼容 */
export function resolveFliggyDestName(input: {
  destination?: string | null;
  placeHint?: string | null;
  query?: string | null;
  naturalLanguage?: string | null;
}): string | null {
  return resolveFliggyLodgingSearch(input)?.destName ?? null;
}

export function resolveFliggyHotelKeywords(input: {
  query?: string | null;
  naturalLanguage?: string | null;
  placeHint?: string | null;
}): string | undefined {
  const raw = stripNoise(
    String(input.query || input.naturalLanguage || input.placeHint || ''),
  );
  if (!raw || raw.length < 2) return undefined;
  // 已是目的地短名时不必再当 keyWords（避免干扰 dest）
  if (/^[\u4e00-\u9fff]{2,8}$/.test(raw)) return undefined;
  return raw.slice(0, 40);
}
