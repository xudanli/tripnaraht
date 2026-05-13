/**
 * 将 {@link SafetravelRSSRefined} 转为 `research_data.safetravel_alerts`（供 itinerary.verify 路段对齐）。
 * 启发式保守：无路段锚点时不产出条目，避免 verify 误伤。
 *
 * **区域 bundle**：仅当文本命中某宏观区域且满足「封路/路况/强天气/high+」门闩时，附加该区域下若干 `ring-road:*` ref；
 * 行程项若未打对应 `metadata.route_segment_ref` 则 verify 不会误报（refs 悬空无害）。
 */

import type { SafetravelRSSRefined } from '../../iceland-info/interfaces/safetravel-rss-refined.interface';
import type { SafetravelRouteAlertEvidence } from '../itinerary/safetravel-verify-evidence.util';

const CLOSURE_OR_HAZARD = /\b(closed|closure|impassable|blocked|unsafe|do\s+not\s+travel|extreme\s+wind|high\s+wind|difficult\s+conditions)\b/i;
const ROAD_REF = /\b(road\s*1|route\s*1|ring\s+road|hringveg|þjóðveg|highway\s*1)\b/i;
/** Yellow / 区域级文案：与 medium severity 组合可触发区域 bundle（仍为 verify WARNING） */
const STRONG_WEATHER = /\b(extreme|severe|orange|red\s*alert|yellow\s*alert|weather\s*warning|avalanche|storm|blizzard|gale)\b/i;

/**
 * ## 路段 ref 命名契约（`REGIONS_TO_SEGMENTS` ↔ 行程元数据）
 *
 * **目的**：把 SafeTravel RSS / 区域级文案里的「地理痛觉」落到可计算的 `affected_route_segment_refs[]`，
 * 与 `ItineraryItem` 上可选字段 `metadata.route_segment_ref` **字符串相等**时，`itinerary.verify` 才会对对应 leg 产生 `REACHABILITY_ISSUE`。
 *
 * ### Region key（本对象的键）
 *
 * - 键名使用 **PascalCase 宏观区划**：`North` | `East` | `South` | `West` | `Westfjords` | `Reykjanes` | `Capital`。
 * - 与 `matchSafetravelRegionKeys` 的产出一一对应：只有文本命中某区的关键词集合，才会把该区在下的 **整条 bundle** 并入同一条 alert 的 `affected_route_segment_refs`（保守多击；无 ref 的行程不受影响）。
 *
 * ### `route_segment_ref` 字符串约定
 *
 * - 命名空间前缀固定为 **`ring-road:`**，后接 **小写 kebab-case** 语义段（如 `vik-jokulsarlon`、`north-myvatn-corridor`）。
 * - **显式走廊**（Vík↔Jökulsárlón 等）与 **区域 bundle** 共用同一命名空间，便于单一字段对齐 verify 与 RSS 适配层。
 * - 新增路段时：**先**在此表或 `inferAffectedRouteSegmentRefsFromSafetravelText` 的显式规则中加入 ref，**再**在生成侧（`itinerary.generate` / `IncrementalItineraryGeneratorService` / `injectCorridorDriveLegsIntoDays`）为命中该走廊的 `DRIVE` 写入 **完全相同**的 `metadata.route_segment_ref`；禁止仅改一侧导致「预警有、行程无靶点」或「行程有 ref、RSS 永不命中」的南辕北辙。
 *
 * ### 冰岛语文本
 *
 * RSS 与地名常带 **合字 / eth（ð）** 等字符；`matchSafetravelRegionKeys` 内部对文本做 Unicode 规范化（NFD + 去组合音标）并保留显式别名（如 `norðurland`）做匹配，与「仅 ASCII」假设不可混用。
 *
 * @see `src/skills/itinerary/itinerary-verify.skill.ts` — `verifySafetravelRouteAlerts`
 * @see `src/agent/interfaces/trip-plan.interface.ts` — `metadata.route_segment_ref`
 * @see `src/skills/itinerary/itinerary-segment-tagger.util.ts` — 生成侧走廊 `DRIVE` 注入，ref 须与本表一致
 */
export const REGIONS_TO_SEGMENTS: Readonly<Record<string, readonly string[]>> = {
  North: [
    'ring-road:north-myvatn-corridor',
    'ring-road:north-akureyri-egilsstadir',
    'ring-road:north-husavik-myvatn',
  ],
  East: ['ring-road:east-egilsstadir-hofn', 'ring-road:jokulsarlon-hofn'],
  South: ['ring-road:selfoss-vik', 'ring-road:vik-jokulsarlon'],
  West: ['ring-road:west-borgarnes-ring', 'ring-road:west-snaefellsnes'],
  Westfjords: ['ring-road:westfjords-main'],
  Reykjanes: ['ring-road:reykjanes-keflavik'],
  Capital: ['ring-road:capital-selfoss'],
};

