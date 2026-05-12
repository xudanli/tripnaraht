/**
 * SafeTravel RSS `<item>` → {@link SafetravelRSSRefined}（规则优先、零臆造坐标/截止时间）。
 * LLM 增强可在此输出之上叠加，不得覆盖已确定的 severity / published_at。
 */

import type { SafetravelRSSRefined } from '../interfaces/safetravel-rss-refined.interface';
import type { SafetravelRssItemRow } from './safetravel-rss-parse.util';
import { inferAlertSeverity, stripHtmlLite } from './safetravel-rss-parse.util';

/** WGS84 十进制度数对（文本中出现时提取，否则不填） */
const COORD_PAIR_RE =
  /\b(-?\d{1,2}(?:\.\d+)?)\s*°?\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\b/;

/**
 * 从合并正文中尝试抽取「模糊截止时间」的 ISO 片段（保守：仅若干英文模式）。
 * 无法解析则返回 undefined（不把猜测写进 valid_until）。
 */
export function extractValidUntilHint(blob: string): string | undefined {
  const t = blob.replace(/\s+/g, ' ').trim();
  const isoLike = t.match(
    /\b(valid until|until|through)\b[^.]{0,120}?(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?)/i,
  );
  if (isoLike?.[2] && /^\d{4}-\d{2}-\d{2}/.test(isoLike[2])) {
    const d = Date.parse(isoLike[2]);
    if (!Number.isNaN(d)) return new Date(d).toISOString();
  }
  return undefined;
}

function extractOptionalCoordinates(blob: string): [number, number] | undefined {
  const m = blob.match(COORD_PAIR_RE);
  if (!m) return undefined;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return undefined;
  // TripNARA 冰岛域：只接受落在冰岛框内的坐标，避免把任意两个数字当经纬度
  if (lat < 61 || lat > 69 || lon < -26 || lon > -12) return undefined;
  return [lat, lon];
}

function pubDateToIso(pubDate?: string): string | undefined {
  if (!pubDate?.trim()) return undefined;
  const ms = Date.parse(pubDate.trim());
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms).toISOString();
}

const ALLOWED_REGIONS = new Set([
  'South',
  'North',
  'West',
  'East',
  'Highlands',
  'Westfjords',
  'Reykjanes',
  'Capital',
]);

/** 规则层：从英文/冰岛语地名片段提取白名单区域（无匹配则 []） */
export function inferAffectedRegionsFromText(blob: string): string[] {
  const t = blob.toLowerCase();
  const found = new Set<string>();
  if (/south\s+iceland|suðurland|sudurland|south\s+coast|south\s+shore|vík|vik\b|skógar|skogar|selfoss|kirkjubæjarklaustur/i.test(t)) {
    found.add('South');
  }
  if (/north\s+iceland|norðurland|nordurland|akureyri|húsavík|husavik|mývatn|myvatn/i.test(t)) {
    found.add('North');
  }
  if (/east\s+iceland|austurland|egilsstaðir|egilsstadir|\bhöfn\b|hornafjörður/i.test(t)) {
    found.add('East');
  }
  if (/west\s+iceland|vesturland|snæfellsnes|snaefellsnes|borgarnes|ísafjörður|isafjordur/i.test(t)) {
    found.add('West');
  }
  if (/westfjords|vestfirðir|vestfirdir|patreksfjörður|bolungarvík/i.test(t)) {
    found.add('Westfjords');
  }
  if (/highland|interior|sprengisand|kverkfjöll|askja|landmannalaugar|kerlingarfjöll|central\s+highlands/i.test(t)) {
    found.add('Highlands');
  }
  if (/reykjanes|keflavík|keflavik|grindavík|grindavik|blue\s+lagoon|reykjanes\s*peninsula/i.test(t)) {
    found.add('Reykjanes');
  }
  if (/reykjavík|reykjavik|capital\s+region|greater\s+reykjavík|hafnarfjörður|garðabær|kopavogur|kópavogur|mosfellsbær/i.test(t)) {
    found.add('Capital');
  }
  return [...found].filter((r) => ALLOWED_REGIONS.has(r));
}

export function isAllowedAffectedRegion(name: string): boolean {
  return ALLOWED_REGIONS.has(name);
}

export function refineSafetravelRssItem(row: SafetravelRssItemRow): SafetravelRSSRefined {
  const title = (row.title || '').trim();
  const body = stripHtmlLite(row.description || '');
  const blob = `${title} ${body}`.trim();
  const severity = inferAlertSeverity(blob);
  const published_at = pubDateToIso(row.pubDate);
  const valid_until = extractValidUntilHint(blob);
  const coordinates = extractOptionalCoordinates(blob);
  const affected_regions = inferAffectedRegionsFromText(blob);

  const out: SafetravelRSSRefined = {
    severity,
    title: title || '(untitled)',
    body,
  };
  if (published_at) out.published_at = published_at;
  if (valid_until) out.valid_until = valid_until;
  if (coordinates) out.coordinates = coordinates;
  if (affected_regions.length) out.affected_regions = affected_regions;
  return out;
}

export function refineSafetravelRssItems(rows: SafetravelRssItemRow[]): SafetravelRSSRefined[] {
  return rows.map(refineSafetravelRssItem);
}
