/**
 * SafeTravel.is RSS 2.0 轻量解析（无 XML 依赖，适配 WordPress 导出常见形态）
 */

import { AlertSeverity, AlertType, type SafetravelAlertDto } from '../dto/safetravel.dto';

export interface SafetravelRssItemRow {
  id: string;
  title: string;
  description: string;
  link?: string;
  pubDate?: string;
}

function stripCdata(inner: string): string {
  let s = inner.trim();
  if (s.startsWith('<![CDATA[')) {
    s = s.slice(9);
  }
  if (s.endsWith(']]>')) {
    s = s.slice(0, -3);
  }
  return s.trim();
}

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  if (!m?.[1]) return '';
  return stripCdata(m[1]);
}

/** 去掉常见 HTML 标签（RSS description 常为 HTML 片段） */
export function stripHtmlLite(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferAlertType(text: string): AlertType {
  const t = text.toLowerCase();
  if (/\bvolcano|eruption|magma|火山|喷发/.test(t)) return AlertType.TRAVEL;
  if (/\bf[-\s]?\d{2,4}\b|f-road|碎石|封路|road|highland|高地|涉水|river|河/.test(t)) return AlertType.ROAD;
  if (/wind|storm|snow|weather|风|雪|暴|天气/.test(t)) return AlertType.WEATHER;
  return AlertType.GENERAL;
}

export function inferAlertSeverity(text: string): AlertSeverity {
  const t = text.toLowerCase();
  if (/\bclosed\b|impassable|禁止|关闭|critical|danger|extreme|红色|紧急/.test(t)) return AlertSeverity.CRITICAL;
  if (/\bsevere\b|orange|amber|high risk|高度危险|橙色/.test(t)) return AlertSeverity.HIGH;
  if (/\bcaution\b|moderate|yellow|注意|黄色/.test(t)) return AlertSeverity.MEDIUM;
  return AlertSeverity.LOW;
}

export function extractFRoadMentions(text: string): string[] {
  const m = text.match(/\bF\d{2,4}\b/gi);
  if (!m) return [];
  return [...new Set(m.map((x) => x.toUpperCase()))];
}

/**
 * 从 RSS XML 提取 item 列表（容错：无 item 则返回空数组）
 */
export function parseSafetravelRssItems(xml: string): SafetravelRssItemRow[] {
  if (!xml || typeof xml !== 'string') return [];
  const out: SafetravelRssItemRow[] = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = extractTag(block, 'title');
    if (!title) continue;
    const description =
      extractTag(block, 'description') ||
      extractTag(block, 'content:encoded') ||
      extractTag(block, 'summary') ||
      '';
    const link = extractTag(block, 'link') || extractTag(block, 'guid');
    const pubDate = extractTag(block, 'pubDate');
    const guid = extractTag(block, 'guid') || link || `rss-${out.length}`;
    out.push({
      id: guid.slice(0, 256),
      title,
      description,
      link: link || undefined,
      pubDate: pubDate || undefined,
    });
  }
  return out;
}

export function rssRowsToSafetravelAlerts(rows: SafetravelRssItemRow[]): SafetravelAlertDto[] {
  return rows.map((r) => {
    const blob = `${r.title} ${stripHtmlLite(r.description)}`;
    return {
      id: r.id,
      title: r.title,
      description: stripHtmlLite(r.description).slice(0, 8000),
      type: inferAlertType(blob),
      severity: inferAlertSeverity(blob),
      effectiveTime: r.pubDate || new Date().toISOString(),
      expiryTime: undefined,
      regions: [],
      fRoads: extractFRoadMentions(blob),
    };
  });
}
