/**
 * 从 Place.metadata / 研究证据统一解析「是否有可用营业时间」。
 * 避免 VERIFY 将结构化 openingHours（osmFormat、分日字段）误判为「缺少开放时间」。
 */

import { OPENING_HOURS_UNKNOWN, isAlwaysOpenHoursText } from './opening-hours.util';

export function extractOpeningHoursFromPlaceMetadata(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  const direct = m.openingHours ?? m.opening_hours;
  if (direct != null) return direct;

  const rawTags = m.rawTags as Record<string, unknown> | undefined;
  if (rawTags?.opening_hours) {
    return { osmFormat: String(rawTags.opening_hours) };
  }

  const visit = m.visit_info as Record<string, unknown> | undefined;
  if (visit?.opening_hours != null) return visit.opening_hours;

  const basic = m.basic as Record<string, unknown> | undefined;
  if (basic?.openingHours != null) return basic.openingHours;

  return null;
}

export function hasResolvableOpeningHours(openingHours: unknown): boolean {
  if (openingHours == null) return false;
  if (typeof openingHours === 'string') {
    const s = openingHours.trim();
    if (!s || s === OPENING_HOURS_UNKNOWN) return false;
    if (/^closed$/i.test(s) || s === '休息' || s === '关闭') return true;
    return s.length >= 3;
  }
  if (Array.isArray(openingHours)) {
    return openingHours.some((row) => hasResolvableOpeningHours(row));
  }
  if (typeof openingHours === 'object') {
    const o = openingHours as Record<string, unknown>;
    if (typeof o.description === 'string' && hasResolvableOpeningHours(o.description)) return true;
    if (hasResolvableOpeningHours(o.osmFormat)) return true;
    if (hasResolvableOpeningHours(o.weekday) || hasResolvableOpeningHours(o.weekend)) return true;
    for (const key of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
      if (hasResolvableOpeningHours(o[key])) return true;
    }
    if (hasResolvableOpeningHours(o.open) && hasResolvableOpeningHours(o.close)) return true;
    if (hasResolvableOpeningHours(o.start) && hasResolvableOpeningHours(o.end)) return true;
  }
  return false;
}

/** 供 opening_hours_evidence / VERIFY 使用的展示串（优先 OSM / 分日摘要） */
export function openingHoursToEvidenceString(openingHours: unknown): string | undefined {
  if (!hasResolvableOpeningHours(openingHours)) return undefined;
  if (typeof openingHours === 'string') {
    const s = openingHours.trim();
    return isAlwaysOpenHoursText(s) ? '24 Hours' : s;
  }

  if (typeof openingHours === 'object' && openingHours != null) {
    const o = openingHours as Record<string, unknown>;
    if (typeof o.osmFormat === 'string' && o.osmFormat.trim()) {
      const osm = o.osmFormat.trim();
      return isAlwaysOpenHoursText(osm) ? '24 Hours' : osm;
    }
    const parts: string[] = [];
    for (const [k, label] of [
      ['weekday', '平日'],
      ['weekend', '周末'],
      ['mon', '周一'],
      ['tue', '周二'],
      ['wed', '周三'],
      ['thu', '周四'],
      ['fri', '周五'],
      ['sat', '周六'],
      ['sun', '周日'],
    ] as const) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) parts.push(`${label} ${v.trim()}`);
    }
    if (parts.length) return parts.join('；');
    if (typeof o.open === 'string' && typeof o.close === 'string') {
      return `${o.open}-${o.close}`;
    }
  }

  return '24 Hours';
}

export function normalizePoiIdKey(raw: unknown): string | undefined {
  const s = String(raw ?? '').trim();
  if (!s) return undefined;
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return String(Math.floor(n));
  return s;
}