function normalizeAscii(blob: string): string {
  return blob
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 文本命中哪些宏观区域键（与 {@link REGIONS_TO_SEGMENTS} 对齐） */
export function matchSafetravelRegionKeys(blob: string): string[] {
  const t = normalizeAscii(blob);
  const keys = new Set<string>();
  if (/north\s+iceland|nordurland|norðurland|akureyri|myvatn|husavik|dettifoss|krafla|goddafoss|godafoss/i.test(t)) {
    keys.add('North');
  }
  if (/east\s+iceland|austurland|egilsstadir|seydisfjordur|\bhofn\b|hornafjordur|fjardabyggd/i.test(t)) {
    keys.add('East');
  }
  if (/south\s+iceland|sudurland|suðurland|south\s+coast|selfoss|\bvik\b|skogar|kirkjubaejarklaustur|维克|維克|冰河湖|杰古沙龙|jokulsarlon|jökulsárlón/i.test(t)) {
    keys.add('South');
  }
  if (/west\s+iceland|vesturland|borgarnes|snaefellsnes|stykkisholmur/i.test(t)) {
    keys.add('West');
  }
  if (/westfjords|vestfirdir|patreksfjordur|isafjordur|bolungarvik/i.test(t)) {
    keys.add('Westfjords');
  }
  if (/reykjanes|keflavik|grindavik|blue\s+lagoon/i.test(t)) {
    keys.add('Reykjanes');
  }
  if (/reykjavik|capital\s+region|hafnarfjordur|kopavogur|gardabaer|mosfellsbaer/i.test(t)) {
    keys.add('Capital');
  }
  return [...keys];
}

function inferRegionBundleSegmentRefs(blob: string, severity?: string): string[] {
  const t = normalizeAscii(blob);
  const sev = (severity ?? '').toString().trim().toLowerCase();
  const liftSev = sev === 'critical' || sev === 'high';
  const medium = sev === 'medium';
  const allowBundle =
    CLOSURE_OR_HAZARD.test(t) ||
    ROAD_REF.test(t) ||
    STRONG_WEATHER.test(t) ||
    liftSev;
  if (!allowBundle) return [];
  if (medium && !STRONG_WEATHER.test(t) && !CLOSURE_OR_HAZARD.test(t) && !ROAD_REF.test(t)) return [];

  const keys = matchSafetravelRegionKeys(blob);
  const out: string[] = [];
  for (const k of keys) {
    const segs = REGIONS_TO_SEGMENTS[k];
    if (segs?.length) out.push(...segs);
  }
  return out;
}

/**
 * 从 RSS 标题/正文推断 `ring-road:*` 路段 ref（与行程项 `metadata.route_segment_ref` 对齐）。
 * 1) 显式起讫点走廊；2) 宏观区域 bundle（保守）。
 */
export function inferAffectedRouteSegmentRefsFromSafetravelText(
  blob: string,
  severity?: string,
): string[] {
  const t = normalizeAscii(blob);
  if (!t) return [];

  const sev = (severity ?? '').toString().trim().toLowerCase();
  const liftSev = sev === 'critical' || sev === 'high';
  const medium = sev === 'medium';
  if (!CLOSURE_OR_HAZARD.test(t) && !ROAD_REF.test(t) && !liftSev && !(medium && STRONG_WEATHER.test(t))) {
    return [];
  }

  const refs: string[] = [];
  const has = (re: RegExp) => re.test(t);

  if (has(/\bvik\b/i) && has(/jokulsarlon|jökulsár|glacier lagoon/i)) {
    refs.push('ring-road:vik-jokulsarlon');
  }
  if (has(/jokulsarlon|jökulsár|glacier lagoon/i) && has(/\bhofn\b|hornafjordur|hornafjörður/i)) {
    refs.push('ring-road:jokulsarlon-hofn');
  }
  if (has(/\bvik\b/i) && (has(/\bselfoss\b/i) || has(/\bhvolsvollur|hvolsvöllur/i))) {
    refs.push('ring-road:selfoss-vik');
  }
  if (has(/\breykjavik\b|\brekjavik\b/i) && has(/\bselfoss\b/i)) {
    refs.push('ring-road:capital-selfoss');
  }

  refs.push(...inferRegionBundleSegmentRefs(blob, severity));

  return [...new Set(refs)];
}

function stableAlertId(r: SafetravelRSSRefined, index: number): string {
  const slug = (r.title || 'alert')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  const tail = (r.published_at || '').replace(/[:.]/g, '-').slice(0, 24);
  return `safetravel-rss-${index}-${slug}${tail ? `-${tail}` : ''}`;
}

/**
 * 将 `rss_refined[]` 转为 verify 可用的 `SafetravelRouteAlertEvidence[]`（仅含能解析出路段的项）。
 */
export function rssRefinedItemsToSafetravelRouteAlerts(
  items: SafetravelRSSRefined[] | undefined | null,
  options?: { maxAlerts?: number },
): SafetravelRouteAlertEvidence[] {
  if (!items?.length) return [];
  const max = Math.min(100, Math.max(1, options?.maxAlerts ?? 50));
  const out: SafetravelRouteAlertEvidence[] = [];
  for (let i = 0; i < items.length && out.length < max; i++) {
    const r = items[i];
    const blob = `${r.title} ${r.body}`.trim();
    const affected_route_segment_refs = inferAffectedRouteSegmentRefsFromSafetravelText(blob, r.severity);
    if (affected_route_segment_refs.length === 0) continue;
    out.push({
      id: stableAlertId(r, i),
      source: 'safetravel.is/feed',
      title: r.title,
      summary: blob,
      affected_route_segment_refs,
      severity: r.severity,
    });
  }
  return out;
}
